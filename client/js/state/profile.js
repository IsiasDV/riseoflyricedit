// Persistent local player identity (username + lifetime stats), stored in localStorage.
// Lifetime stats are folded in from per-match results via recordMatch().
import { events } from '../core/events.js';
import { isPerk, DEFAULT_PERK } from '../game/perks.js';

const STORAGE_KEY = 'rol.profile';
export const STAT_KEYS = ['gamesPlayed', 'kills', 'deaths', 'downs', 'revives', 'bestRound'];
const DEFAULT_STATS = Object.fromEntries(STAT_KEYS.map((k) => [k, 0]));
const DEFAULTS = { name: 'Player', perk: DEFAULT_PERK, stats: { ...DEFAULT_STATS } };

function randomName() {
  return `Player${Math.floor(1000 + Math.random() * 9000)}`;
}

function cleanStats(raw) {
  const out = { ...DEFAULT_STATS };
  if (raw && typeof raw === 'object') {
    for (const k of STAT_KEYS) {
      const v = Number(raw[k]);
      if (Number.isFinite(v) && v >= 0) out[k] = Math.floor(v);
    }
  }
  return out;
}

class Profile {
  constructor() {
    this.values = { ...DEFAULTS, stats: { ...DEFAULTS.stats } };
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (typeof saved.name === 'string' && saved.name.trim()) this.values.name = saved.name.trim().slice(0, 24);
      else this.values.name = randomName();
      this.values.perk = isPerk(saved.perk) ? saved.perk : DEFAULT_PERK;
      this.values.stats = cleanStats(saved.stats); // drops legacy fields such as `wins`
    } catch (_) {
      this.values.name = randomName();
    }
    this._persist();
  }

  get name() { return this.values.name; }
  get stats() { return this.values.stats; }
  get perk() { return this.values.perk; }

  setPerk(id) {
    if (!isPerk(id)) return false;
    this.values.perk = id;
    this._persist();
    events.emit('profile:perk', { perk: id });
    return true;
  }

  setName(name) {
    const trimmed = (name || '').trim().slice(0, 24);
    if (!trimmed) return false;
    this.values.name = trimmed;
    this._persist();
    events.emit('profile:changed', { name: this.values.name });
    return true;
  }

  // Fold one finished (or abandoned) match into the lifetime totals.
  recordMatch(row, round = 0) {
    if (!row) return;
    const s = this.values.stats;
    const n = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
    s.gamesPlayed += 1;
    s.kills += n(row.kills);
    s.downs += n(row.downs);
    s.revives += n(row.revives);
    s.deaths += n(row.deaths);
    s.bestRound = Math.max(s.bestRound, n(round));
    this._persist();
    events.emit('profile:stats', { stats: { ...s } });
  }

  _persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values)); } catch (_) { /* ignore */ }
  }
}

export const profile = new Profile();
