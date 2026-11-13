// In-game sound effect / music URLs and the chat trigger phrase matcher (pure; shared with the server).
export const SFX = {
  slap: 'assets/general/Slapahh.ogg',
  gunshot: 'assets/general/Gunshot.ogg',
  classic: 'assets/general/Epicness.ogg',
  getMoving: 'assets/general/PlayerSenseGetMoving.ogg'
};

// Positional one-shots preloaded with the map.
export function sfxManifest() {
  return { sounds: [SFX.slap, SFX.gunshot] };
}

// "I sense a beh nearby" (same loose matching); Beh answers in chat.
export const BEH_REPLY = 'No you literally do not.';
export function isSenseBehPhrase(text) {
  return String(text ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').includes('isenseabehnearby');
}

// "I should get moving" in any case / spacing / punctuation, anywhere in a message.
export function isGetMovingPhrase(text) {
  return String(text ?? '').toLowerCase().replace(/[^a-z0-9]/g, '').includes('ishouldgetmoving');
}
