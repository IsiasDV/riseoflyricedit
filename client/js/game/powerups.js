// Powerup drops, team round-lock, timed buffs and the Lyric NPC lifecycle (pure; shared by
// the server lobby and the singleplayer session). Methods push neutral events; call drain().
//   { event: 'drop', id, kind, x, y, z, ttl } | { event: 'gone', id, reason: 'expired'|'taken' }
//   { event: 'picked', kind, playerId, durationMs } | { event: 'buffEnd', playerId, kind }
//   { event: 'lyricJoin', x, y, z } | { event: 'lyricFire', origin, dir } | { event: 'lyricLeave' }
//   { event: 'chat', name, text }
import { LyricNpc, LYRIC_NAME, LYRIC_JOIN, LYRIC_LEAVE, LYRIC_MS } from './lyric.js';

export const DROP_CHANCE = 0.08;
export const DROP_TTL = 15;          // seconds an orb stays on the ground
export const FLICKER_FROM = 7;       // seconds left when the orb starts flickering
export const BUFF_MS = 30000;
export const SPIN_MS = 1400;
export const PICKUP_RADIUS = 2.5;    // server-side tolerance (client touches at ~1.4 m)

export const POWERUPS = {
  nuke:       { label: 'NUKE',          color: 0xff4a3a },
  automation: { label: 'AUTOMATION',    color: 0xffd23a, buff: true, team: true },
  double:     { label: 'DOUBLE POINTS', color: 0x2de0b4, buff: true, team: true },
  insta:      { label: 'INSTA-BEH',     color: 0xff3fa4, buff: true },
  ammo:       { label: 'AMMO',          color: 0x3a8cff },
  lyric:      { label: 'RISE OF LYRIC', color: 0xc84cff }
};
export const KINDS = Object.keys(POWERUPS);

export class PowerupDirector {
  constructor({ world = null, rng = Math.random, dropChance = DROP_CHANCE } = {}) {
    this.world = world;
    this.rng = rng;
    this.dropChance = dropChance;
    this.drops = [];
    this.nextId = 1;
    this.auto = 0;                // seconds left of the team-wide Automation buff
    this.dbl = 0;                 // seconds left of the team-wide Double Points buff
    this.spins = [];              // pending machine spins
    this.insta = new Map();       // playerId -> seconds left of Insta-Beh
    this.lyric = null;
    this.events = [];
  }

  drain() { const e = this.events; this.events = []; return e; }

  onEnemyDown(pos) {
    if (this.rng() >= this.dropChance) return null;
    return this._makeDrop(KINDS[Math.floor(this.rng() * KINDS.length)], pos);
  }

  // Powerup machine: reels spin for SPIN_MS, then a random orb lands 1.6 m in front of it (toward the player).
  spin(machine, player, kind = null) {
    const dx = player.x - machine.x, dz = player.z - machine.z, d = Math.hypot(dx, dz) || 1;
    const x = machine.x + (dx / d) * 1.6, z = machine.z + (dz / d) * 1.6;
    const g = this.world?.groundAt(x, z, machine.y + 1.5, 4);
    this.spins.push({ t: SPIN_MS / 1000, kind, pos: { x, y: g ? g.y : machine.y, z } });
    this.events.push({ event: 'spin', x: machine.x, y: machine.y, z: machine.z });
  }

  _makeDrop(kind, pos) {
    const d = { id: this.nextId++, kind, x: pos.x, y: pos.y, z: pos.z, ttl: DROP_TTL };
    this.drops.push(d);
    this.events.push({ event: 'drop', id: d.id, kind, x: d.x, y: d.y, z: d.z, ttl: d.ttl });
    return d;
  }

  // pos: picker's {x,y,z}. Returns the taken kind, or null if not allowed.
  pickup(playerId, dropId, pos, { radius = PICKUP_RADIUS } = {}) {
    if (!pos) return null;
    const d = this.drops.find((o) => o.id === dropId);
    if (!d) return null;
    if (Math.hypot(pos.x - d.x, pos.z - d.z) > radius || Math.abs(pos.y - d.y) > 3) return null;
    this.drops = this.drops.filter((o) => o !== d);
    this.events.push({ event: 'gone', id: d.id, reason: 'taken' });
    const def = POWERUPS[d.kind];
    this.events.push({ event: 'picked', kind: d.kind, playerId, durationMs: def.buff ? BUFF_MS : 0 });
    if (d.kind === 'automation') this.auto = BUFF_MS / 1000; // everyone's gun, refreshed on re-pickup
    else if (d.kind === 'double') this.dbl = BUFF_MS / 1000;
    else if (d.kind === 'insta') this.insta.set(playerId, BUFF_MS / 1000);
    if (d.kind === 'lyric' && this.lyric) { this.lyric.ttl = LYRIC_MS / 1000; this.lyric.timed.clear(); }
    else if (d.kind === 'lyric') {
      this.lyric = new LyricNpc({ x: pos.x + 1.5, y: pos.y, z: pos.z, world: this.world, rng: this.rng });
      this.events.push({ event: 'lyricJoin', x: this.lyric.x, y: this.lyric.y, z: this.lyric.z });
      this.events.push({ event: 'chat', name: LYRIC_NAME, text: LYRIC_JOIN });
    }
    return d.kind;
  }


  // players: [{id,x,y,z,down}]; targets: enemy hit spheres. Returns nothing; use drain().
  update(dt, players = [], targets = []) {
    for (const s of this.spins) s.t -= dt;
    for (const s of this.spins.filter((o) => o.t <= 0)) this._makeDrop(s.kind ?? KINDS[Math.floor(this.rng() * KINDS.length)], s.pos);
    this.spins = this.spins.filter((o) => o.t > 0);
    for (const d of this.drops) d.ttl -= dt;
    for (const d of this.drops.filter((o) => o.ttl <= 0)) this.events.push({ event: 'gone', id: d.id, reason: 'expired' });
    this.drops = this.drops.filter((o) => o.ttl > 0);

    if (this.auto > 0 && (this.auto -= dt) <= 0) { this.auto = 0; this.events.push({ event: 'buffEnd', playerId: null, kind: 'automation' }); }

    if (this.dbl > 0 && (this.dbl -= dt) <= 0) { this.dbl = 0; this.events.push({ event: 'buffEnd', playerId: null, kind: 'double' }); }
    for (const [id, t] of this.insta) {
      if (t - dt > 0) this.insta.set(id, t - dt);
      else { this.insta.delete(id); this.events.push({ event: 'buffEnd', playerId: id, kind: 'insta' }); }
    }

    if (this.lyric) {
      const r = this.lyric.update(dt, players, targets);
      for (const f of r.fire) this.events.push({ event: 'lyricFire', origin: f.origin, dir: f.dir });
      for (const text of r.chat) this.events.push({ event: 'chat', name: LYRIC_NAME, text });
      if (this.lyric.done) {
        this.lyric = null;
        this.events.push({ event: 'lyricLeave' });
        this.events.push({ event: 'chat', name: LYRIC_NAME, text: LYRIC_LEAVE });
      }
    }
  }

  clear() { this.drops = []; this.spins = []; this.auto = 0; this.dbl = 0; this.insta.clear(); this.lyric = null; this.events = []; }
}
