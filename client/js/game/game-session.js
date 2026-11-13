// Orchestrates a match from START GAME to gameplay:
//   countdown -> loading (waits for every player) -> black cut -> fade in -> playing
// Multiplayer is server-driven (net:countdown / loadMap / matchBegin / matchAborted);
// singleplayer runs the same steps locally. Also owns the pause menu and exit.
import { events } from '../core/events.js';
import { CLIENT_CONFIG } from '../core/config.js';
import { loadAssets, playAudio } from '../core/assets.js';
import { getMap } from '../maps/maps.js';
import { MatchScreens } from '../ui/match-screens.js';
import { PauseMenu } from '../ui/pause-menu.js';
import { FreeLook } from './free-look.js';
import { PlayerController } from './player-controller.js';
import { bgm } from '../ui/bgm.js';
import { DevConsole } from '../ui/console.js';
import { Scoreboard } from '../ui/scoreboard.js';
import { CodeDetector, KEY_CODE, PAD_CODE } from './secret-code.js';
import { WeaponController } from './weapon-controller.js';
import { WEAPONS } from './weapons.js';
import { ProjectileSystem } from './projectiles.js';
import { PickupState } from './pickups.js';
import { BulletRenderer } from '../render/bullets.js';
import { GameChat } from '../ui/game-chat.js';
import { computeAway } from './away.js';
import { PlayerState } from './player-state.js';
import { Hud } from '../ui/hud.js';
import { profile } from '../state/profile.js';
import { Taunter, BEH_NAME } from './grandmaster-beh.js';
import { settings, gameVolume } from '../state/settings.js';
import { SFX, sfxManifest } from './sfx.js';
import { PowerupDirector, POWERUPS } from './powerups.js';
import { PointsHud } from '../ui/points-hud.js';
import { scoreKill, pointsEntries, matchPlayerIds } from './scoring.js';
import { instaTouches } from './combat.js';
import { teleportPay } from './interactions.js';
import { nextBulletColor, colorName } from '../maps/props.js';
import { effectivePerk, SPEED_PERK_MULT, MEDIC_REVIVE_MS, SELF_REVIVE_PROTECT_S, PERKS } from './perks.js';
import { LYRIC_MS } from './lyric.js';
import { Announcer, announcerManifest } from './announcer.js';
import { PowerupRenderer } from '../render/powerups.js';
import { PowerupHud } from '../ui/powerup-hud.js';
import { HeadBob } from './head-bob.js';
import { Haptics } from '../input/haptics.js';
import { Viewmodel } from '../render/viewmodel.js';
import { STARTING_WEAPON, weaponManifest } from './weapons.js';
import { RemotePlayers } from './remote-players.js';
import { randomCharacterId, randomStartSfx, pickSfx, characterManifest } from './characters.js';
import { EnemySystem } from './enemies.js';
import { ENEMY_DEFS, DEFAULT_ENEMY, enemyManifest, pickEnemyKind } from './enemy-defs.js';
import { findSlapEnemies } from './combat.js';
import { EnemyRenderer } from '../render/enemies.js';
import { SpatialAudio } from '../render/spatial-audio.js';
import { CinematicCamera } from './cinematic.js';
import { MatchStats } from './match-stats.js';
import { GameOverScreen } from '../ui/game-over.js';
import { CHARACTERS } from './characters.js';
import { RoundSystem } from './rounds.js';
import { buildSpawnPoints, pickSpawn } from './spawn-points.js';
import { MAP_DATA } from '../maps/map-data.js';
import { RoundBanner } from '../ui/round-banner.js';

const GAME_OVER_MS = 10000;

const ENEMY = ENEMY_DEFS[DEFAULT_ENEMY];
const DOWN_MS = 30000;
const REVIVE_MS = 5000;
const REVIVE_REACH = 2.2;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const MIN_LOADING_MS = Math.max(5000, CLIENT_CONFIG.MIN_LOADING_MS); // hardcoded 5s floor
const SECRET_PAD_BUTTONS = [12, 13, 14, 15, 1, 0, 9, 8];
const SECRET_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
// Singleplayer pickup tuning (server mirrors these in CONFIG for multiplayer).
const PICKUPS = { gun: { respawnMs: 30000 }, ammo: { respawnMs: 30000, amount: 10 } };
const GUN_TOUCH_RADIUS = 1.1;
const nextFrame = () => new Promise((r) => requestAnimationFrame(r));

const VOICE_VOLUME = 1.0; // other players' voice lines (spatial)

