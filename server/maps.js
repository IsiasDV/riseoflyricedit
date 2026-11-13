import { MAP_DATA } from '../client/js/maps/map-data.js';

// Shared map registry (ids/names only). Mirrors client/js/maps/maps.js so the
// server can validate map selection messages without needing banner art.
export const MAPS = [
  { id: 'night-of-the-living-void', name: 'Night of the Living Void' },
  { id: 'ungaland', name: 'Ungaland' },
  { id: 'choco-rocklate-gladiator-arena', name: 'Choco-rocklate Gladiator Arena' },
  { id: 'endless-shot', name: 'Endless Shot' },
  { id: 'fearvelations', name: 'Fearvelations' }
];

// False while a map is still missing its assets (no match can start on it).
export const isMapReady = (id) => MAP_DATA[id]?.ready !== false;

// Maps that have a once-per-match secret song.
export const SECRET_MAPS = new Set(['night-of-the-living-void', 'ungaland', 'choco-rocklate-gladiator-arena']);

// Maps where Grandmaster Beh taunts players in the chat.
export const TAUNT_MAPS = new Set(['choco-rocklate-gladiator-arena']);

// Maps with an intro cutscene before loading (players vote to skip it with ENTER).
export const INTRO_MAPS = new Set(['choco-rocklate-gladiator-arena']);

// Gun spawn floor positions per map (derived from MAP_DATA[id].gunSpawns).
export const GUN_SPAWNS = {};
for (const [id, entry] of Object.entries(MAP_DATA)) {
  GUN_SPAWNS[id] = (entry.gunSpawns || []).map(([x, y, z]) => ({ x, y, z }));
}

// Ammo spawn floor positions per map (derived from MAP_DATA[id].ammoSpawns).
export const AMMO_SPAWNS = {};
for (const [id, entry] of Object.entries(MAP_DATA)) {
  AMMO_SPAWNS[id] = (entry.ammoSpawns || []).map(([x, y, z]) => ({ x, y, z }));
}

export const DEFAULT_MAP_ID = MAPS[0].id;

export function isValidMapId(id) {
  return MAPS.some((m) => m.id === id);
}
