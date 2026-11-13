// Enemy definitions (timings in ms, distances in metres). Add an enemy = add an entry.
const DIR = 'assets/enemy_beh';
export const ENEMY_DEFS = {
  beh: {
    id: 'beh',
    model: `${DIR}/model/BEH.glb`,
    sfx: { laugh: `${DIR}/sfx/BehLaugh.ogg`, dehd: `${DIR}/sfx/BehDehd.ogg`, ow: `${DIR}/sfx/BehOw.ogg` },
    height: 2.2,
    hitRadius: 1.0,
    hitCenterY: 1.1,
    eyeY: 1.6,
    sightRange: 60,
    trackMs: 3000,
    laughMs: 2010,
    dehdMs: 280,
    dieMs: 2500,
    turnSpeed: 6,           // 1/s yaw easing
    anims: { idle: 'Beh', die: 'Moving' },
    yawOffset: Math.PI / 2
  },
  // The Meh: same model as the Beh at 80% size, but it chases the nearest player and downs them on touch.
  meh: {
    id: 'meh',
    kind: 'chaser',
    model: 'assets/enemy_meh/model/BEH.glb',
    sfx: { spawn: 'assets/enemy_meh/sfx/spawn.mp3', attack: 'assets/enemy_meh/sfx/attack.mp3', ow: 'assets/enemy_meh/sfx/die.mp3' },
    height: 1.76,
    hitRadius: 0.8,
    hitCenterY: 0.88,
    speed: 6,               // m/s
    touchRadius: 0.9,       // horizontal reach that counts as touching a player
    cooldownMs: 800,        // pause after an attack before chasing the next player
    dieMs: 2500,
    turnSpeed: 12,
    anims: { idle: 'Beh', die: 'Moving' },
    yawOffset: Math.PI / 2
  }
};
export const DEFAULT_ENEMY = 'beh';

export const MEH_CHANCE = 0.10;
export const MEH_FROM_ROUND = 5;

// Which enemy a new spawn slot becomes: from round 5 each slot has a 10% chance to be a Meh.
export function pickEnemyKind(round, rng = Math.random) {
  return round >= MEH_FROM_ROUND && rng() < MEH_CHANCE ? 'meh' : DEFAULT_ENEMY;
}

// Models + sounds for every enemy type (any of them can appear in a match).
export function enemyManifest(defs = Object.values(ENEMY_DEFS)) {
  const list = Array.isArray(defs) ? defs : [defs];
  return { models: [...new Set(list.map((d) => d.model))], sounds: [...new Set(list.flatMap((d) => Object.values(d.sfx)))] };
}
