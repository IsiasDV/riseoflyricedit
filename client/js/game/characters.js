// Playable characters. Each match every player is randomly assigned one
// (server-side in multiplayer, locally in singleplayer). Assets: client/assets/char_<id>/.
// yawOffset rotates the model so its front faces the avatar's forward (-Z);
// glTF models conventionally face +Z, hence PI.
export const CHARACTERS = {
  void: {
    id: 'void',
    name: 'Void',
    health: 100,
    model: 'assets/char_void/model/Void.glb',
    sfx: ['assets/char_void/sfx/start1.m4a', 'assets/char_void/sfx/start2.m4a'],
    reload: 'assets/char_void/sfx/reload.m4a',
    down: 'assets/char_void/sfx/down.m4a',
    yawOffset: Math.PI,
    scale: 0.15 // multiplier on the normalized avatar height
  },
  boss: {
    id: 'boss',
    name: 'Boss Baby',
    health: 50,
    model: 'assets/char_boss/model/babyboss.glb',
    sfx: ['assets/char_boss/sfx/start1.m4a', 'assets/char_boss/sfx/start2.m4a'],
    reload: 'assets/char_boss/sfx/reload.m4a',
    down: 'assets/char_boss/sfx/down.m4a',
    yawOffset: Math.PI / 2,
    scale: 1
  },
  dave: {
    id: 'dave',
    name: 'Dave the Manager',
    health: 100,
    model: 'assets/char_dave/model/Davesworth.glb',
    sfx: ['assets/char_dave/sfx/BlackGuyEnter1.mp3', 'assets/char_dave/sfx/BlackGuyEnter2.mp3'],
    reload: ['assets/char_dave/sfx/BlackGuyReload1.mp3', 'assets/char_dave/sfx/BlackGuyReload2.mp3'],
    down: ['assets/char_dave/sfx/BlackGuyDown1.mp3', 'assets/char_dave/sfx/BlackGuyDown2.mp3'],
    yawOffset: Math.PI,
    scale: 1
  }
};

export const CHARACTER_IDS = Object.keys(CHARACTERS);

export function randomCharacterId() {
  return CHARACTER_IDS[Math.floor(Math.random() * CHARACTER_IDS.length)];
}

// A random voice line: `kind` is 'sfx' (match start), 'reload' or 'down'; entries may be a string or a list.
export function pickSfx(charId, kind) {
  const v = CHARACTERS[charId]?.[kind];
  if (!v) return null;
  return Array.isArray(v) ? v[Math.floor(Math.random() * v.length)] : v;
}

export const randomStartSfx = (charId) => pickSfx(charId, 'sfx');

// Asset manifest entries needed for a match: every model (any player may be
// either character) plus the local character's start voice lines.
export const voiceUrls = (charId) => [CHARACTERS[charId]?.sfx, CHARACTERS[charId]?.reload, CHARACTERS[charId]?.down].flat().filter(Boolean);

// `characters` ({ playerId: charId }) adds every voice line in the match as `sounds` (decoded for spatial playback).
export function characterManifest(localCharId, characters = {}) {
  const inMatch = new Set([localCharId, ...Object.values(characters)].filter((id) => CHARACTERS[id]));
  return {
    sounds: [...new Set([...inMatch].flatMap(voiceUrls))],
    models: CHARACTER_IDS.map((id) => CHARACTERS[id].model),
    audio: [...new Set([CHARACTERS[localCharId]?.sfx, CHARACTERS[localCharId]?.reload, CHARACTERS[localCharId]?.down].flat().filter(Boolean))]
  };
}
