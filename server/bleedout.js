// Bleedout bookkeeping (pure; timestamps are passed in).
export const BLEED = { DOWN_MS: 30000, REVIVE_MS: 5000, GAP_MS: 400 };

export class BleedoutState {
  constructor(cfg = BLEED) { this.cfg = cfg; this.until = new Map(); this.prog = new Map(); }
  down(id, now) { this.until.set(id, now + this.cfg.DOWN_MS); this.prog.delete(id); }
  isDown(id) { return this.until.has(id); }
  clear(id) { this.until.delete(id); this.prog.delete(id); }

  // Ids whose time ran out (removed from the downed set).
  expired(now) {
    const out = [];
    for (const [id, t] of this.until) if (t <= now) out.push(id);
    out.forEach((id) => this.clear(id));
    return out;
  }

  // One "holding revive" message from reviverId. True when the revive completes.
  revive(reviverId, targetId, now, inRange, reviveMs = this.cfg.REVIVE_MS) {
    if (!this.isDown(targetId) || this.isDown(reviverId) || reviverId === targetId) return false;
    if (!inRange) { this.prog.delete(targetId); return false; }
    let p = this.prog.get(targetId);
    if (!p || p.by !== reviverId || now - p.last > this.cfg.GAP_MS) p = { by: reviverId, start: now, last: now };
    p.last = now;
    this.prog.set(targetId, p);
    if (now - p.start >= reviveMs) { this.clear(targetId); return true; }
    return false;
  }
}
