// Per-match player stats for the game-over leaderboard (pure; shared by client and server).
export class MatchStats {
  constructor() { this.map = new Map(); this.version = 0; }

  register(id, name, char) {
    this.map.set(id, { id, name, char, kills: 0, points: 0, downs: 0, revives: 0, deaths: 0, status: 'alive' });
    this.version++;
  }

  _bump(id, key, n = 1) { const r = this.map.get(id); if (r) { r[key] += n; this.version++; } }
  addPoints(id, n) { if (n > 0) this._bump(id, 'points', n); }
  spendPoints(id, n) {
    const r = this.map.get(id);
    if (!r || !(n >= 0) || r.points < n) return false;
    r.points -= n; this.version++;
    return true;
  }
  kill(id) { this._bump(id, 'kills'); }
  down(id) { this._bump(id, 'downs'); this.setStatus(id, 'down'); }
  revive(id) { this._bump(id, 'revives'); }
  setStatus(id, status) {
    const r = this.map.get(id);
    if (!r || r.status === status) return;
    if (status === 'dead') r.deaths++;
    r.status = status;
    this.version++;
  }

  rows() {
    return [...this.map.values()].map((r) => ({ ...r })).sort((a, b) => b.kills - a.kills);
  }
}
