// Multiplayer lobby/room management: creation, joining, host migration, chat
// relay and map/start hooks. Fully separate from the always-on global world
// simulation in game-server.js - a "player" only joins a lobby once it has
// connected to the shared socket and explicitly requests createLobby/joinLobby.
import { CONFIG } from './config.js';
import { MSG } from './protocol.js';
import { isValidMapId, isMapReady, MAPS, DEFAULT_MAP_ID, SECRET_MAPS, INTRO_MAPS, TAUNT_MAPS, GUN_SPAWNS, AMMO_SPAWNS } from './maps.js';
import { GunSpawnState, SpawnPoints } from './pickups.js';
import { logger } from './logger.js';
import { CHARACTER_IDS, pickLobbyCharacter } from './characters.js';
import { findSlapTarget, findSlapEnemies, instaTouches } from './combat.js';
import { EnemySystem } from '../client/js/game/enemies.js';
import { ENEMY_DEFS, DEFAULT_ENEMY } from '../client/js/game/enemy-defs.js';
import { ProjectileSystem } from '../client/js/game/projectiles.js';
import { WEAPONS } from '../client/js/game/weapons.js';
import { BleedoutState } from './bleedout.js';
import { COSTS, costOf, reachOf, machinePos, teleportPay } from '../client/js/game/interactions.js';
import { scoreKill } from '../client/js/game/scoring.js';
import { MatchStats } from '../client/js/game/match-stats.js';
import { loadMapWorld, loadSpawnPoints } from './map-world.js';
import { RoundSystem } from '../client/js/game/rounds.js';
import { isGetMovingPhrase, isSenseBehPhrase, BEH_REPLY } from '../client/js/game/sfx.js';
import { pickEnemyKind } from '../client/js/game/enemy-defs.js';
import { PowerupDirector } from '../client/js/game/powerups.js';
import { isPerk, DEFAULT_PERK, effectivePerk, MEDIC_REVIVE_MS, SELF_REVIVE_PROTECT_S } from '../client/js/game/perks.js';
import { Taunter, BEH_NAME } from '../client/js/game/grandmaster-beh.js';
import { pickSpawn } from '../client/js/game/spawn-points.js';

const STAT_KEYS = ['gamesPlayed', 'kills', 'deaths', 'downs', 'revives', 'bestRound'];
const MAX_STAT = 1e9;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity

