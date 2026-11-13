# Editor Docs: Design 1 - Data Format

Field-by-field schema for every editable group. All coordinates are world-space [x, y, z] in meters. All costs are integer points. Units: meters.

## Editable groups

### playerSpawn {spawn}
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| spawn | [x,y,z] | yes | [0,0,0] | Player feet position + yaw 0 |

### enemyAreas / enemyAreasOpen
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| enemyAreas | array of {min:[x,y,z], max:[x,y,z]} | yes (at least empty []) | [] | Barrier-closed spawn boxes |
| enemyAreasOpen | array of {min:[x,y,z], max:[x,y,z]} | no | undefined | Barrier-open spawn boxes (choco only) |

Each area: min and max are [x,y,z]. min must be <= max component-wise.

### gunSpawns / ammoSpawns
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| gunSpawns | array of [x,y,z] | yes | [] | Gun pickup positions (mirrored to server as {x,y,z}) |
| ammoSpawns | array of [x,y,z] | yes | [] | Ammo pickup positions (mirrored to server as {x,y,z}) |

### interactables
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| barrier | {min:[x,y,z], max:[x,y,z], cost?:number} | no | undefined | Solid gate until paid |
| teleporter | {at:[x,y,z], to:[x,y,z]} | no | undefined | Singular teleporter (ungaland) |
| teleporters | {a:[x,y,z], b:[x,y,z], cost?:number} | no | undefined | Paired teleporters (choco) |
| colorMachine | {at:[x,y,z]} | no | undefined | Bullet color changer |
| powerupMachine | {at:[x,y,z], cost?:number} | no | undefined | Powerup spinner |
| lyricMachine | {at:[x,y,z], cost?:number} | no | undefined | Rise of Lyric orb spawner |

Either `teleporter` or `teleporters` may be present, not both on the same map. `cost` defaults come from `client/js/game/interactions.js` COSTS (spin:500, teleporter:250, colorMachine:100, barrier:500, lyricMachine:650, tpA:50, tpB:50).

### ready
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| ready | boolean | no | true | Match can start on this map |

## Complete inline example: ungaland (all editable fields)

```js
{
  model: 'assets/map_ungaland/map/map.glb',   // read-only
  scale: 2,                                    // read-only
  noCollide: ['Body'],                         // read-only
  spawn: [0, 5.2, 0],                          // editable: player spawn
  enemyAreas: [                                // editable: enemy areas (barrier closed)
    { min: [-18.8, 2.3, 3.8], max: [23.2, 8.2, 30.8] },
    { min: [-14.8, 5.0, -13.4], max: [10.8, 14.3, -0.3] }
  ],
  enemyAreasOpen: undefined,                   // not used on ungaland
  teleporter: { at: [21.3, -10.0, 10.6], to: [0.0, 15.1, -2.2] },  // editable
  colorMachine: { at: [0.2, 8.0, -25.4] },     // editable
  powerupMachine: { at: [-4.1, 1.6, 19.4] },   // editable
  gunSpawns: [                                 // editable (new field)
    [6.4, 3.2, 19.5], [-10.6, 4.8, 31.9], [0.8, 4.0, -7.5]
  ],
  ammoSpawns: [                                // editable (new field)
    [22.5, 1.6, 5.1], [22.4, 5.2, 12.3], [10.7, 1.6, 32.7],
    [-11.7, 0.0, 8.6], [-12.9, 4.0, -8.4], [3.6, 6.4, -16.5]
  ],
  ready: true                                  // editable
}
```

## Complete inline example: choco (teleporters plural + barrier)

```js
{
  model: 'assets/map_choco/map/map.glb',
  scale: 0.35,
  noCollide: [],
  spawn: [0, -1.0, 0],
  enemyAreas: [{ min: [-18.6, -1.1, -30.4], max: [57.7, 10.0, 5.5] }],
  enemyAreasOpen: [{ min: [-22.4, -1.1, -28.6], max: [37.7, 12.2, 130.8] }],
  barrier: { min: [-2.0, -1.1, 22.7], max: [4.6, 5.9, 24.4], cost: 500 },
  teleporters: { a: [5.8, -1.1, -25.8], b: [26.1, 7.7, 137.6], cost: 50 },
  colorMachine: { at: [38.3, 2.6, 116.2] },
  powerupMachine: { at: [50.5, -1.1, 4.8], cost: 350 },
  lyricMachine: { at: [-10.1, 0.8, 92.0], cost: 650 },
  gunSpawns: [ ... ],                          // editable
  ammoSpawns: [ ... ],                         // editable
  ready: true
}
```
