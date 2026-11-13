// Client-side map registry. Each entry is a map definition (see
// night-of-the-living-void.js for the shape): metadata for the lobby, an asset
// manifest for the loading screen, and createLevel() to build the playable scene.
// To add a map: create a definition file, import it here, and mirror its id/name
// in server/maps.js.
import { nightOfTheLivingVoid } from './night-of-the-living-void.js';
import { ungaland } from './ungaland.js';
import { chocoRocklateGladiatorArena } from './choco-rocklate-gladiator-arena.js';
import { endlessShot } from './endless-shot.js';
import { fearvelations } from './fearvelations.js';

export const MAPS = [nightOfTheLivingVoid, ungaland, chocoRocklateGladiatorArena, endlessShot, fearvelations];

export const DEFAULT_MAP_ID = MAPS[0].id;

export function getMap(id) {
  return MAPS.find((m) => m.id === id) || MAPS[0];
}

export function listMaps() {
  return MAPS;
}

export function nextMapId(currentId) {
  const i = MAPS.findIndex((m) => m.id === currentId);
  return MAPS[(i + 1 + MAPS.length) % MAPS.length].id;
}
