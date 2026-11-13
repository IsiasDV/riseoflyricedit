// Playable characters. Assets live in client/assets/char_<id>/.
export const CHARACTER_IDS = ['void', 'boss', 'dave'];

export function randomCharacter() {
  return CHARACTER_IDS[Math.floor(Math.random() * CHARACTER_IDS.length)];
}

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// An (almost) even split of characters for `count` players, shuffled.
// Extra slots go to randomly ordered characters.
export function balancedCharacters(count) {
  const order = shuffle([...CHARACTER_IDS]);
  return shuffle(Array.from({ length: count }, (_, i) => order[i % order.length]));
}

// A random character among the least-used ones in `taken` (list of character ids already in the lobby).
export function pickLobbyCharacter(taken = []) {
  const count = (id) => taken.filter((t) => t === id).length;
  const min = Math.min(...CHARACTER_IDS.map(count));
  const pool = CHARACTER_IDS.filter((id) => count(id) === min);
  return pool[Math.floor(Math.random() * pool.length)];
}
