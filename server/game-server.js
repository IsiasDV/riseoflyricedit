// Connection manager and fixed-tick game loop placeholder.
// No gameplay logic lives here yet - just the scaffolding: player registry,
// a deterministic tick loop, and snapshot broadcasting so the client can
// render other connected players as placeholders.
import { CONFIG } from './config.js';
import { MSG } from './protocol.js';
import { logger } from './logger.js';
import { LobbyManager } from './lobby-manager.js';

let nextPlayerId = 1;

export class GameServer {
  constructor(wsServer) {
    this.wsServer = wsServer;
    this.players = new Map(); // id -> { id, name, connection, x, y, z, ry, lastInput }
    this.tick = 0;
    this.lobbies = new LobbyManager();

    this.wsServer.on('connection', (connection) => this._onConnection(connection));

    this._tickInterval = setInterval(() => this._onTick(), 1000 / CONFIG.TICK_RATE_HZ);
    this._heartbeatInterval = setInterval(() => this._onHeartbeat(), CONFIG.HEARTBEAT_INTERVAL_MS);
  }

  _onConnection(connection) {
    if (this.players.size >= CONFIG.MAX_PLAYERS) {
      connection.send({ type: 'error', message: 'Server full' });
      connection.close();
      return;
    }

    const id = nextPlayerId++;
    const player = {
      id,
      name: `Player${id}`,
      connection,
      x: 0, y: 0, z: 0, ry: 0,
      lastInput: null
    };

    this.players.set(id, player);
    logger.info(`Player ${id} connected (${this.players.size}/${CONFIG.MAX_PLAYERS})`);

    connection.send({ type: MSG.WELCOME, id, tickRate: CONFIG.TICK_RATE_HZ });

    for (const other of this.players.values()) {
      if (other.id !== id) {
        connection.send({ type: MSG.PLAYER_JOIN, id: other.id, name: other.name });
      }
    }
    this._broadcast({ type: MSG.PLAYER_JOIN, id, name: player.name }, id);

    connection.on('message', (raw) => this._onMessage(player, raw));
    connection.on('close', () => this._onDisconnect(id));
    connection.on('error', () => this._onDisconnect(id));
  }

  _onMessage(player, raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    try {
      this._dispatch(player, msg);
    } catch (err) {
      logger.error(`Error handling message "${msg && msg.type}" from player ${player.id}:`, err && err.stack ? err.stack : err);
    }
  }

  _dispatch(player, msg) {
    switch (msg.type) {
      case MSG.HELLO:
        if (typeof msg.name === 'string' && msg.name.trim()) {
          player.name = msg.name.trim().slice(0, 24);
        }
        if (msg.stats !== undefined) this.lobbies.setStats(player, msg.stats);
        if (msg.perk !== undefined) this.lobbies.setPerk(player, msg.perk);
        break;
      case MSG.SET_STATS:
        this.lobbies.setStats(player, msg.stats);
        break;
      case MSG.SET_CHARACTER:
        this.lobbies.setCharacter(player, msg.char);
        break;
      case MSG.SET_PERK:
        this.lobbies.setPerk(player, msg.perk);
        break;
      case MSG.SELF_REVIVE:
        this.lobbies.selfRevive(player);
        break;
      case MSG.INPUT:
        player.lastInput = msg;
        break;
      case MSG.PONG:
        player.alive = true;
        break;
      case MSG.CREATE_LOBBY:
        this.lobbies.createLobby(player, msg.name);
        break;
      case MSG.JOIN_LOBBY:
        this.lobbies.joinLobby(player, msg.name, msg.code);
        break;
      case MSG.LEAVE_LOBBY:
        this.lobbies.leaveLobby(player.id);
        break;
      case MSG.SET_NAME:
        this.lobbies.setName(player, msg.name);
        break;
      case MSG.SET_MAP:
        this.lobbies.setMap(player, msg.mapId);
        break;
      case MSG.SET_READY:
        this.lobbies.setReady(player, msg.ready === true);
        break;
      case MSG.PLAYER_STATE:
        this.lobbies.updatePlayerState(player, msg);
        break;
      case MSG.INTRO_SKIP:
        this.lobbies.introVote(player);
        break;
      case MSG.MAP_LOADED:
        this.lobbies.markLoaded(player);
        break;
      case MSG.PICKUP:
        this.lobbies.pickup(player, msg.kind, msg.index);
        break;
      case MSG.SHOOT:
        this.lobbies.shoot(player, msg);
        break;
      case MSG.POWERUP_PICKUP:
        this.lobbies.powerupPickup(player, msg.id);
        break;
      case MSG.SLAP:
        this.lobbies.slap(player);
        break;
      case MSG.DEV_SPAWN_ENEMY:
        this.lobbies.devSpawnEnemy(player, msg);
        break;
      case MSG.INTERACT:
        this.lobbies.interact(player, msg.kind);
        break;
      case MSG.DEV_GOD:
        this.lobbies.devGod(player, msg.on);
        break;
      case MSG.REVIVE:
        this.lobbies.revive(player, msg.targetId);
        break;
      case MSG.SECRET:
        this.lobbies.secret(player);
        break;
      case MSG.CHAT:
        this.lobbies.chat(player, msg.text);
        break;
      default:
        break;
    }
  }

  _onDisconnect(id) {
    if (!this.players.has(id)) return;
    this.lobbies.onDisconnect(id);
    this.players.delete(id);
    logger.info(`Player ${id} disconnected (${this.players.size}/${CONFIG.MAX_PLAYERS})`);
    this._broadcast({ type: MSG.PLAYER_LEAVE, id });
  }

  _onTick() {
    try {
      this._tickOnce();
    } catch (err) {
      logger.error('Tick error:', err && err.stack ? err.stack : err);
    }
  }

  _tickOnce() {
    this.tick++;
    // Placeholder simulation step: no movement/physics yet, just echo state.
    const snapshot = {
      type: MSG.SNAPSHOT,
      tick: this.tick,
      players: Array.from(this.players.values()).map((p) => ({
        id: p.id, name: p.name, x: p.x, y: p.y, z: p.z, ry: p.ry
      }))
    };
    this._broadcast(snapshot);
    this.lobbies.broadcastMatchStates(this.tick);
  }

  _onHeartbeat() {
    for (const player of this.players.values()) {
      player.connection.ping();
    }
  }

  _broadcast(message, excludeId = null) {
    const data = JSON.stringify(message);
    for (const player of this.players.values()) {
      if (player.id !== excludeId) {
        player.connection.send(data);
      }
    }
  }

  shutdown() {
    clearInterval(this._tickInterval);
    clearInterval(this._heartbeatInterval);
  }
}
