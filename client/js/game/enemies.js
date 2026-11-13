// Enemy simulation (pure; used locally in singleplayer and by the server per lobby).
// Two kinds share one system:
//   beh (stationary): idle -> tracking -> laugh -> dehd -> idle, plus dying.
//   meh (chaser): chase the nearest player (path finding around walls), downs them on touch, then goes after the next.
// update() returns events:
//   { event: 'spawn'|'laugh'|'dehd'|'attack'|'die', id, kind, x, y, z, targetId }
import { PlayerController, MOVE } from './player-controller.js';
import { findPath, nodeKey } from './nav.js';

const CHEST = 1.2;
const STUCK_CHECK_S = 0.5;
const BLOCK_S = 3;
const REPATH_S = 1.0;
const RETARGET_S = 1;

export class EnemySystem {
  // def: the default (beh) definition; defs: { id: def } for every kind that may spawn.
  constructor({ world = null, def = null, defs = null, rng = Math.random } = {}) {
    this.world = world;
    this.defs = defs ?? { [def?.id ?? 'beh']: def };
    this.def = def ?? this.defs.beh ?? Object.values(this.defs)[0];
    this.rng = rng;
    this.list = [];
    this.nextId = 1;
    this.events = [];
  }

  _def(e) { return this.defs[e.kind] ?? this.def; }

  _ev(e, event, targetId = null, extra = null) {
    this.events.push({ event, id: e.id, kind: e.kind, x: e.x, y: e.y, z: e.z, targetId, ...extra });
  }

  spawn(x, y, z, yaw = 0, kind = 'beh') {
    if (!this.defs[kind]) kind = this.def.id ?? 'beh';
    const e = { id: this.nextId++, kind, x, y, z, yaw, state: 'idle', targetId: null, trackT: 0, timer: 0 };
    if (this.defs[kind].kind === 'chaser') this._initChaser(e);
    this.list.push(e);
    this._ev(e, 'spawn');
    return e.id;
  }

  // drops:false marks the 'die' event so it cannot roll a powerup drop (e.g. nuke).
  kill(id, { drops = true } = {}) {
    const e = this.list.find((o) => o.id === id);
    if (!e || e.state === 'dying') return false;
    e.state = 'dying'; e.timer = this._def(e).dieMs / 1000; e.targetId = null; e.trackT = 0;
    this._ev(e, 'die', null, { drop: drops });
    return true;
  }

  killAll(opts) { for (const e of this.list) this.kill(e.id, opts); }
  clear() { this.list = []; this.events = []; }
  get count() { return this.list.length; }
  get liveCount() { return this.list.filter((e) => e.state !== 'dying').length; }

  _visible(e, p) {
    const def = this._def(e);
    const dx = p.x - e.x, dz = p.z - e.z;
    const ey = e.y + def.eyeY, py = p.y + CHEST;
    const dy = py - ey;
    const d = Math.hypot(dx, dy, dz);
    if (d > def.sightRange) return false;
    if (!this.world || d < 1e-6) return true;
    return this.world.raycast(e.x, ey, e.z, dx / d, dy / d, dz / d, d - 0.05) === null;
  }

  _face(e, p, dt) {
    this._turn(e, Math.atan2(-(p.x - e.x), -(p.z - e.z)), dt, this._def(e).turnSpeed);
  }

  _turn(e, want, dt, rate) {
    let d = (want - e.yaw) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    e.yaw += d * (1 - Math.exp(-rate * dt));
  }

  // ---- Meh (chaser) ----
  _initChaser(e) {
    e.state = 'chase';
    e.body = new PlayerController(e.y);
    e.body.world = this.world;
    e.body.reset({ x: e.x, y: e.y, z: e.z });
    e.path = null; e.pathIdx = 0; e.pathFor = null;
    e.pathT = this.rng() * REPATH_S;   // stagger the A* work between enemies
    e.retargetT = 0;
    e.chk = { t: 0, x: e.x, z: e.z };
    e.blocked = new Map();             // nodeKey -> expiry (s) of waypoints that got us stuck
  }

  _blockedSet(e) {
    const set = new Set();
    for (const [k, t] of e.blocked) { if (t > 0) set.add(k); }
    return set;
  }

  _updateChaser(e, dt, players) {
    const def = this._def(e);
    for (const [k, t] of e.blocked) { if (t - dt <= 0) e.blocked.delete(k); else e.blocked.set(k, t - dt); }
    const live = players.filter((p) => !p.down);
    const input = { moveX: 0, moveY: 0, yaw: e.yaw, jumpHeld: false, crouchPressed: false, runHeld: true, speedMult: def.speed / MOVE.RUN };

    if (e.state === 'cooldown') {
      e.timer -= dt;
      if (e.timer <= 0) e.state = 'chase';
    } else {
      this._retarget(e, dt, live);
      const t = live.find((p) => p.id === e.targetId);
      if (!t) {
        e.state = 'idle';
      } else {
        e.state = 'chase';
        if (Math.hypot(t.x - e.x, t.z - e.z) <= def.touchRadius && Math.abs(t.y - e.y) < 1.8) {
          this._ev(e, 'attack', t.id);
          e.state = 'cooldown'; e.timer = def.cooldownMs / 1000;
          e.targetId = null; e.path = null; e.retargetT = 0;
        } else {
          this._steer(e, dt, t, input);
        }
      }
    }
    this._walk(e, dt, input);
  }