function generateCode(existingCodes) {
  let code;
  do {
    code = '';
    for (let i = 0; i < CONFIG.LOBBY_CODE_LENGTH; i++) {
      code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
  } while (existingCodes.has(code));
  return code;
}

export class LobbyManager {
  constructor() {
    this.lobbies = new Map();   // code -> { code, hostId, mapId, players: Map<id,{id,name,connection}> }
    this.memberOf = new Map();  // playerId -> code
    this._lastChatAt = new Map(); // playerId -> timestamp
  }

  _lobbyOf(playerId) {
    const code = this.memberOf.get(playerId);
    return code ? this.lobbies.get(code) : null;
  }

  _broadcastState(lobby) {
    const state = {
      type: MSG.LOBBY_STATE,
      code: lobby.code,
      hostId: lobby.hostId,
      mapId: lobby.mapId,
      phase: lobby.phase,
      readyNeeded: this._requiredReady(lobby),
      players: Array.from(lobby.players.values()).map((p) => ({ id: p.id, name: p.name, ready: lobby.ready.has(p.id), stats: p.stats ?? null, perk: p.perk ?? DEFAULT_PERK, char: p.char }))
    };
    for (const p of lobby.players.values()) p.connection.send(state);
  }

  _sendError(connection, message) {
    connection.send({ type: MSG.LOBBY_ERROR, message });
  }

  createLobby(player, name) {
    this.leaveLobby(player.id); // defensive: drop any prior membership

    if (typeof name === 'string' && name.trim()) player.name = name.trim().slice(0, 24);

    player.char = pickLobbyCharacter();
    const code = generateCode(new Set(this.lobbies.keys()));
    const lobby = {
      code,
      hostId: player.id,
      mapId: DEFAULT_MAP_ID,
      phase: 'lobby',          // lobby | countdown | loading | playing
      introVotes: new Set(),   // players who voted to skip the intro cutscene
      loaded: new Set(),       // player ids that finished loading the map
      ready: new Set(),        // player ids that pressed READY UP
      timers: { countdown: null, load: null },
      players: new Map([[player.id, player]])
    };
    this.lobbies.set(code, lobby);
    this.memberOf.set(player.id, code);
    logger.info(`Lobby ${code} created by player ${player.id}`);
    this._broadcastState(lobby);
  }

  joinLobby(player, name, code) {
    const normalizedCode = (code || '').trim().toUpperCase();
    const lobby = this.lobbies.get(normalizedCode);
    if (!lobby) {
      this._sendError(player.connection, 'Lobby not found.');
      return;
    }
    if (lobby.phase !== 'lobby') {
      this._sendError(player.connection, lobby.phase === 'playing'
        ? 'Game already in progress.'
        : "Game is starting - you can't join right now.");
      return;
    }
    if (lobby.players.size >= CONFIG.MAX_LOBBY_PLAYERS) {
      this._sendError(player.connection, 'Lobby is full.');
      return;
    }
    if (this.memberOf.has(player.id)) this.leaveLobby(player.id);

    if (typeof name === 'string' && name.trim()) player.name = name.trim().slice(0, 24);

    player.char = pickLobbyCharacter([...lobby.players.values()].map((p) => p.char));
    lobby.players.set(player.id, player);
    this.memberOf.set(player.id, normalizedCode);
    logger.info(`Player ${player.id} joined lobby ${normalizedCode}`);
    this._broadcastState(lobby);
  }

  leaveLobby(playerId) {
    const lobby = this._lobbyOf(playerId);
    if (!lobby) return;

    lobby.players.delete(playerId);
    this.memberOf.delete(playerId);
    this._lastChatAt.delete(playerId);
    lobby.loaded.delete(playerId);
    lobby.introVotes.delete(playerId);
    lobby.ready.delete(playerId);
    lobby.stats?.setStatus(playerId, 'left');
    lobby.bleed?.clear(playerId);
    lobby.gun?.release(playerId);

    if (lobby.players.size === 0) {
      this._clearTimers(lobby);
      this.lobbies.delete(lobby.code);
      logger.info(`Lobby ${lobby.code} closed (empty)`);
      return;
    }

    if (lobby.hostId === playerId) {
      lobby.hostId = lobby.players.keys().next().value;
      logger.info(`Lobby ${lobby.code} host migrated to player ${lobby.hostId}`);
    }
    if (lobby.phase === 'lobby') {
      this._evaluateReady(lobby);
    } else if (lobby.phase === 'countdown' && !this._thresholdMet(lobby)) {
      this._abort(lobby, 'Not enough players ready.');
    } else {
      this._broadcastState(lobby);
    }
    // A player who never finished loading may have been the last one we waited on.
    if (lobby.phase === 'loading') { this._checkAllLoaded(lobby); this._checkIntroVotes(lobby); }
  }

  setName(player, name) {
    const trimmed = (name || '').trim().slice(0, 24);
    if (!trimmed) return;
    player.name = trimmed;
    const lobby = this._lobbyOf(player.id);
    if (lobby) this._broadcastState(lobby);
  }

  // Client-reported lifetime totals: sanitized, then relayed so lobby mates can view them.
  setStats(player, raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
    const stats = {};
    for (const k of STAT_KEYS) {
      const v = Number(raw[k]);
      stats[k] = Number.isFinite(v) && v > 0 ? Math.min(MAX_STAT, Math.floor(v)) : 0;
    }
    player.stats = stats;
    const lobby = this._lobbyOf(player.id);
    if (lobby) this._broadcastState(lobby);
  }

  // Perma-perk choice: lobby phase only, so it is locked once a match starts.
  setPerk(player, perk) {
    if (!isPerk(perk)) return;
    const lobby = this._lobbyOf(player.id);
    if (lobby && lobby.phase !== 'lobby') return;
    player.perk = perk;
    if (lobby) this._broadcastState(lobby);
  }

  // Character choice: lobby phase only (locked once a match starts).
  setCharacter(player, char) {
    if (!CHARACTER_IDS.includes(char)) return;
    const lobby = this._lobbyOf(player.id);
    if (!lobby || lobby.phase !== 'lobby') return;
    player.char = char;
    this._broadcastState(lobby);
  }

  setMap(player, mapId) {
    const lobby = this._lobbyOf(player.id);
    if (!lobby) return;
    if (lobby.hostId !== player.id) {
      this._sendError(player.connection, 'Only the host can change the map.');
      return;
    }
    if (lobby.phase !== 'lobby') return;
    if (!isValidMapId(mapId)) {
      this._sendError(player.connection, 'Unknown map.');
      return;
    }
    lobby.mapId = mapId;
    lobby.ready.clear(); // everyone re-confirms the new map
    this._broadcastState(lobby);
  }

  _requiredReady(lobby) {
    return Math.max(1, Math.ceil(lobby.players.size * CONFIG.READY_THRESHOLD));
  }

  _thresholdMet(lobby) {
    return lobby.players.size > 0 && lobby.ready.size >= this._requiredReady(lobby);
  }

  setReady(player, ready) {
    const lobby = this._lobbyOf(player.id);
    if (!lobby || lobby.phase !== 'lobby') return;
    if (ready && !isMapReady(lobby.mapId)) {
      const name = MAPS.find((m) => m.id === lobby.mapId)?.name ?? 'This map';
      this._sendError(player.connection, `${name} isn't ready yet - pick another map.`);
      return;
    }
    if (ready) lobby.ready.add(player.id);
    else lobby.ready.delete(player.id);
    this._evaluateReady(lobby);
  }

  _evaluateReady(lobby) {
    if (this._thresholdMet(lobby)) this._startCountdown(lobby);
    else this._broadcastState(lobby);
  }

  _startCountdown(lobby) {
    if (!isMapReady(lobby.mapId)) { lobby.ready.clear(); this._broadcastState(lobby); return; }
    lobby.phase = 'countdown';
    lobby.loaded.clear();
    this._send(lobby, { type: MSG.COUNTDOWN, mapId: lobby.mapId, durationMs: CONFIG.COUNTDOWN_MS });
    this._broadcastState(lobby);
    logger.info(`Lobby ${lobby.code} countdown started for map ${lobby.mapId}`);
    lobby.timers.countdown = setTimeout(() => this._beginLoading(lobby), CONFIG.COUNTDOWN_MS);
  }

  _send(lobby, payload) {
    for (const p of lobby.players.values()) p.connection.send(payload);
  }

  _clearTimers(lobby) {
    clearTimeout(lobby.timers.countdown);
    clearTimeout(lobby.timers.load);
    lobby.timers.countdown = lobby.timers.load = null;
    (lobby.gunTimers || []).forEach(clearTimeout);
    lobby.gunTimers = [];
  }

  _beginLoading(lobby) {
    lobby.timers.countdown = null;
    lobby.phase = 'loading';
    lobby.loaded.clear();
    lobby.introVotes.clear();
    const characters = {};
    for (const p of lobby.players.values()) characters[p.id] = CHARACTER_IDS.includes(p.char) ? p.char : pickLobbyCharacter();
    lobby.characters = characters;
    const perks = {};
    for (const p of lobby.players.values()) perks[p.id] = effectivePerk(p.perk, 'multi');
    lobby.perks = perks;
    this._send(lobby, { type: MSG.LOAD_MAP, mapId: lobby.mapId, characters, perks });
    this._broadcastState(lobby);
    lobby.timers.load = setTimeout(() => this._abort(lobby, 'Timed out waiting for all players to load.'), CONFIG.LOAD_TIMEOUT_MS + (INTRO_MAPS.has(lobby.mapId) ? 30000 : 0));
  }

  introVote(player) {
    const lobby = this._lobbyOf(player.id);
    if (!lobby || lobby.phase !== 'loading' || !INTRO_MAPS.has(lobby.mapId)) return;
    lobby.introVotes.add(player.id);
    this._checkIntroVotes(lobby, true);
  }

  _checkIntroVotes(lobby, announce = false) {
    if (lobby.phase !== 'loading' || !INTRO_MAPS.has(lobby.mapId)) return;
    const votes = lobby.introVotes.size, total = lobby.players.size;
    if (votes >= total && total > 0) this._send(lobby, { type: MSG.INTRO_SKIP });
    else if (announce) this._send(lobby, { type: MSG.INTRO_VOTES, votes, total });
  }

  markLoaded(player) {
    const lobby = this._lobbyOf(player.id);
    if (!lobby || lobby.phase !== 'loading') return;
    lobby.loaded.add(player.id);
    this._checkAllLoaded(lobby);
  }

  _checkAllLoaded(lobby) {
    if (lobby.phase !== 'loading') return;
    for (const id of lobby.players.keys()) {
      if (!lobby.loaded.has(id)) return;
    }
    this._clearTimers(lobby);
    lobby.phase = 'playing';
    lobby.secretUsed = false;
    lobby.gun = new GunSpawnState(GUN_SPAWNS[lobby.mapId] || [], {
      radius: CONFIG.GUN_PICKUP_RADIUS, respawnMs: CONFIG.GUN_RESPAWN_MS
    });
    lobby.ammo = new SpawnPoints(AMMO_SPAWNS[lobby.mapId] || [], {
      radius: CONFIG.GUN_PICKUP_RADIUS, respawnMs: CONFIG.AMMO_RESPAWN_MS
    });
    lobby.gunTimers = [];
    lobby.world = loadMapWorld(lobby.mapId, { own: true }); // own gate state per match
    lobby.mapState = { barrierOpen: false, linked: false };
    lobby.taunter = TAUNT_MAPS.has(lobby.mapId) ? new Taunter() : null;
    lobby.enemies = new EnemySystem({ world: lobby.world, def: ENEMY_DEFS[DEFAULT_ENEMY], defs: ENEMY_DEFS });
    lobby.bullets = new ProjectileSystem();
    lobby.bleed = new BleedoutState();
    lobby.dead = new Set();
    lobby.selfRevived = new Set(); // One Man Show uses this round
    lobby.god = new Set();
    lobby.protect = new Map();     // id -> timestamp until which enemies ignore the player
    lobby.round = 1;
    lobby.spawnPoints = loadSpawnPoints(lobby.mapId, 'closed');
    lobby.rounds = new RoundSystem();
    lobby.rounds.start(lobby.players.size);
    lobby.stats = new MatchStats();
    lobby.statsSent = null;
    lobby.powerups = new PowerupDirector({ world: lobby.world });
    for (const p of lobby.players.values()) lobby.stats.register(p.id, p.name, lobby.characters?.[p.id]);
    lobby.simAt = Date.now();
    lobby.ready.clear();
    for (const p of lobby.players.values()) p.matchState = null;
    this._send(lobby, { type: MSG.MATCH_BEGIN, mapId: lobby.mapId });
    this._broadcastState(lobby);
    logger.info(`Lobby ${lobby.code} match begin on ${lobby.mapId}`);
  }

  // In-match position from a client (client-authoritative; validated then relayed).
  updatePlayerState(player, msg) {
    const lobby = this._lobbyOf(player.id);
    if (!lobby || lobby.phase !== 'playing' || lobby.dead?.has(player.id)) return;
    const num = (v, lo, hi) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
    const x = num(msg.x, -1000, 1000);
    const y = num(msg.y, -50, 200);
    const z = num(msg.z, -1000, 1000);
    const yaw = num(msg.yaw, -1e4, 1e4);
    if (x === null || y === null || z === null || yaw === null) return;
    player.matchState = { x, y, z, yaw, crouch: msg.crouch === true, away: msg.away === true };
  }

  // Downed or dead players can't act.
  _out(lobby, id) { return !!(lobby.bleed?.isDown(id) || lobby.dead?.has(id)); }

  // Gun spawn touched: server decides who gets it, then everyone hides/shows it.
  pickup(player, kind, index) {
    const lobby = this._lobbyOf(player.id);
    if (!lobby || lobby.phase !== 'playing' || !lobby.gun || !Number.isInteger(index) || this._out(lobby, player.id)) return;
    let ok = false, respawnMs;
    if (kind === 'gun') {
      ok = lobby.gun.tryTake(player.id, index, player.matchState);
      respawnMs = CONFIG.GUN_RESPAWN_MS;
    } else if (kind === 'ammo') {
      ok = lobby.gun.hasGun(player.id) && lobby.ammo.tryTake(index, player.matchState); // ammo needs a gun
      respawnMs = CONFIG.AMMO_RESPAWN_MS;
    }
    if (!ok) return;
    this._send(lobby, { type: MSG.PICKUP_TAKEN, kind, index, id: player.id });
    lobby.gunTimers.push(setTimeout(() => {
      if (lobby.phase !== 'playing') return;
      this._send(lobby, { type: MSG.PICKUP_RESPAWN, kind, index });
    }, respawnMs));
  }

  // Gun fired: validate and relay a visual bullet to everyone.
  shoot(player, msg) {
    const lobby = this._lobbyOf(player.id);
    if (!lobby || lobby.phase !== 'playing' || !lobby.gun?.hasGun(player.id) || !player.matchState || this._out(lobby, player.id)) return;
    const now = Date.now();
    if (now - (player.lastShotAt || 0) < CONFIG.SHOOT_MIN_INTERVAL_MS) return;
    const v = ['ox', 'oy', 'oz', 'dx', 'dy', 'dz'].map((k) => msg[k]);
    if (!v.every(Number.isFinite)) return;
    const [ox, oy, oz, dx, dy, dz] = v;
    const len = Math.hypot(dx, dy, dz);
    const m = player.matchState;
    if (len < 0.5 || len > 1.5 || Math.hypot(ox - m.x, oz - m.z) > 6 || Math.abs(oy - m.y) > 6) return;
    player.lastShotAt = now;
    const color = Number.isInteger(msg.color) && msg.color >= 0 && msg.color <= 0xffffff ? msg.color : null;
    const f = WEAPONS.gun.fire;
    lobby.bullets?.spawn({ origin: [ox, oy, oz], dir: [dx / len, dy / len, dz / len], speed: f.speed, range: f.range, owner: player.id });
    this._send(lobby, { type: MSG.BULLET, id: player.id, ox, oy, oz, dx: dx / len, dy: dy / len, dz: dz / len, color });
  }

  // Hand slap: pick a target near the attacker and tell the lobby (the victim's
  // client applies the knockback; movement is client-authoritative).
  slap(player) {
    const lobby = this._lobbyOf(player.id);
    if (!lobby || lobby.phase !== 'playing' || !player.matchState || this._out(lobby, player.id)) return;
    const now = Date.now();
    if (now - (player.lastSlapAt || 0) < CONFIG.SLAP_MIN_INTERVAL_MS) return;
    player.lastSlapAt = now;
    this._send(lobby, { type: MSG.SLAP_FX, id: player.id });
    const others = [...lobby.players.values()]
      .filter((p) => p.id !== player.id && p.matchState)
      .map((p) => ({ id: p.id, ...p.matchState }));
    const hit = findSlapTarget(player.matchState, others, {
      range: CONFIG.SLAP_RANGE, arcDeg: CONFIG.SLAP_ARC_DEG, maxDy: CONFIG.SLAP_MAX_DY
    });
    const m = { range: CONFIG.SLAP_RANGE, arcDeg: CONFIG.SLAP_ARC_DEG };
    for (const t of findSlapEnemies(player.matchState, lobby.enemies.targets(), m)) { if (lobby.enemies.kill(t.id)) { lobby.stats.kill(player.id); scoreKill(lobby.stats, player.id, 'slap', lobby.powerups?.dbl > 0); } }
    if (!hit) return;
    this._send(lobby, { type: MSG.KNOCKBACK, targetId: hit.target.id, fromId: player.id, dx: hit.dx, dz: hit.dz });
  }

  // Secret song: allowed once per match, for the first player to ask.
  secret(player) {
    const lobby = this._lobbyOf(player.id);
    if (!lobby || lobby.phase !== 'playing' || lobby.secretUsed || !SECRET_MAPS.has(lobby.mapId)) return;
    lobby.secretUsed = true;
    this._send(lobby, { type: MSG.SECRET_SONG, id: player.id, name: player.name });
    logger.info(`Lobby ${lobby.code} secret song triggered by ${player.id}`);
  }

  // Touched a powerup orb: the director validates range / round lock; nuke is resolved here.
  powerupPickup(player, id) {
    const lobby = this._lobbyOf(player.id);
    if (!lobby || lobby.phase !== 'playing' || !lobby.powerups || !Number.isInteger(id) || this._out(lobby, player.id)) return;
    const kind = lobby.powerups.pickup(player.id, id, player.matchState, { radius: CONFIG.GUN_PICKUP_RADIUS });
    if (kind === 'nuke') {
      lobby.enemies.killAll({ drops: false });
      for (const ev of lobby.rounds.skip()) this._send(lobby, { type: MSG.ROUND_EVENT, event: 'end', round: ev.round, nextMs: ev.nextMs });
    }
    this._flushPowerups(lobby);
  }

  // Turns director events into wire messages (drops/picks/buffs, Lyric bullets and chat).
  _flushPowerups(lobby) {
    for (const ev of lobby.powerups.drain()) {
      if (ev.event === 'chat') {
        this._send(lobby, { type: MSG.LOBBY_CHAT, id: 'lyric', name: ev.name, text: ev.text, ts: Date.now() });
      } else if (ev.event === 'lyricFire') {
        const f = WEAPONS.gun.fire;
        lobby.bullets.spawn({ origin: ev.origin, dir: ev.dir, speed: f.speed, range: f.range, owner: 'lyric' });
        this._send(lobby, { type: MSG.BULLET, id: 'lyric', ox: ev.origin[0], oy: ev.origin[1], oz: ev.origin[2], dx: ev.dir[0], dy: ev.dir[1], dz: ev.dir[2] });
      } else {
        const msg = { type: MSG.POWERUP_EVENT, ...ev };
        if (ev.event === 'picked') msg.name = lobby.players.get(ev.playerId)?.name ?? 'Someone';
        this._send(lobby, msg);
      }
    }
  }

  // Debug: spawn an enemy at a position (any lobby member, while playing).
  devSpawnEnemy(player, msg) {
    const lobby = this._lobbyOf(player.id);
    if (!lobby || lobby.phase !== 'playing' || !lobby.enemies) return;
    if (lobby.enemies.count >= CONFIG.MAX_ENEMIES) return;
    const x = Number(msg.x), y = Number(msg.y), z = Number(msg.z);
    if (![x, y, z].every(Number.isFinite) || Math.abs(x) > 1000 || Math.abs(z) > 1000 || Math.abs(y) > 200) return;
    lobby.enemies.spawn(x, y, z, 0, msg.kind === 'meh' ? 'meh' : 'beh');
  }

  // Priced machines: validate range + points, charge, and run the shared-state part (spin, barrier, link).
  interact(player, kind) {
    const lobby = this._lobbyOf(player.id);
    if (!lobby || lobby.phase !== 'playing' || !lobby.stats || !player.matchState || this._out(lobby, player.id)) return;
    const at = Object.hasOwn(COSTS, kind) ? machinePos(lobby.mapId, kind) : null;
    const cost = at ? costOf(lobby.mapId, kind) : COSTS[kind];
    const reply = (ok, reason) => player.connection.send({ type: MSG.INTERACT_RESULT, kind, ok, reason, cost });
    if (!at) return reply(false, 'unavailable');
    const m = player.matchState;
    if (Math.hypot(m.x - at[0], m.z - at[2]) > reachOf(kind) || Math.abs(m.y - at[1]) > 3) return reply(false, 'range');
    const st = lobby.mapState ?? (lobby.mapState = { barrierOpen: false, linked: false });
    if (kind === 'teleporter') {
      const points = lobby.stats.rows().find((r) => r.id === player.id)?.points ?? 0;
      const pay = teleportPay(points, lobby.gun.hasGun(player.id));
      if (pay === 'points') lobby.stats.spendPoints(player.id, COSTS.teleporter);
      else if (pay === 'gun') {
        lobby.gun.release(player.id);
        this._send(lobby, { type: MSG.PLAYER_EVENT, event: 'gunLost', id: player.id });
      }
      return reply(true);
    }
    if (kind === 'tpA' || kind === 'tpB') {
      if (!st.linked) {
        if (kind === 'tpA') return reply(false, 'notLinked');
        st.linked = true; // linking at B is free and shared by the team
        this._send(lobby, { type: MSG.MAP_EVENT, event: 'linked' });
        return reply(true, 'linked');
      }
      if (!lobby.stats.spendPoints(player.id, cost)) return reply(false, 'points');
      return reply(true);
    }
    if (kind === 'barrier') {
      if (st.barrierOpen) return reply(false, 'already');
      if (!lobby.stats.spendPoints(player.id, cost)) return reply(false, 'points');
      st.barrierOpen = true;
      lobby.world?.setGateOpen?.(true);
      lobby.spawnPoints = loadSpawnPoints(lobby.mapId, 'open');
      this._send(lobby, { type: MSG.MAP_EVENT, event: 'barrier' });
      return reply(true);
    }
    if (!lobby.stats.spendPoints(player.id, cost)) return reply(false, 'points');
    if (kind === 'spin' || kind === 'lyricMachine') {
      lobby.powerups.spin({ x: at[0], y: at[1], z: at[2] }, m, kind === 'lyricMachine' ? 'lyric' : null);
      this._flushPowerups(lobby);
    }
    reply(true);
  }

  // Debug: enemies ignore this player while god mode is on.
  devGod(player, on) {
    const lobby = this._lobbyOf(player.id);
    if (!lobby || lobby.phase !== 'playing' || !lobby.god) return;
    if (on) lobby.god.add(player.id); else lobby.god.delete(player.id);
  }

  // Holding the revive key next to a downed player (sent ~10x/s).
  revive(player, targetId) {
    const lobby = this._lobbyOf(player.id);
    const target = lobby?.players.get(targetId);
    if (!lobby || lobby.phase !== 'playing' || !lobby.bleed || lobby.dead.has(player.id) || !target || !player.matchState || !target.matchState) return;
    const a = player.matchState, b = target.matchState;
    const near = Math.hypot(a.x - b.x, a.z - b.z) <= CONFIG.REVIVE_RANGE && Math.abs(a.y - b.y) < 2.5;
    if (lobby.bleed.revive(player.id, targetId, Date.now(), near, lobby.perks?.[player.id] === 'medic' ? MEDIC_REVIVE_MS : undefined)) {
      lobby.stats.revive(player.id);
      lobby.stats.setStatus(targetId, 'alive');
      this._send(lobby, { type: MSG.PLAYER_EVENT, event: 'revived', id: targetId });
    }
  }

  // One Man Show: stand yourself up once per round while downed.
  selfRevive(player) {
    const lobby = this._lobbyOf(player.id);
    if (!lobby || lobby.phase !== 'playing' || !lobby.bleed || lobby.perks?.[player.id] !== 'oneman') return;
    if (lobby.dead.has(player.id) || !lobby.bleed.isDown(player.id) || lobby.selfRevived.has(player.id)) return;
    lobby.selfRevived.add(player.id);
    lobby.bleed.clear(player.id);
    lobby.protect.set(player.id, Date.now() + SELF_REVIVE_PROTECT_S * 1000);
    lobby.stats.setStatus(player.id, 'alive');
    this._send(lobby, { type: MSG.PLAYER_EVENT, event: 'revived', id: player.id, self: true });
  }

  // Round progression: spawn this round's enemies, announce rounds, respawn the dead.
  _runRounds(lobby, dt) {
    const events = lobby.rounds.update(dt, { playerCount: lobby.players.size, liveEnemies: lobby.enemies.liveCount });
    for (const ev of events) {
      if (ev.event === 'roundStart') lobby.selfRevived.clear();
      if (ev.event === 'spawn') {
        const avoid = [...lobby.players.values()].filter((p) => p.matchState && !lobby.dead.has(p.id)).map((p) => p.matchState);
        avoid.push(...lobby.enemies.list.filter((e) => e.state !== 'dying'));
        const pt = pickSpawn(lobby.spawnPoints || [], Math.random, avoid);
        if (pt) lobby.enemies.spawn(pt.x, pt.y, pt.z, 0, pickEnemyKind(lobby.rounds.round, Math.random));
      } else if (ev.event === 'roundStart') {
        lobby.round = ev.round;
        this._beh(lobby, 'round', ev.round);
        for (const id of [...lobby.dead]) {
          lobby.dead.delete(id);
          lobby.stats.setStatus(id, 'alive');
          this._send(lobby, { type: MSG.PLAYER_EVENT, event: 'respawn', id });
        }
        this._send(lobby, { type: MSG.ROUND_EVENT, event: 'start', round: ev.round, total: ev.total });
      } else if (ev.event === 'roundEnd') {
        this._send(lobby, { type: MSG.ROUND_EVENT, event: 'end', round: ev.round, nextMs: ev.nextMs });
      }
    }
  }

  // Enemies, bullets and bleedout for one playing lobby.
  _simulate(lobby) {
    const now = Date.now();
    const dt = Math.min(0.25, Math.max(0, (now - (lobby.simAt || now)) / 1000));
    lobby.simAt = now;
    this._runRounds(lobby, dt);
    this._beh(lobby, 'tick', dt);
    for (const h of lobby.bullets.step(dt, lobby.world, lobby.enemies.targets())) {
      if (h.kind === 'enemy' && lobby.enemies.kill(h.id)) { lobby.stats.kill(h.owner); scoreKill(lobby.stats, h.owner, 'gun', lobby.powerups?.dbl > 0); }
    }
    const players = [];
    for (const p of lobby.players.values()) {
      if (p.matchState && !lobby.dead.has(p.id)) players.push({ id: p.id, x: p.matchState.x, y: p.matchState.y, z: p.matchState.z, down: lobby.bleed.isDown(p.id) || lobby.god.has(p.id) || (lobby.protect.get(p.id) ?? 0) > now });
    }
    for (const [id] of lobby.powerups?.insta ?? []) { // Insta-Beh: touching kills
      const p = players.find((q) => q.id === id);
      if (!p || p.down) continue;
      for (const tid of instaTouches(p, lobby.enemies.targets())) {
        if (lobby.enemies.kill(tid)) { lobby.stats.kill(id); scoreKill(lobby.stats, id, 'insta', lobby.powerups.dbl > 0); }
      }
    }
    for (const e of lobby.enemies.update(dt, players)) {
      this._send(lobby, { type: MSG.ENEMY_EVENT, ...e });
      if (e.event === 'die' && e.drop !== false) lobby.powerups?.onEnemyDown(e);
      if (e.event === 'attack' && e.targetId !== null) { // Meh touch: always down (a held gun is dropped first)
        const id = e.targetId;
        if (lobby.bleed.isDown(id) || lobby.dead.has(id) || !lobby.players.has(id)) continue;
        if (lobby.gun.hasGun(id)) {
          lobby.gun.release(id);
          this._send(lobby, { type: MSG.PLAYER_EVENT, event: 'gunLost', id });
        }
        lobby.bleed.down(id, now);
        lobby.stats.down(id);
        this._send(lobby, { type: MSG.PLAYER_EVENT, event: 'down', id });
        this._beh(lobby, 'down', lobby.players.get(id)?.name ?? 'Gladiator');
        continue;
      }
      if (e.event !== 'dehd' || e.targetId === null) continue;
      if (lobby.gun.hasGun(e.targetId)) {
        lobby.gun.release(e.targetId);
        this._send(lobby, { type: MSG.PLAYER_EVENT, event: 'gunLost', id: e.targetId });
      } else {
        lobby.bleed.down(e.targetId, now);
        lobby.stats.down(e.targetId);
        this._send(lobby, { type: MSG.PLAYER_EVENT, event: 'down', id: e.targetId });
        this._beh(lobby, 'down', lobby.players.get(e.targetId)?.name ?? 'Gladiator');
      }
    }
    if (lobby.powerups) {
      lobby.powerups.update(dt, players, lobby.enemies.targets());
      this._flushPowerups(lobby);
    }
    for (const id of lobby.bleed.expired(now)) {
      lobby.dead.add(id);
      lobby.stats.setStatus(id, 'dead');
      lobby.gun.release(id);
      const dp = lobby.players.get(id);
      if (dp) dp.matchState = null;
      this._send(lobby, { type: MSG.PLAYER_EVENT, event: 'dead', id });
    }
    const alive = [...lobby.players.keys()].filter((id) => !lobby.dead.has(id));
    if (alive.every((id) => lobby.bleed.isDown(id))) this._gameOver(lobby);
  }

  // Grandmaster Beh chat line for taunt maps: kind 'tick' (dt) | 'round' | 'down' | 'over'.
  _beh(lobby, kind, arg) {
    const t = lobby.taunter;
    if (!t) return;
    const text = kind === 'tick' ? t.update(arg) : kind === 'round' ? t.onRound(arg) : kind === 'down' ? t.onDown(arg) : t.onGameOver();
    if (text) this._send(lobby, { type: MSG.LOBBY_CHAT, id: 'beh', name: BEH_NAME, text, ts: Date.now() });
  }

  // Everyone left standing is down: stop the match and send the leaderboard.
  _gameOver(lobby) {
    this._clearTimers(lobby);
    this._beh(lobby, 'over');
    // Everyone still downed at the wipe counts as a death.
    for (const id of lobby.players.keys()) if (lobby.bleed?.isDown(id)) lobby.stats.setStatus(id, 'dead');
    this._send(lobby, { type: MSG.GAME_OVER, round: lobby.rounds.round, players: lobby.stats.rows() });
    logger.info('Lobby ' + lobby.code + ' game over');
    // Everyone returns to this same lobby (map, host, code kept) once their game-over screen ends.
    lobby.phase = 'lobby';
    lobby.loaded.clear();
    lobby.ready.clear();
    this._broadcastState(lobby);
  }

  broadcastMatchStates(tick) {
    for (const lobby of [...this.lobbies.values()]) {
      if (lobby.phase !== 'playing' || !lobby.enemies) continue;
      this._simulate(lobby);
      if (!this.lobbies.has(lobby.code)) continue;
      const players = [];
      for (const p of lobby.players.values()) {
        if (p.matchState) players.push({ id: p.id, ...p.matchState, down: lobby.bleed.isDown(p.id) });
      }
      const msg = { type: MSG.MATCH_STATE, tick, players, enemies: lobby.enemies.snapshot(), round: lobby.rounds.state(lobby.enemies.liveCount), npc: lobby.powerups?.lyric?.snapshot() ?? null };
      if (lobby.stats && lobby.statsSent !== lobby.stats.version) { // live per-player stats, only when changed
        msg.stats = lobby.stats.rows();
        lobby.statsSent = lobby.stats.version;
      }
      this._send(lobby, msg);
    }
  }

  _abort(lobby, reason) {
    this._clearTimers(lobby);
    lobby.phase = 'lobby';
    lobby.loaded.clear();
    lobby.ready.clear();
    this._send(lobby, { type: MSG.MATCH_ABORTED, reason });
    this._broadcastState(lobby);
    logger.warn(`Lobby ${lobby.code} match aborted: ${reason}`);
  }

  chat(player, text) {
    const lobby = this._lobbyOf(player.id);
    if (!lobby) return;
    const now = Date.now();
    const last = this._lastChatAt.get(player.id) || 0;
    if (now - last < CONFIG.CHAT_MIN_INTERVAL_MS) return;
    this._lastChatAt.set(player.id, now);

    const trimmed = (text || '').toString().trim().slice(0, CONFIG.CHAT_MAX_LENGTH);
    if (!trimmed) return;

    const payload = { type: MSG.LOBBY_CHAT, id: player.id, name: player.name, text: trimmed, ts: now };
    for (const p of lobby.players.values()) p.connection.send(payload);
    if (isSenseBehPhrase(trimmed)) this._send(lobby, { type: MSG.LOBBY_CHAT, id: 'beh', name: 'Beh', text: BEH_REPLY, ts: Date.now() });
    if (isGetMovingPhrase(trimmed)) this._send(lobby, { type: MSG.CHAT_SFX, sound: 'getMoving', id: player.id });
  }

  onDisconnect(playerId) {
    this.leaveLobby(playerId);
  }
}