export class GameSession {
  constructor({ network, lobby, renderer, camera, input, canvas, ui }) {
    this.ui = ui;
    this.network = network;
    this.lobby = lobby;
    this.renderer = renderer;
    this.camera = camera;
    this.canvas = canvas;
    this.input = input;
    this.controller = new PlayerController();
    this.remotes = null;
    this._sendAcc = 0;
    this.screens = new MatchScreens();
    this.look = new FreeLook(camera, input);
    this.pause = new PauseMenu({
      onResume: () => this._resume(),
      onExit: () => this.exit(),
      canPause: () => this.state === 'playing' && !this.console.isOpen && !this.chat.isOpen
    });
    this.console = new DevConsole({
      canvas,
      input,
      canOpen: () => this.state === 'playing' && !this.pause.isOpen && !this.chat.isOpen,
      commands: this._commands()
    });
    this.chat = new GameChat({
      canvas, input, network,
      canOpen: () => this.state === 'playing' && this.lobby.mode === 'multi' && !this.pause.isOpen && !this.console.isOpen
    });
    this.chat.onChange = () => this._sendStateNow();
    this._lastAway = false;
    const awayEvent = () => this._sendStateNow();
    window.addEventListener('blur', awayEvent);
    window.addEventListener('focus', awayEvent);
    document.addEventListener('visibilitychange', awayEvent);

    this.state = 'idle'; // idle | countdown | loading | black | playing
    this.level = null;        // active level { scene, spawn, update, dispose }
    this.pendingLevel = null; // built during loading, activated on begin
    this._run = 0;            // token: bumping it cancels in-flight async steps
    this._home = camera.position.clone();

    events.on('lobby:start', (e) => this._onStart(e));
    events.on('net:countdown', (m) => this._onCountdownMsg(m));
    events.on('net:loadMap', (m) => this._onLoadMsg(m));
    events.on('net:matchBegin', () => this._onBeginMsg());
    events.on('net:matchState', (m) => this._onMatchState(m));
    events.on('net:enemyEvent', (m) => this._onEnemyEvent(m));
    events.on('net:playerEvent', (m) => this._onPlayerEvent(m));
    events.on('net:roundEvent', (m) => this._onRoundEvent(m));
    events.on('net:gameOver', (m) => this._gameOver(m.players, m.round));
    events.on('net:matchAborted', (m) => this._abort(m.reason));
    events.on('lobby:back', () => this.teardown());
    events.on('net:secretSong', () => this._onSecretSong());
    events.on('net:introVotes', (m) => this.screens.intro.setVotes(m.votes, m.total));
    events.on('net:introSkip', () => this.screens.intro.forceSkip());

    this.weaponCtl = new WeaponController();
    events.on('net:knockback', (m) => this._onKnockback(m));
    events.on('net:pickupTaken', (m) => this._onPickupTaken(m));
    events.on('net:pickupRespawn', (m) => this._spawnsOf(m.kind)?.[m.index]?.setActive(true));
    events.on('net:bullet', (m) => this._onBullet(m));
    this.bob = new HeadBob();
    this.haptics = new Haptics(() => input.gamepad);
    this._blur = { dx: 0, dy: 0, zoom: 0 };
    this._prevYaw = 0; this._prevPitch = 0; this._prevOnGround = true; this._prevVy = 0;
    this.pdirector = null;    // local PowerupDirector (singleplayer only; the server owns it in multiplayer)
    this.puRender = null;
    this.lyricView = null;
    this._lyricSnap = null;
    this.buffs = new Set();   // active timed powerup kinds for the local player
    this.pointsHud = new PointsHud();
    this._puAskAt = 0;
    this.puHud = new PowerupHud();
    this.announcer = new Announcer((url) => this.assets?.audio?.[url] ?? null);
    events.on('net:powerupEvent', (m) => this._onPowerupEvent(m));
    events.on('net:interactResult', (m) => this._onInteractResult(m));
    events.on('net:mapEvent', (m) => this._applyMapEvent(m));
    events.on('net:slapFx', (m) => this._onSlapFx(m));
    events.on('net:chatSfx', (m) => this._onChatSfx(m));
    events.on('settings:changed', (m) => { if (m?.key === 'volume') this._applyVolume(); this._syncClassic(); });
    this.classicAudio = null;
    this._chatAudio = null;
    this.projectiles = new ProjectileSystem();
    this.bullets = null;
    this.audio3d = new SpatialAudio();
    this.enemies = null;      // local EnemySystem (singleplayer only; the server owns them in multiplayer)
    this.enemyView = null;
    this._enemyTargets = [];  // multiplayer: hit spheres from the last snapshot (cosmetic bullet stop)
    this._reviveHold = 0;
    this._reviveSendAt = 0;
    this.bulletColor = null;  // Ungaland color machine: null = default bullets
    this._tpT = 0;            // teleport animation timer (s); input frozen while > 0
    this._tpDone = false;
    this._tpTo = null;
    this._interactAt = 0;
    this.gameOverUI = new GameOverScreen();
    this.rounds = null;       // local RoundSystem (singleplayer only)
    this.spawnPoints = [];
    this.roundBanner = new RoundBanner();
    this._leftEl = document.getElementById('hud-left');
    this.rounds = null;
    this.roundBanner.hide();
    this._leftEl.textContent = '';
    this.soloStats = new MatchStats();
    this._liveRows = [];
    this._matchActive = false;
    this.cine = null;
    this.spectating = false;
    this._specId = null;
    this._specEl = document.getElementById('spectate-label');
    this.downUntil = 0;
    this._downEl = document.getElementById('down-banner');
    this._downTime = document.getElementById('down-time');
    this._downSelf = document.getElementById('down-self');
    this._promptEl = document.getElementById('interact-prompt');
    this._tpEl = document.getElementById('teleport-fx');
    this._reviveEl = document.getElementById('revive-bar');
    this._reviveFill = document.getElementById('revive-fill');
    this.pickups = { gun: new PickupState(0, PICKUPS.gun.respawnMs), ammo: new PickupState(0, PICKUPS.ammo.respawnMs) };
    this._timers = [];
    this._pickupAskAt = 0;
    this.playerState = new PlayerState();
    this.hud = new Hud();
    this.viewmodel = new Viewmodel(camera);
    this.scoreboard = new Scoreboard();
    this._sbSig = '';
    this.keyCode = new CodeDetector(KEY_CODE);
    this.padCode = new CodeDetector(PAD_CODE);
    this.secretUsed = false;
    this.secretAudio = null;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' && this.state === 'playing') e.preventDefault(); // no focus jumping
    });

    document.addEventListener('pointerlockchange', () => {
      if (this.state === 'playing' && !document.pointerLockElement && !this.console.isOpen && !this.chat.isOpen) this.pause.open();
    });
  }

  _commands() {
    const cmds = {
      fly: {
        desc: 'Toggle noclip flight along the camera direction (Space up, C down, Shift fast)',
        run: () => {
          this.controller.setFlying(!this.controller.flying);
          return `Fly: ${this.controller.flying ? 'ON' : 'OFF'}`;
        }
      },
      god: {
        desc: 'Toggle god mode (enemies cannot hurt you)',
        run: () => {
          this.god = !this.god;
          if (this.lobby.mode === 'multi') this.network.sendDevGod(this.god);
          return `God: ${this.god ? 'ON' : 'OFF'}`;
        }
      },
      status: {
        desc: 'Toggle the top-left stats overlay (FPS, ping, position, players, status)',
        run: () => `Status: ${this.ui.toggleStats() ? 'ON' : 'OFF'}`
      },
      knock: {
        desc: 'Debug: knock yourself along your view direction (tests the slap slide)',
        run: () => {
          const m = WEAPONS.hand.melee;
          const yaw = this.look.yaw;
          this.controller.applyKnockback(-Math.sin(yaw), -Math.cos(yaw), m.knockback, m.hop);
          return 'Knocked.';
        }
      },
      enemy: {
        desc: 'Spawn a Beh enemy 6 m in front of you (on the floor)',
        run: () => {
          const c = this.controller, yaw = this.look.yaw;
          const x = c.x - Math.sin(yaw) * 6, z = c.z - Math.cos(yaw) * 6;
          const g = this.level?.collision?.groundAt(x, z, c.y + 2, 12);
          const y = g ? g.y : c.y;
          if (this.lobby.mode === 'multi') this.network.sendDevSpawn(x, y, z);
          else this.enemies?.spawn(x, y, z, yaw);
          return 'Enemy spawned.';
        }
      },
      meh: {
        desc: 'Spawn a Meh (chaser) 10 m in front of you',
        run: () => {
          const c = this.controller, yaw = this.look.yaw;
          const x = c.x - Math.sin(yaw) * 10, z = c.z - Math.cos(yaw) * 10;
          const g = this.level?.collision?.groundAt(x, z, c.y + 2, 12);
          const y = g ? g.y : c.y;
          if (this.lobby.mode === 'multi') this.network.sendDevSpawn(x, y, z, 'meh');
          else this.enemies?.spawn(x, y, z, yaw, 'meh');
          return 'Meh spawned.';
        }
      },
      killenemies: {
        desc: 'Singleplayer: defeat all enemies',
        run: () => {
          if (this.lobby.mode === 'multi') return 'Singleplayer only.';
          this.enemies?.killAll();
          return 'Done.';
        }
      },
      help: {
        desc: 'List all commands',
        run: () => Object.entries(cmds).map(([n, c]) => `${n} - ${c.desc}`).join('\n')
      }
    };
    return cmds;
  }

  // Scene to render, or null to use the lobby backdrop scene.
  get scene() {
    return this.level && (this.state === 'black' || this.state === 'playing' || this.state === 'over') ? this.level.scene : null;
  }

  update(dt) {
    const input = this.input;
    const pad = input.pollGamepad();

    if (this.lobby.active && this.state === 'idle') this.lobby.handlePad(pad.edge);

    const eggConsumed = this._updateSecret(pad);

    // Pause menu: Start opens it, then the pad drives it.
    if (this.pause.isOpen) this.pause.handlePad(pad.edge);
    else if (this.state === 'playing' && pad.edge[9] && !eggConsumed[9]) this.pause.open();

    const active = this.state === 'playing' && !this.pause.isOpen && !this.console.isOpen && !this.chat.isOpen;
    this._updateScoreboard(active && input.isDown('Tab'));
    const eggArmed = this.padCode.progress >= 8; // B/A/Start/Select stage: don't jump/crouch
    this.look.update(active, dt, active ? pad.look : null);

    if (active && this.spectating) this._updateSpectate(pad);
    else if (active) {
      const c = this.controller;
      const axis = (pos, neg) => (input.isDown(pos) ? 1 : 0) - (input.isDown(neg) ? 1 : 0);
      const inp = {
        moveX: axis('KeyD', 'KeyA') + pad.move.x,
        moveY: axis('KeyW', 'KeyS') - pad.move.y, // stick up is negative
        yaw: this.look.yaw,
        pitch: this.look.pitch,
        jumpHeld: input.isDown('Space') || (!!pad.down[0] && !eggArmed),
        crouchPressed: input.wasPressed('KeyC') || (!!pad.edge[1] && !eggArmed),
        crouchHeld: input.isDown('KeyC'),
        runHeld: input.isDown('ShiftLeft') || input.isDown('ShiftRight'),
        runTogglePressed: !!pad.edge[10],
        speedMult: this.myPerk === 'speed' ? SPEED_PERK_MULT : 1
      };
      if (this._tpT > 0) { inp.moveX = 0; inp.moveY = 0; inp.jumpHeld = false; }
      if (c.flying) c.flyUpdate(dt, inp);
      else c.update(dt, inp);
      const kill = this.level?.killY;
      if (kill !== undefined && c.y < kill) {
        const s = this.level.spawn;
        c.reset({ x: s.x, y: s.y ?? c.groundY, z: s.z });
      }
      this.camera.position.set(c.x, c.y + c.eye, c.z);
    }

    if (this.state === 'over') this._updateCinematic(dt);
    if (active && !this.controller.down && !this.spectating) { this._updateWeapon(dt, pad); this._updatePickups(); this._updatePowerups(); }
    this._updateRevive(dt, pad, active);
    this._updateInteract(dt, pad, active);
    if (this.scene) {
      const solo = this.lobby.mode !== 'multi';
      const hits = this.projectiles.step(dt, this.level.collision, solo ? this.enemies?.targets() : this._enemyTargets);
      if (solo) for (const h of hits) if (h.kind === 'enemy' && this.enemies.kill(h.id) && h.owner !== 'lyric') { this.soloStats.kill('local'); scoreKill(this.soloStats, 'local', 'gun', this.pdirector?.dbl > 0); }
      this.bullets?.sync(this.projectiles.list);
      if (solo && this.enemies && this.state === 'playing') {
        const c = this.controller;
        this._beh(this.taunter?.update(dt));
        if (this.rounds) {
          const live = this.enemies.liveCount;
          for (const r of this.rounds.update(dt, { playerCount: 1, liveEnemies: live })) {
            if (r.event === 'spawn') {
              const pt = pickSpawn(this.spawnPoints, Math.random, [{ x: c.x, z: c.z }, ...this.enemies.list.filter((e) => e.state !== 'dying')]);
              if (pt) this.enemies.spawn(pt.x, pt.y, pt.z, 0, pickEnemyKind(this.rounds.round, Math.random));
            } else if (r.event === 'roundStart') this._beh(this.taunter?.onRound(r.round));
            if (r.event !== 'spawn') this._onRoundEvent({ event: r.event === 'roundStart' ? 'start' : 'end', round: r.round, total: r.total, nextMs: r.nextMs });
          }
          this._setLeft(this.rounds.state(this.enemies.liveCount));
        }
        if (this.pdirector?.insta.has('local')) { // Insta-Beh: touching kills
          for (const tid of instaTouches(c, this.enemies.targets())) {
            if (this.enemies.kill(tid)) { this.soloStats.kill('local'); scoreKill(this.soloStats, 'local', 'insta', this.pdirector.dbl > 0); }
          }
        }
        for (const ev of this.enemies.update(dt, [{ id: 'local', x: c.x, y: c.y, z: c.z, down: performance.now() < this._protectUntil }])) this._onEnemyEvent(ev);
        if (this.state !== 'playing') { input.endFrame(); return; } // game over -> back to the menu
        if (this.pdirector) {
          this.pdirector.update(dt, [{ id: 'local', x: c.x, y: c.y, z: c.z, down: false }], this.enemies.targets());
          this._applySoloPowerups();
        }
        this.enemyView?.apply(this.enemies.snapshot());
      }
      this.enemyView?.update(dt);
      this.puRender?.update(dt);
      if (this.lyricView) {
        this.lyricView.apply(this._lyricSnap ? [{ id: 'lyric', ...this._lyricSnap, state: 'idle' }] : []);
        this.lyricView.update(dt);
      }
      this.puHud.update(dt);
      this._updatePoints();
      this.roundBanner.update(dt);
      this.audio3d.updateListener(this.camera);
    }
    if (active && this.controller.down && !this.spectating && this.lobby.mode === 'multi' && this.myPerk === 'oneman' && !this._selfUsed
        && (this.input.wasPressed('KeyF') || pad.edge[2]) && performance.now() - (this._selfSentAt ?? 0) > 400) {
      this._selfSentAt = performance.now(); // server confirms with a `self` revived event
      this.network.sendSelfRevive();
    }
    if (this._downEl && this.controller.down) {
      this._downTime.textContent = Math.max(0, Math.ceil((this.downUntil - performance.now()) / 1000));
    }

    if (this.state === 'playing') {
      const c = this.controller;
      const f = (n) => n.toFixed(1);
      this.ui?.updateStats({ pos: `${f(c.x)}, ${f(c.y)}, ${f(c.z)}${c.flying ? ' (FLY)' : ''}` });
    }

    this._applyFeel(dt, active);

    if (this.scene) {
      this.level.update(dt, this.camera);
      this.viewmodel.update(dt);
      this.remotes?.update(dt);
      this._sendState(dt);
    }
    input.endFrame();
  }

  // Head/weapon bob, motion-blur strength and movement haptics for this frame.
  _applyFeel(dt, active) {
    const c = this.controller, cam = this.camera;
    const live = active && this.state === 'playing' && !this.spectating && !c.down && !c.flying;
    const hs = Math.hypot(c.vx, c.vz);
    const landSpeed = !this._prevOnGround && c.onGround && this._prevVy < -3 ? -this._prevVy : 0;
    let blur = { dx: 0, dy: 0, zoom: 0 };
    if (live) {
      const o = this.bob.update(dt, { speed: hs, onGround: c.onGround, running: c.running, crouching: c.crouching, landSpeed });
      const yaw = this.look.yaw;
      cam.position.y += o.y;
      cam.position.x += Math.cos(yaw) * o.x;
      cam.position.z -= Math.sin(yaw) * o.x;
      cam.rotation.z = o.roll;
      this.viewmodel.setBob(o.vmX, o.vmY);
      if (o.step && c.running) this.haptics.step();
      if (landSpeed > 5) this.haptics.land(landSpeed);
      if (this._prevOnGround && !c.onGround && c.vy > 3) this.haptics.jump();
      // Screen-space turn per frame (fraction of the screen) + zoom blur from speed / falling.
      const vfov = (cam.fov * Math.PI) / 180;
      const hfov = 2 * Math.atan(Math.tan(vfov / 2) * cam.aspect);
      const dYaw = this.look.yaw - this._prevYaw, dPitch = this.look.pitch - this._prevPitch;
      blur = {
        dx: (dYaw / (2 * Math.tan(hfov / 2))) * 0.8,
        dy: (dPitch / (2 * Math.tan(vfov / 2))) * 0.8,
        zoom: Math.min(0.05, Math.max(0, hs - 4.5) / 10 * 0.04 + Math.max(0, -c.vy - 10) / 30 * 0.03)
      };
    } else {
      this.bob.reset();
      this.viewmodel.setBob(0, 0);
      cam.rotation.z = 0;
    }
    this._blur = blur;
    this._prevYaw = this.look.yaw; this._prevPitch = this.look.pitch;
    this._prevOnGround = c.onGround; this._prevVy = c.vy;
  }

  // Motion-blur inputs for the renderer (null outside a match scene).
  blurParams() { return this.scene ? this._blur : null; }

  _updateWeapon(dt, pad) {
    const w = WEAPONS[this.playerState.weaponId];
    if (w?.fire) { this._updateGun(dt, pad, w); return; }
    if (!w?.melee) return;
    const press = this.input.wasMousePressed(0) || !!pad.edge[7];
    const r = this.weaponCtl.update(dt, press, w.melee);
    if (r.started) {
      this.viewmodel.playOnce(w.viewmodel.anims.attack, w.viewmodel.anims.idle);
      this._playAtCamera(SFX.slap);
      this.haptics.swing();
    }
    if (r.hit && this.lobby.mode === 'multi') this.network.sendSlap();
    else if (r.hit && this.enemies) {
      const c = this.controller;
      const me = { x: c.x, y: c.y, z: c.z, yaw: this.look.yaw };
      for (const t of findSlapEnemies(me, this.enemies.targets(), w.melee)) if (this.enemies.kill(t.id)) { this.soloStats.kill('local'); scoreKill(this.soloStats, 'local', 'slap', this.pdirector?.dbl > 0); }
    }
  }

  // ---- enemies / bleedout ----
  _setLeft(st) {
    if (st.round && st.round !== this.playerState.round) this.playerState.setRound(st.round);
    this._leftEl.textContent = st.phase === 'active' && st.left > 0 ? `ENEMIES: ${st.left}` : '';
  }

  _onRoundEvent(m) {
    if (this.state !== 'playing') return;
    if (m.event === 'start') { this._selfUsed = false; this.playerState.setRound(m.round); this.roundBanner.showStart(m.round); }
    else if (m.event === 'end') this.roundBanner.showEnd(m.nextMs);
  }

  // Fold this match into the lifetime profile exactly once (game over, or leaving early).
  _recordMatch(round) {
    if (!this._matchActive) return;
    this._matchActive = false;
    const multi = this.lobby.mode === 'multi';
    const rows = multi ? this._liveRows : this.soloStats.rows();
    const me = rows.find((r) => r.id === (multi ? this.network.playerId : 'local'));
    if (me) profile.recordMatch(me, round ?? this.playerState.round ?? 0);
  }

  // ---- powerups ----
  // One handler for server `powerupEvent` messages and singleplayer director events.
  _onPowerupEvent(ev) {
    if (this.state !== 'playing' && this.state !== 'black') return;
    const multi = this.lobby.mode === 'multi';
    const me = multi ? this.network.playerId : 'local';
    switch (ev.event) {
      case 'spin': this.level?.interactables?.find((i) => (i.kind === 'spin' || i.kind === 'lyricMachine') && Math.hypot(i.x - ev.x, i.z - ev.z) < 1)?.machine.spin(); break;
      case 'drop': this.puRender?.add(ev); break;
      case 'gone': this.puRender?.remove(ev.id); break;
      case 'picked': {
        const def = POWERUPS[ev.kind];
        if (!def) break;
        const who = ev.playerId === me ? 'You' : (ev.name ?? 'Someone');
        const text = `${who} got ${def.label}!`;
        this.puHud.announce(text, def.color);
        this.chat.addLine('POWERUP', text);
        if (def.buff && (def.team || ev.playerId === me)) { // team buffs apply to everyone
          this.buffs.add(ev.kind);
          this.puHud.setBuff(ev.kind, def.label, def.color, ev.durationMs / 1000);
        }
        if (ev.kind === 'lyric' || ev.kind === 'nuke') this.announcer.say(ev.kind); // everyone hears it
        if (ev.kind === 'ammo') this.playerState.refillGun();
        if (ev.kind === 'nuke') this.haptics.nuke();
        else if (ev.playerId === me) this.haptics.pickup();
        break;
      }
      case 'buffEnd':
        if (ev.playerId == null || ev.playerId === me) { this.buffs.delete(ev.kind); this.puHud.clearBuff(ev.kind); }
        break;
      case 'lyricJoin': {
        const def = POWERUPS.lyric;
        this._lyricSnap = { x: ev.x, y: ev.y, z: ev.z, yaw: 0 };
        this.puHud.setLyric(def.label, def.color, LYRIC_MS / 1000);
        break;
      }
      case 'lyricLeave':
        this._lyricSnap = null;
        this.lyricView?.clear();
        this.puHud.setLyric(null, 0, 0);
        break;
      default: break;
    }
  }

  // Singleplayer: apply director events (chat + Lyric bullets locally, the rest like server messages).
  _applySoloPowerups() {
    const f = WEAPONS.gun.fire;
    for (const ev of this.pdirector.drain()) {
      if (ev.event === 'chat') this.chat.addLine(ev.name, ev.text);
      else if (ev.event === 'lyricFire') {
        this.projectiles.spawn({ origin: ev.origin, dir: ev.dir, speed: f.speed, range: f.range, owner: 'lyric' });
        this.audio3d.playAt(SFX.gunshot, ev.origin[0], ev.origin[1], ev.origin[2]);
      } else {
        this._onPowerupEvent(ev);
      }
    }
    const l = this.pdirector.lyric;
    if (l) this._lyricSnap = l.snapshot();
  }

  // Touching an orb: multiplayer asks the server, singleplayer resolves it locally.
  _updatePowerups() {
    const orbs = this.puRender?.orbs;
    if (!orbs?.size || this.controller.flying) return;
    const c = this.controller;
    for (const [id, o] of orbs) {
      const p = o.root.position;
      if (Math.hypot(c.x - p.x, c.z - p.z) > 1.4 || Math.abs(c.y - (o.baseY - 0.9)) > 2) continue;
      if (this.lobby.mode === 'multi') {
        const now = performance.now();
        if (now - this._puAskAt < 400) return;
        this._puAskAt = now;
        this.network.sendPowerupPickup(id);
      } else if (this.pdirector) {
        const kind = this.pdirector.pickup('local', id, { x: c.x, y: c.y, z: c.z });
        if (kind === 'nuke') { // defeat everything and jump to the next round
          this.enemies.killAll({ drops: false });
          for (const r of this.rounds?.skip() ?? []) this._onRoundEvent({ event: 'end', round: r.round, nextMs: r.nextMs });
        }
        this._applySoloPowerups();
      }
      return;
    }
  }

  _clearPowerups() {
    this.announcer?.stop();
    this.pdirector = null;
    this.puRender?.clear();
    this.puRender = null;
    this.lyricView?.clear();
    this.lyricView = null;
    this._lyricSnap = null;
    this.buffs.clear();
    this.puHud.clear();
    this.pointsHud.clear();
  }

  _onMatchState(m) {
    if (this.lobby.mode === 'multi') this._lyricSnap = m.npc ?? null;
    if (m.stats) this._liveRows = m.stats;
    this.remotes?.applyState(m);
    if (m.round && this.state === 'playing') this._setLeft(m.round);
    if (m.enemies) {
      this.enemyView?.apply(m.enemies);
      this._enemyTargets = m.enemies.filter((e) => e.state !== 'dying')
        .map((e) => { const d = ENEMY_DEFS[e.kind] ?? ENEMY; return { id: e.id, x: e.x, y: e.y + d.hitCenterY, z: e.z, r: d.hitRadius }; });
    }
  }

  // Sounds + visuals for enemy events (local in singleplayer, from the server in multiplayer).
  _onEnemyEvent(ev) {
    if (ev.event === 'die' && ev.drop !== false) this.pdirector?.onEnemyDown(ev); // singleplayer drop roll
    if (this.state !== 'playing' && this.state !== 'black') return;
    const def = ENEMY_DEFS[ev.kind] ?? ENEMY;
    const sfx = def.sfx;
    const at = (url) => this.audio3d.playAt(url, ev.x, ev.y + 1.2, ev.z);
    if (def.kind === 'chaser') { // Meh: spawn / attack / die voice lines
      if (ev.event === 'spawn') at(sfx.spawn);
      else if (ev.event === 'die') { at(sfx.ow); this.enemyView?.kill(ev.id); }
      else if (ev.event === 'attack') {
        at(sfx.attack);
        if (this.lobby.mode !== 'multi' && ev.targetId === 'local') this._enemyHitSolo(true);
      }
      return;
    }
    if (ev.event === 'spawn' || ev.event === 'laugh') at(sfx.laugh);
    else if (ev.event === 'die') { at(sfx.ow); this.enemyView?.kill(ev.id); }
    else if (ev.event === 'dehd') {
      at(sfx.dehd);
      if (this.lobby.mode !== 'multi' && ev.targetId === 'local') this._enemyHitSolo();
    }
  }

  // Singleplayer: Hand -> game over (main menu for now), Gun -> lose the gun.
  // force: a Meh touch downs you even if you hold the gun.
  _enemyHitSolo(force = false) {
    if (this.god) return;
    if (this.playerState.hasGun && !force) this._loseGun();
    else if (this.myPerk === 'oneman' && !this._selfUsed) { // One Man Show: once per round
      this._selfUsed = true;
      this._protectUntil = performance.now() + SELF_REVIVE_PROTECT_S * 1000;
      this.haptics.revivePulse();
      this.puHud.announce('ONE MAN SHOW!', PERKS.oneman.color);
    } else {
      this.soloStats.down('local');
      this.soloStats.setStatus('local', 'dead');
      this._gameOver(this.soloStats.rows(), this.rounds?.round ?? 1);
    }
  }

  _loseGun() {
    this.haptics.hurt();
    this.playerState.giveWeapon('hand');
    this.viewmodel.setWeapon('hand', this.assets);
    this.weaponCtl.reset();
  }

  _onPlayerEvent({ event, id, self }) {
    if (this.state === 'playing' && id !== this.network.playerId && event === 'down') this._remoteVoice(id, 'down');
    if (this.state !== 'playing' || id !== this.network.playerId) return;
    if (event === 'gunLost') this._loseGun();
    else if (event === 'down') this._setDown(true);
    else if (event === 'revived') { if (self) this._selfUsed = true; this._setDown(false); }
    else if (event === 'dead') this._beSpectator();
    else if (event === 'respawn') this._respawn();
  }

  // Dead in multiplayer: watch a living player until the game ends (respawn comes with rounds).
  _beSpectator() {
    this.spectating = true;
    this.controller.down = true;
    this.viewmodel.visible = false;
    this._downEl?.classList.add('ui-hidden');
    this._specId = null;
  }

  // A new round started: dead players are back at the spawn with the Hand.
  _respawn() {
    if (!this.spectating || !this.level) return;
    const s = this.level.spawn, c = this.controller;
    this.spectating = false;
    c.reset({ x: s.x, y: s.y ?? c.groundY, z: s.z });
    this._specEl?.classList.add('ui-hidden');
    this.playerState.setWeapon('hand');
    this.viewmodel.setWeapon('hand', this.assets);
    this.viewmodel.visible = true;
    this.weaponCtl.reset();
    this.look.setView(s.yaw, 0);
    this.camera.position.set(c.x, c.y + c.eye, c.z);
    this._sendAcc = 1;
  }

  _updateSpectate(pad) {
    const entries = this.remotes ? [...this.remotes.entries] : [];
    const living = entries.filter(([, e]) => !e.target.down);
    const pool = living.length ? living : entries;
    if (!pool.length) return;
    const input = this.input;
    let i = pool.findIndex(([id]) => id === this._specId);
    const next = input.wasMousePressed(0) || input.wasPressed('ArrowRight') || !!pad.edge[5];
    const prev = input.wasPressed('ArrowLeft') || !!pad.edge[4];
    if (i < 0) i = 0;
    else if (next) i = (i + 1) % pool.length;
    else if (prev) i = (i - 1 + pool.length) % pool.length;
    const [id, e] = pool[i];
    this._specId = id;
    const p = e.avatar.position, yaw = e.avatar.rotation.y;
    this.camera.position.set(p.x + Math.sin(yaw) * 3, p.y + 2.6, p.z + Math.cos(yaw) * 3);
    this.camera.lookAt(p.x, p.y + 1.2, p.z);
    const name = this.lobby.players.find((pl) => pl.id === id)?.name ?? 'Player';
    this._specEl.textContent = `SPECTATING - ${name}`;
    this._specEl.classList.remove('ui-hidden');
  }

  // Game over: cinematic fly-around + leaderboard for 10 s, fade out, back to the menu.
  _gameOver(rows, round) {
    if (this.state !== 'playing') return;
    this.state = 'over';
    this.announcer.say('dead');
    if (this.lobby.mode !== 'multi') this._beh(this.taunter?.onGameOver());
    this._syncClassic();
    if (this.lobby.mode === 'multi') this._liveRows = rows;
    this._recordMatch(round);
    const run = ++this._run;
    this.hud.hide();
    this.viewmodel.visible = false;
    this._downEl?.classList.add('ui-hidden');
    this._reviveEl?.classList.add('ui-hidden');
    this._promptEl?.classList.add('ui-hidden');
    this._tpT = 0;
    this._tpEl?.classList.add('ui-hidden');
    this._specEl?.classList.add('ui-hidden');
    this.roundBanner.hide();
    this._leftEl.textContent = '';
    this.spectating = false;
    this.pause.close();
    this.console.close();
    this.chat.stop();
    this.scoreboard.hide();
    if (document.pointerLockElement) document.exitPointerLock?.();
    const localId = this.lobby.mode === 'multi' ? this.network.playerId : 'local';
    this.gameOverUI.show(rows, round, localId);
    const col = this.level?.collision;
    const bounds = col?.bounds ?? { minX: -30, maxX: 30, minY: 0, maxY: 5, minZ: -30, maxZ: 30 };
    this.cine = new CinematicCamera({ bounds, world: col ?? null });
    (async () => {
      await wait(GAME_OVER_MS);
      if (run !== this._run) return;
      await this.screens.fadeOut(1200);
      if (run !== this._run) return;
      this.returnToLobby();
    })();
  }

  _updateCinematic(dt) {
    if (!this.cine) return;
    const c = this.cine.update(dt);
    this.camera.position.set(...c.position);
    this.camera.lookAt(...c.target);
  }

  _setDown(on) {
    const c = this.controller;
    c.down = on;
    if (on && this.lobby.mode !== 'multi') this._beh(this.taunter?.onDown(this.lobby.players.find((p) => p.id === 'local')?.name ?? 'Gladiator'));
    if (on) { playAudio(this.assets, pickSfx(this.localChar, 'down')); this.haptics.hurt(); }
    else if (this.state === 'playing') this.haptics.revivePulse();
    if (on) { c.crouching = true; this.downUntil = performance.now() + DOWN_MS; } else c.crouching = false;
    if (on || this.state === 'playing') this.viewmodel.visible = !on;
    this._downEl?.classList.toggle('ui-hidden', !on);
    this._downSelf?.classList.toggle('ui-hidden', !(on && this.myPerk === 'oneman' && !this._selfUsed && this.lobby.mode === 'multi'));
    if (on) this._reviveHold = 0;
  }

  // Hold F / X near a downed teammate for 5 s (server confirms and stands them up).
  _updateRevive(dt, pad, active) {
    const multi = this.lobby.mode === 'multi';
    let target = null;
    if (active && multi && !this.controller.down && this.remotes
        && (this.input.isDown('KeyF') || pad.down[2])) {
      const c = this.controller;
      let best = REVIVE_REACH;
      for (const [id, e] of this.remotes.entries) {
        if (!e.target.down) continue;
        const d = Math.hypot(e.target.x - c.x, e.target.z - c.z);
        if (d < best && Math.abs(e.target.y - c.y) < 2.5) { best = d; target = id; }
      }
    }
    if (target === null) {
      this._reviveHold = 0;
      this._reviveEl?.classList.add('ui-hidden');
      return;
    }
    const need = this.myPerk === 'medic' ? MEDIC_REVIVE_MS : REVIVE_MS;
    this._reviveHold += dt * 1000;
    this._reviveEl.classList.remove('ui-hidden');
    this._reviveFill.style.width = `${Math.min(1, this._reviveHold / need) * 100}%`;
    const now = performance.now();
    if (now - this._reviveSendAt >= 100) { this._reviveSendAt = now; this.network.sendRevive(target); this.haptics.revivePulse(); }
  }

  // Right-side points list from the live stats rows.
  _updatePoints() {
    if (this.state !== 'playing') return;
    const multi = this.lobby.mode === 'multi';
    this.pointsHud.render(pointsEntries({
      rows: multi ? this._liveRows : this.soloStats.rows(),
      ids: multi ? matchPlayerIds(this.characters) : ['local'],
      meId: multi ? this.network.playerId : 'local',
      perks: this._perks, myPerk: this.myPerk
    }));
  }

  // Level props (Ungaland teleporter / bullet color machine): prompt when near, E / Y to use.
  _updateInteract(dt, pad, active) {
    if (this._tpT > 0) {
      this._tpT -= dt;
      if (!this._tpDone && this._tpT <= 0.8) { // flash peak: swap position
        this._tpDone = true;
        const [x, y, z] = this._tpTo;
        this.controller.reset({ x, y, z });
        this._protectUntil = performance.now() + 1500; // brief grace in singleplayer
      }
      if (this._tpT <= 0) { this._tpT = 0; this._tpEl?.classList.add('ui-hidden'); this._tpEl?.classList.remove('run'); }
    }
    const list = this.level?.interactables;
    let near = null;
    if (active && list?.length && !this.spectating && !this.controller.down && !this.controller.flying && this._tpT <= 0) {
      const c = this.controller;
      let best = Infinity;
      for (const it of list) {
        if (it.gone?.()) continue;
        const d = Math.hypot(c.x - it.x, c.z - it.z);
        if (d <= it.radius && Math.abs(c.y - it.y) < 2.5 && d < best) { best = d; near = it; }
      }
    }
    if (!near) { this._promptEl?.classList.add('ui-hidden'); return; }
    const info = near.describe?.();
    if (info && this._promptEl) {
      this._promptEl.textContent = info.text;
      this._promptEl.classList.toggle('poor', !info.blocked && this._myPoints() < (info.need ?? 0));
      this._promptEl.classList.remove('ui-hidden');
    } else if (this._promptEl) {
      const tp = near.kind === 'teleporter' ? teleportPay(this._myPoints(), this.playerState.hasGun) : null;
      this._promptEl.textContent = `[E] ${near.prompt} - ${tp === 'gun' ? 'YOUR GUN' : tp === 'free' ? 'FREE' : `${near.cost} PTS`}`;
      this._promptEl.classList.toggle('poor', !tp && this._myPoints() < near.cost);
      this._promptEl.classList.remove('ui-hidden');
    }
    if (info?.blocked) return;
    if (!(this.input.wasPressed('KeyE') || pad.edge[3])) return;
    const now = performance.now();
    if (now - this._interactAt < 400) return;
    this._interactAt = now;
    if (this.lobby.mode === 'multi') { this._pendingUse = near; this.network.sendInteract(near.kind); } // server charges, then replies
    else if (info) {
      const need = info.need ?? 0;
      if (need > 0 && !this.soloStats.spendPoints('local', need)) { this.puHud.announce(`NOT ENOUGH POINTS (${need})`, 0xff4a3a); return; }
      this._useMachine(near, near.kind === 'tpB' && !this.level.state.linked ? 'linked' : undefined);
    } else if (near.kind === 'teleporter') {
      const pay = teleportPay(this._myPoints(), this.playerState.hasGun);
      if (pay === 'points') this.soloStats.spendPoints('local', near.cost);
      else if (pay === 'gun') this._loseGun();
      this._useMachine(near);
    } else if (this.soloStats.spendPoints('local', near.cost)) this._useMachine(near);
    else this.puHud.announce(`NOT ENOUGH POINTS (${near.cost})`, 0xff4a3a);
  }

  _myPoints() {
    const multi = this.lobby.mode === 'multi';
    const me = multi ? this.network.playerId : 'local';
    return (multi ? this._liveRows : this.soloStats.rows()).find((r) => r.id === me)?.points ?? 0;
  }

  _onInteractResult({ kind, ok, reason, cost }) {
    const it = this._pendingUse;
    this._pendingUse = null;
    if (this.state !== 'playing') return;
    if (ok && it?.kind === kind) this._useMachine(it, reason);
    else if (!ok) {
      const msg = { points: `NOT ENOUGH POINTS (${cost})`, notLinked: 'LINK IT AT TELEPORTER B FIRST', already: 'ALREADY UNLOCKED' }[reason];
      this.puHud.announce(msg ?? 'CANNOT USE THAT RIGHT NOW', 0xff4a3a);
    }
  }

  // Shared map state (barrier unlocked / teleporters linked); idempotent, from the server or solo play.
  _applyMapEvent({ event }) {
    const lv = this.level;
    if (!lv?.state) return;
    if (event === 'barrier' && !lv.state.barrierOpen) {
      lv.setBarrierOpen(true);
      if (this.lobby.mode !== 'multi' && this._spawnsOpen?.length) this.spawnPoints = this._spawnsOpen;
      this.puHud.announce('BARRIER UNLOCKED', 0xffb070);
    } else if (event === 'linked' && !lv.state.linked) {
      lv.setLinked(true);
      this.puHud.announce('TELEPORTERS LINKED', 0x6fd2ff);
    }
  }

  _useMachine(near, reason) {
    if (near.kind === 'spin' || near.kind === 'lyricMachine') {
      if (this.lobby.mode !== 'multi') {
        const c = this.controller;
        this.pdirector?.spin({ x: near.x, y: near.y, z: near.z }, { x: c.x, z: c.z }, near.kind === 'lyricMachine' ? 'lyric' : null);
        this._applySoloPowerups();
      }
    } else if (near.kind === 'barrier') {
      this._applyMapEvent({ event: 'barrier' });
    } else if ((near.kind === 'tpA' || near.kind === 'tpB') && reason === 'linked') {
      this._applyMapEvent({ event: 'linked' });
    } else if (near.kind === 'teleporter' || near.kind === 'tpA' || near.kind === 'tpB') {
      this._tpT = 1.6; this._tpDone = false; this._tpTo = near.to;
      const el = this._tpEl;
      if (el) { el.classList.remove('ui-hidden', 'run'); void el.offsetWidth; el.classList.add('run'); }
      this.haptics.revivePulse();
    } else if (near.kind === 'colorMachine') {
      this.bulletColor = nextBulletColor(this.bulletColor);
      near.machine.setColor(this.bulletColor);
      this.puHud.announce(`BULLET COLOR ${colorName(this.bulletColor)}`, this.bulletColor);
    }
  }

  _updateGun(dt, pad, w) {
    const auto = this.buffs.has('automation'); // full-auto + unlimited ammo
    const trigger = this.input.wasMousePressed(0) || !!pad.edge[7]
      || (auto && (this.input.isMouseDown(0) || !!pad.down[7]));
    const press = trigger && (auto || this.playerState.ammo[w.id] > 0);
    const r = this.weaponCtl.update(dt, press, { cooldown: w.fire.cooldown, hitDelay: 0 });
    if (!r.started || (!auto && !this.playerState.useAmmo())) return;
    const yaw = this.look.yaw, pitch = this.look.pitch, cp = Math.cos(pitch);
    const dir = [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
    const p = this.camera.position;
    const origin = [
      p.x + dir[0] * 0.6 + Math.cos(yaw) * 0.15,
      p.y + dir[1] * 0.6 - 0.12,
      p.z + dir[2] * 0.6 - Math.sin(yaw) * 0.15
    ];
    this.projectiles.spawn({ origin, dir, speed: w.fire.speed, range: w.fire.range, color: this.bulletColor });
    this._playAtCamera(SFX.gunshot);
    this.haptics.shot();
    if (this.lobby.mode === 'multi') {
      this.network.sendShoot({ ox: origin[0], oy: origin[1], oz: origin[2], dx: dir[0], dy: dir[1], dz: dir[2], color: this.bulletColor ?? undefined });
    }
  }

  _onBullet(m) {
    if (this.state !== 'playing' || m.id === this.network.playerId) return;
    const w = WEAPONS.gun.fire;
    this.projectiles.spawn({ origin: [m.ox, m.oy, m.oz], dir: [m.dx, m.dy, m.dz], speed: w.speed, range: w.range, color: Number.isInteger(m.color) ? m.color : null });
    this.audio3d.playAt(SFX.gunshot, m.ox, m.oy, m.oz);
  }

  _playAtCamera(url) {
    const p = this.camera.position;
    this.audio3d.playAt(url, p.x, p.y, p.z);
  }

  // Another player swung the Hand (server cue): play it where they are.
  _onSlapFx({ id }) {
    if (this.state !== 'playing' || id === this.network.playerId) return;
    const av = this.remotes?.entries.get(id)?.avatar;
    if (av) this.audio3d.playAt(SFX.slap, av.position.x, av.position.y + 1.2, av.position.z);
  }

  // A chat phrase triggered a sound for everyone in the match.
  _onChatSfx({ sound }) {
    if (this.state === 'idle' || sound !== 'getMoving') return;
    this._chatAudio ||= new Audio(SFX.getMoving);
    this._chatAudio.currentTime = 0;
    this._chatAudio.volume = gameVolume();
    this._chatAudio.play().catch(() => { /* autoplay blocked; ignore */ });
  }

  _beh(text) { if (text) this.chat.addLine(BEH_NAME, text); }

  // Re-apply the in-game volume to music/voice elements that are already playing.
  _applyVolume() {
    const v = gameVolume();
    if (this.classicAudio) this.classicAudio.volume = 0.6 * v;
    if (this.secretAudio) this.secretAudio.volume = v;
    this.screens.applyVolume();
    this.announcer.applyVolume();
  }

  // CLASSIC mode: loop Epicness during a match; only the secret track silences it.
  _syncClassic() {
    if (this.state === 'playing') { // CLASSIC replaces the looping map BGM; it returns when CLASSIC is off
      if (settings.get('classic') === 'YES') this.screens.pauseMatchBgm(); else this.screens.resumeMatchBgm();
    }
    const want = settings.get('classic') === 'YES' && this.state === 'playing';
    if (!want) {
      if (this.classicAudio) { this.classicAudio.pause(); this.classicAudio = null; }
      return;
    }
    if (!this.classicAudio) {
      this.classicAudio = new Audio(SFX.classic);
      this.classicAudio.loop = true;
      this.classicAudio.volume = 0.6 * gameVolume();
    }
    const secretPlaying = this.secretAudio && !this.secretAudio.paused && !this.secretAudio.ended;
    if (secretPlaying) this.classicAudio.pause();
    else if (this.classicAudio.paused) this.classicAudio.play().catch(() => { /* autoplay blocked; ignore */ });
  }

  _spawnsOf(kind) { return kind === 'gun' ? this.level?.gunSpawns : this.level?.ammoSpawns; }

  // Touching an active pickup: guns need an empty hand slot, ammo needs the gun.
  _updatePickups() {
    const c = this.controller;
    if (c.flying) return;
    const has = this.playerState.hasGun;
    for (const kind of has ? ['ammo'] : ['gun']) {
      const spawns = this._spawnsOf(kind);
      if (!spawns?.length) continue;
      for (let i = 0; i < spawns.length; i++) {
        const s = spawns[i];
        if (!s.active) continue;
        const gy = s.position.y + s.hover;
        const near = Math.hypot(c.x - s.position.x, c.z - s.position.z) < GUN_TOUCH_RADIUS
          && c.y - 0.3 < gy + 0.4 && c.y + 1.8 > gy - 0.3;
        if (near) { this._touchSpawn(kind, i); return; }
      }
    }
  }

  _touchSpawn(kind, i) {
    if (this.lobby.mode === 'multi') {
      const now = performance.now();
      if (now - this._pickupAskAt < 400) return; // server decides; don't spam
      this._pickupAskAt = now;
      this.network.sendPickup(kind, i);
    } else if (this.pickups[kind].take(i)) {
      this._spawnsOf(kind)[i].setActive(false);
      this._timers.push(setTimeout(() => this._spawnsOf(kind)?.[i]?.setActive(true), PICKUPS[kind].respawnMs));
      this._applyPickup(kind);
    }
  }

  // Another player's voice line, played from their character (HRTF pan + distance falloff).
  _remoteVoice(id, kind, at = null) {
    if (this.lobby.mode !== 'multi' || id === this.network.playerId) return;
    const url = pickSfx(this.characters?.[id], kind);
    if (!url) return;
    const now = performance.now();
    this._voiceAt ||= new Map();
    const key = `${id}:${kind}`;
    if (now - (this._voiceAt.get(key) ?? -1e9) < 600) return;
    this._voiceAt.set(key, now);
    const p = at ?? this.remotes?.entries.get(id)?.avatar.position ?? this.level?.spawn;
    if (!p) return;
    this.audio3d.playAt(url, p.x, (p.y ?? 0) + 1.5, p.z, VOICE_VOLUME);
  }

  _onPickupTaken({ kind, index, id }) {
    if (this.state !== 'playing' && this.state !== 'black') return;
    this._spawnsOf(kind)?.[index]?.setActive(false);
    if (id === this.network.playerId) this._applyPickup(kind);
    else if (kind === 'ammo') this._remoteVoice(id, 'reload');
  }

  _applyPickup(kind) {
    if (kind === 'gun') this._equipGun();
    else if (kind === 'ammo') {
      this.playerState.addAmmo(PICKUPS.ammo.amount);
      playAudio(this.assets, pickSfx(this.localChar, 'reload'));
    }
  }

  _equipGun() {
    this.playerState.giveWeapon('gun');
    this.viewmodel.setWeapon('gun', this.assets);
    this.weaponCtl.reset();
  }

  _onKnockback({ targetId, dx, dz }) {
    if (this.state !== 'playing' || targetId !== this.network.playerId) return;
    const m = WEAPONS.hand.melee;
    this.controller.applyKnockback(dx, dz, m.knockback, m.hop);
    this.haptics.knockback();
  }

  _updateScoreboard(show) {
    if (!show) { this.scoreboard.hide(); this._sbSig = ''; return; }
    const multi = this.lobby.mode === 'multi';
    const players = this.lobby.players;
    const localId = multi ? this.lobby.localId : 'local';
    const rows = multi ? this._liveRows : this.soloStats.rows();
    const sig = players.map((p) => `${p.id}:${p.name}`).join('|') + localId
      + rows.map((r) => `${r.id}:${r.kills}/${r.downs}/${r.revives}`).join('|');
    if (this.scoreboard.visible && sig === this._sbSig) return;
    this._sbSig = sig;
    this.scoreboard.show(players, localId, this.map?.name ?? '', rows);
  }

  // Easter-egg code (maps with `secret` only). Returns buttons consumed this frame.
  _updateSecret(pad) {
    const consumed = {};
    if (this.state !== 'playing' || !this.map?.secret || this.secretUsed || this._secretSent
        || this.pause.isOpen || this.console.isOpen) {
      this.keyCode.reset(); this.padCode.reset();
      return consumed;
    }
    let done = false;
    for (const k of SECRET_KEYS) {
      if (this.input.wasPressed(k) && this.keyCode.feed(k)) done = true;
    }
    for (const b of SECRET_PAD_BUTTONS) {
      if (!pad.edge[b]) continue;
      const stage = this.padCode.progress;
      if (stage >= 8 && PAD_CODE[stage] === b) consumed[b] = true;
      if (this.padCode.feed(b)) done = true;
    }
    if (done) this._triggerSecret();
    return consumed;
  }

  _triggerSecret() {
    if (this.lobby.mode === 'multi') {
      this._secretSent = true; // server decides who gets it; one ask is enough
      this.network.sendSecret();
    } else {
      this._onSecretSong();
    }
  }

  _onSecretSong() {
    if (!this.map?.secret || this.secretUsed || (this.state !== 'playing' && this.state !== 'black')) return;
    this.secretUsed = true;
    const a = this.secretAudio ?? new Audio(this.map.secret.audio);
    this.secretAudio = a;
    a.currentTime = 0;
    a.volume = gameVolume();
    a.onended = () => this._syncClassic();
    a.onpause = () => this._syncClassic();
    a.play().then(() => this._syncClassic()).catch(() => { /* autoplay blocked; ignore */ });
    this._syncClassic();
  }

  // Multiplayer: report our position to the server at ~20Hz.
  _sendState(dt) {
    if (this.lobby.mode !== 'multi' || this.spectating) return;
    this._sendAcc += dt;
    const away = this._away();
    if (this._sendAcc < 0.05 && away === this._lastAway) return;
    this._sendStateNow();
  }

  _away() {
    return computeAway({
      chatOpen: this.chat.isOpen, pauseOpen: this.pause.isOpen,
      hidden: document.hidden, focused: document.hasFocus()
    });
  }

  // Send our state immediately (also from blur/visibility events, when frames may stop).
  _sendStateNow() {
    if (this.lobby.mode !== 'multi' || this.state !== 'playing') return;
    this._sendAcc = 0;
    const c = this.controller;
    this._lastAway = this._away();
    this.network.sendPlayerState({ x: c.x, y: c.y, z: c.z, yaw: this.look.yaw, crouch: c.crouching, away: this._lastAway });
  }

  // ---- triggers ----
  _onStart({ mapId, mode }) {
    if (this.state !== 'idle') return;
    if (mode === 'multi') return; // multiplayer starts via READY UP (server-driven)
    this._runLocal(mapId);
  }

  async _runLocal(mapId) {
    const run = ++this._run;
    this.lobby.suspend(); // singleplayer starts straight into loading (no countdown)
    if (!(await this._load(mapId, run, { local: this.lobby.localChar ?? randomCharacterId() }))) return;
    await this._begin(run);
  }

  _onCountdownMsg({ mapId, durationMs }) {
    if (!this.lobby.active || this.lobby.mode !== 'multi' || this.state !== 'idle') return;
    const run = ++this._run;
    this._countdown(mapId, durationMs, run); // visual only; server sends loadMap
  }

  async _onLoadMsg({ mapId, characters, perks }) {
    this._perks = perks || {};
    if (!this.lobby.active || this.lobby.mode !== 'multi') return;
    if (this.state === 'idle') this.lobby.suspend();
    const run = ++this._run;
    if (await this._load(mapId, run, characters || {})) this.network.mapLoaded();
  }

  _onBeginMsg() {
    if (this.state !== 'loading' || !this.pendingLevel) return;
    this._begin(++this._run);
  }

  // ---- steps (each returns false if cancelled) ----
  async _countdown(mapId, durationMs, run) {
    this.state = 'countdown';
    this.lobby.suspend();
    const ok = await this.screens.showCountdown(durationMs, getMap(mapId).name);
    return ok && run === this._run;
  }

  async _load(mapId, run, characters = {}) {
    const map = getMap(mapId);
    this.map = map;
    this.characters = characters;
    this.localChar = characters[this.network.playerId] ?? characters.local ?? randomCharacterId();
    const multi = this.lobby.mode === 'multi';
    this.myPerk = effectivePerk(multi ? this._perks?.[this.network.playerId] : profile.perk, this.lobby.mode);
    this._selfUsed = false;
    this._protectUntil = 0;
    this.god = false;
    this.buffs.clear();
    this.bulletColor = null;
    this._tpT = 0;
    this._tpEl?.classList.add('ui-hidden');
    this.state = 'loading';
    this.screens.cancelCountdown();
    bgm.stop();
    let t0 = performance.now();
    let real = 0;
    let finished = false;
    const minMs = Math.max(MIN_LOADING_MS, map.minLoadingMs ?? 0);
    // Assets load in parallel with the intro cutscene.
    const assetsP = loadAssets(this._manifest(map), (p) => { real = p * 0.9; });
    assetsP.catch(() => {});
    if (map.intro) {
      this.screens.startLoadingAudio(map);
      const how = await this.screens.playIntro(map, {
        multi: this.lobby.mode === 'multi',
        sendVote: () => this.network.sendIntroVote(),
        revealLoading: () => { if (run === this._run) { this.screens.showLoading(map); t0 = performance.now(); } }
      });
      if (how === 'cancelled' || run !== this._run) return false;
    } else {
      this.screens.showLoading(map);
      t0 = performance.now();
    }
    const ticker = (async () => {
      while (!finished || performance.now() - t0 < minMs) {
        const timeP = (performance.now() - t0) / minMs;
        this.screens.setProgress(Math.min(real, timeP));
        await nextFrame();
        if (run !== this._run) return;
      }
      this.screens.setProgress(1);
    })();

    const assets = await assetsP;
    if (run !== this._run) return false;
    this.assets = assets;
    const level = map.createLevel(assets);
    this.renderer.compile(level.scene, this.camera); // avoid a hitch on first frame
    if (run !== this._run) { level.dispose(); return false; }
    this.pendingLevel?.dispose();
    this.pendingLevel = level;
    real = 1;
    finished = true;
    await ticker;
    return run === this._run;
  }

  // Map assets plus the character models / local start sfx.
  _manifest(map) {
    const extra = characterManifest(this.localChar, this.characters);
    const out = {};
    for (const src of [map.assets, extra, weaponManifest(STARTING_WEAPON), enemyManifest(), sfxManifest(), announcerManifest()]) {
      for (const [type, urls] of Object.entries(src)) out[type] = [...new Set([...(out[type] || []), ...urls])];
    }
    return out;
  }

  async _begin(run) {
    const level = this.pendingLevel;
    this.pendingLevel = null;
    this.level = level;
    this.state = 'black';
    this.screens.blackOut();
    this.screens.stopMatchBgm();
    this.screens.hideLoading({ keepAudio: !!this.map?.bgmInGame });
    if (settings.get('classic') === 'YES') this.screens.pauseMatchBgm(); // CLASSIC replaces the map BGM
    this.taunter = this.map?.taunts && this.lobby.mode !== 'multi' ? new Taunter() : null;
    this.screens.cancelCountdown();
    this.lobby.hide();
    this.weaponCtl.reset();
    this.projectiles.clear();
    this.bullets?.dispose();
    this.bullets = new BulletRenderer(level.scene, this.assets?.models?.[WEAPONS.gun.fire.projectile]);
    this.pickups = {
      gun: new PickupState(level.gunSpawns?.length ?? 0, PICKUPS.gun.respawnMs),
      ammo: new PickupState(level.ammoSpawns?.length ?? 0, PICKUPS.ammo.respawnMs)
    };
    level.gunSpawns?.forEach((s) => s.setActive(true));
    level.ammoSpawns?.forEach((s) => s.setActive(true));
    this.playerState.reset(this.localChar);
    this.viewmodel.setWeapon(this.playerState.weaponId, this.assets);
    this.secretUsed = false;
    this._secretSent = false;
    this.keyCode.reset(); this.padCode.reset();
    this.audio3d.setSounds(this.assets?.sounds);
    this.audio3d.resume();
    this._setDown(false);
    this.spectating = false;
    this.cine = null;
    this.gameOverUI.hide();
    this._specEl?.classList.add('ui-hidden');
    this._liveRows = [];
    this._matchActive = true;
    this.soloStats = new MatchStats();
    this.soloStats.register('local', this.lobby.players.find((p) => p.id === 'local')?.name ?? 'You', this.localChar);
    this._enemyTargets = [];
    this.enemyView?.clear();
    const enemyModel = this.assets?.models?.[ENEMY.model];
    this.enemyView = enemyModel ? new EnemyRenderer(level.scene, ENEMY, enemyModel) : null;
    const mehModel = this.assets?.models?.[ENEMY_DEFS.meh.model];
    if (this.enemyView && mehModel) this.enemyView.addKind('meh', ENEMY_DEFS.meh, mehModel);
    this.enemyView?.setOutline(this.myPerk === 'vulture'); // The Vulture: white outlines through walls
    this.hud.setPerk(this.myPerk);
    this.enemies = this.lobby.mode === 'multi' ? null : new EnemySystem({ world: level.collision ?? null, def: ENEMY, defs: ENEMY_DEFS });
    this._clearPowerups();
    this.puRender = new PowerupRenderer(level.scene);
    this.pdirector = this.lobby.mode === 'multi' ? null : new PowerupDirector({ world: level.collision ?? null });
    this.lyricView = enemyModel
      ? new EnemyRenderer(level.scene, { ...ENEMY, height: ENEMY.height * 1.25 }, enemyModel, { label: 'Lyric' }) : null;
    const md = MAP_DATA[this.map?.id];
    this.spawnPoints = this.lobby.mode !== 'multi' && level.collision && md?.enemyAreas
      ? buildSpawnPoints(level.collision, md.enemyAreas, { start: md.spawn }) : [];
    this._spawnsOpen = null; // after-barrier spawn list (singleplayer)
    if (this.lobby.mode !== 'multi' && level.collision && md?.enemyAreasOpen) {
      level.collision.setGateOpen?.(true);
      this._spawnsOpen = buildSpawnPoints(level.collision, md.enemyAreasOpen, { start: md.spawn });
      level.collision.setGateOpen?.(false);
    }
    if (this.map?.secret) { // warm the cache in the background (3+ MB)
      this.secretAudio = new Audio(this.map.secret.audio);
      this.secretAudio.preload = 'auto';
    }

    // Every player uses the same spawn; players may overlap (no collision).
    const s = level.spawn;
    this.controller.groundY = level.groundY ?? 0;
    this.controller.world = level.collision ?? null;
    this.controller.reset({ x: s.x, y: s.y ?? this.controller.groundY, z: s.z });
    this.camera.position.set(s.x, this.controller.y + this.controller.eye, s.z);
    this.look.setView(s.yaw, 0);
    this.remotes = new RemotePlayers(level.scene, this.network.playerId, this.characters, this.assets,
      (id) => this.lobby.players.find((p) => p.id === id)?.name ?? '');
    this.chat.start(); // log only in singleplayer (powerup + Lyric lines); typing stays multiplayer-only
    this._sendAcc = 1;

    await wait(CLIENT_CONFIG.BLACK_HOLD_MS);
    if (run !== this._run) return;
    playAudio(this.assets, randomStartSfx(this.localChar));
    if (this.lobby.mode === 'multi') for (const id of matchPlayerIds(this.characters)) this._remoteVoice(id, 'sfx', this.level.spawn);
    await this.screens.fadeIn(CLIENT_CONFIG.FADE_IN_MS);
    if (run !== this._run) return;
    this.state = 'playing';
    this._syncClassic();
    if (this.map?.greeting) { // personal greeting line in the chat log (local, each player sees their own name)
      const me = this.lobby.players.find((p) => p.id === (this.lobby.mode === 'multi' ? this.network.playerId : 'local'));
      this.chat.addLine(this.map.greeting.from, this.map.greeting.text(me?.name ?? profile.name ?? 'Gladiator'));
    }
    this.level?.startSkyTransition?.();
    if (this.enemies) { this.rounds = new RoundSystem(); this.rounds.start(1); }
    this.hud.show();
    this.viewmodel.visible = true;
  }

  // ---- pause / exit / teardown ----
  _resume() {
    this.pause.close();
    try { this.canvas.requestPointerLock?.(); } catch { /* user can click the canvas */ }
  }

  exit() {
    const mode = this.lobby.mode;
    this.teardown();
    events.emit('lobby:back', { mode, reason: 'exit' });
  }

  // After a game over: back to the lobby with the same map, perk and (in multiplayer) players.
  returnToLobby() {
    this._reset();
    this.lobby.resume();
  }

  _abort(reason) {
    if (this.state === 'idle') return;
    this._reset();
    this.lobby.resume(reason);
  }

  teardown() {
    if (this.state === 'idle' && !this.level && !this.pendingLevel) return;
    this._reset();
  }

  _reset() {
    this._recordMatch(); // leaving mid-match still saves what was earned
    this._run++;
    bgm.play(); // back to menu/lobby music
    this.screens.hideAll();
    this.pause.close();
    this.console.close();
    this.chat.stop();
    this.hud.hide();
    this._timers.forEach(clearTimeout);
    this._timers = [];
    this.projectiles.clear();
    this.bullets?.dispose();
    this.bullets = null;
    this.viewmodel.dispose();
    this.playerState.clear();
    this.scoreboard.hide();
    if (this.classicAudio) { this.classicAudio.pause(); this.classicAudio = null; }
    if (this.secretAudio) { this.secretAudio.onended = this.secretAudio.onpause = null; this.secretAudio.pause(); this.secretAudio.removeAttribute('src'); this.secretAudio = null; }
    this.map = null;
    this.controller.world = null;
    this.ui?.updateStats({ pos: '--' });
    if (document.pointerLockElement) document.exitPointerLock?.();
    this.remotes?.clear();
    this.remotes = null;
    this.enemyView?.clear();
    this.enemyView = null;
    this.enemies = null;
    this.rounds = null;
    this._clearPowerups();
    this.spawnPoints = [];
    this.taunter = null;
    this.roundBanner.hide();
    this._leftEl.textContent = '';
    this._enemyTargets = [];
    this.controller.down = false;
    this.spectating = false;
    this.cine = null;
    this.gameOverUI.hide();
    this._specEl?.classList.add('ui-hidden');
    this._downEl?.classList.add('ui-hidden');
    this._reviveEl?.classList.add('ui-hidden');
    this.level?.dispose();
    this.pendingLevel?.dispose();
    this.level = this.pendingLevel = null;
    this.assets = null;
    this.characters = {};
    this.state = 'idle';
    this.camera.position.copy(this._home);
    this.look.setView(0, 0);
  }
}