  // Nearest living player, with hysteresis so it doesn't flip between two close targets.
  _retarget(e, dt, live) {
    e.retargetT -= dt;
    const cur = live.find((p) => p.id === e.targetId);
    if (cur && e.retargetT > 0) return;
    let best = null, bd = Infinity;
    for (const p of live) {
      const d = Math.hypot(p.x - e.x, p.z - e.z);
      if (d < bd) { bd = d; best = p; }
    }
    e.retargetT = RETARGET_S;
    if (cur && best && Math.hypot(cur.x - e.x, cur.z - e.z) <= bd / 0.7) return; // keep the current one
    if (best && best.id !== e.targetId) { e.targetId = best.id; e.path = null; }
    if (!best) e.targetId = null;
  }

  _steer(e, dt, t, input) {
    e.pathT -= dt;
    const moved = e.pathFor ? Math.hypot(t.x - e.pathFor.x, t.z - e.pathFor.z) : Infinity;
    if (!e.path || e.pathT <= 0 || moved > 2) {
      if (this._pathBudget <= 0) { // one A* search per tick keeps the server tick short; the rest wait a tick
        if (!e.path) e.path = [{ x: t.x, y: t.y, z: t.z }];
        e.pathT = 0;
      } else {
      this._pathBudget--;
      e.pathT = REPATH_S;
      e.pathFor = { x: t.x, z: t.z };
      if (this.world) {
        const r = findPath(this.world, e, t, { blocked: this._blockedSet(e) });
        e.path = r?.points?.length ? r.points : [{ x: t.x, y: t.y, z: t.z }];
      } else {
        e.path = [{ x: t.x, y: t.y, z: t.z }];
      }
      e.pathIdx = 0;
      }
    }
    while (e.pathIdx < e.path.length - 1 && Math.hypot(e.path[e.pathIdx].x - e.x, e.path[e.pathIdx].z - e.z) < 0.5) e.pathIdx++;
    const wp = e.path[e.pathIdx];
    const dx = wp.x - e.x, dz = wp.z - e.z;
    if (Math.hypot(dx, dz) > 0.05) this._turn(e, Math.atan2(-dx, -dz), dt, def_turn(this._def(e)));
    input.moveY = 1;
    input.yaw = e.yaw;
    if (wp.y - e.y > 0.45 && Math.hypot(dx, dz) < 1.6) input.jumpHeld = true; // hop up a ledge

    // Stuck detection: barely moved over the last half second -> avoid this waypoint and re-plan.
    e.chk.t += dt;
    if (e.chk.t >= STUCK_CHECK_S) {
      const prog = Math.hypot(e.x - e.chk.x, e.z - e.chk.z);
      if (prog < this._def(e).speed * STUCK_CHECK_S * 0.25) {
        e.blocked.set(nodeKey(wp.x, wp.y, wp.z), BLOCK_S);
        e.pathT = 0;
        e.path = null;
        input.jumpHeld = true; // maybe a small lip
      }
      e.chk = { t: 0, x: e.x, z: e.z };
    }
  }

  _walk(e, dt, input) {
    const b = e.body;
    let left = dt;
    while (left > 1e-6) {
      const h = Math.min(left, MOVE.MAX_DT);
      b.update(h, input);
      left -= h;
      input = { ...input, jumpHeld: false };
    }
    e.x = b.x; e.y = b.y; e.z = b.z;
  }

  // players: [{ id, x, y, z, down }] (feet positions). Returns the events since the last call.
  update(dt, players) {
    this._pathBudget = 1;
    const byId = new Map(players.map((p) => [p.id, p]));
    for (const e of this.list) {
      const def = this._def(e);
      if (e.state === 'dying') { e.timer -= dt; continue; }
      if (def.kind === 'chaser') { this._updateChaser(e, dt, players); continue; }
      if (e.state === 'laugh' || e.state === 'dehd') {
        const t = byId.get(e.targetId);
        if (t) this._face(e, t, dt);
        e.timer -= dt;
        if (e.timer > 0) continue;
        if (e.state === 'laugh') {
          e.state = 'dehd'; e.timer = def.dehdMs / 1000;
          this._ev(e, 'dehd', t && !t.down ? e.targetId : null);
        } else {
          e.state = 'idle'; e.targetId = null; e.trackT = 0;
        }
        continue;
      }
      let best = null, bestD = Infinity;
      for (const p of players) {
        if (p.down) continue;
        const d = Math.hypot(p.x - e.x, p.z - e.z);
        if (d < bestD && this._visible(e, p)) { bestD = d; best = p; }
      }
      if (!best) { e.state = 'idle'; e.targetId = null; e.trackT = 0; continue; }
      if (e.targetId !== best.id) { e.targetId = best.id; e.trackT = 0; }
      e.state = 'tracking';
      this._face(e, best, dt);
      e.trackT += dt;
      if (e.trackT >= def.trackMs / 1000) {
        e.state = 'laugh'; e.timer = def.laughMs / 1000;
        this._ev(e, 'laugh', e.targetId);
      }
    }
    this.list = this.list.filter((e) => !(e.state === 'dying' && e.timer <= 0));
    const out = this.events;
    this.events = [];
    return out;
  }

  snapshot() {
    return this.list.map((e) => ({ id: e.id, kind: e.kind, x: e.x, y: e.y, z: e.z, yaw: e.yaw, state: e.state }));
  }

  // Hit spheres for live enemies.
  targets() {
    return this.list.filter((e) => e.state !== 'dying').map((e) => {
      const def = this._def(e);
      return { id: e.id, x: e.x, y: e.y + def.hitCenterY, z: e.z, r: def.hitRadius };
    });
  }
}

const def_turn = (def) => def.turnSpeed ?? 8;
