// Points awarded per kill (pure; shared by client and server).
export const POINTS = { slap: 50, gun: 25, insta: 25 };
export const DOUBLE_MULT = 2;

export const killPoints = (source, doubled = false) => (POINTS[source] ?? 0) * (doubled ? DOUBLE_MULT : 1);

// stats: MatchStats. Unknown ids (e.g. Lyric's bullets) are ignored by addPoints.
export function scoreKill(stats, playerId, source, doubled = false) {
  stats.addPoints(playerId, killPoints(source, doubled));
}

// Player ids from a { id: charId } map; JSON object keys are strings but server ids are numbers.
export const matchPlayerIds = (characters = {}) => Object.keys(characters).map((k) => (k === 'local' || Number.isNaN(Number(k)) ? k : Number(k)));

// Entries for the points list: [{ id, me, points, perk }].
export function pointsEntries({ rows, ids, meId, perks = {}, myPerk }) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.filter((id) => byId.get(id)?.status !== 'left').map((id) => ({
    id, me: id === meId, points: byId.get(id)?.points ?? 0, perk: id === meId ? myPerk : perks[id]
  }));
}
