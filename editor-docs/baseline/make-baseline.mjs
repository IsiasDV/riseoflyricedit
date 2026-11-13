import { GUN_SPAWNS, AMMO_SPAWNS } from '../server/maps.js';
import fs from 'node:fs';
const data = { gunSpawns: GUN_SPAWNS, ammoSpawns: AMMO_SPAWNS };
fs.writeFileSync('spawns.baseline.json', JSON.stringify(data, null, 2));
console.log('Baseline written:');
console.log(JSON.stringify(data, null, 2));