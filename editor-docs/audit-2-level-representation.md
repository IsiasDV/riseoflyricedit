# Editor Docs: Audit 2 - Level Representation

How levels are defined today: map modules, createLevel, MAP_DATA, readiness flags.

## Level Definition Model
Levels are NOT data files. Each level/map is a JavaScript module exporting a definition object with a `createLevel(loaded)` factory. There is no JSON level format and no level editor yet.

## Map Registry
- `client/js/maps/maps.js`: MAPS array of 5 map definition objects; getMap(id), listMaps(), nextMapId(currentId). Comment: "To add a map: create a definition file, import it here, and mirror its id/name in server/maps.js."
- `server/maps.js`: server mirror MAPS (ids/names only), isMapReady(id) (delegates to client isReady), SECRET_MAPS, TAUNT_MAPS, INTRO_MAPS, GUN_SPAWNS, AMMO_SPAWNS, DEFAULT_MAP_ID.

## Map Metadata (client/js/maps/map-data.js)
Each entry in MAP_DATA keyed by map id:
```js
'ungaland': {
  model: 'assets/map_ungaland/map/map.glb',
  scale: 2,
  noCollide: ['Body'],
  spawn: [0, 5.2, 0],
  enemyAreas: [{ min: [-18.8, 2.3, 3.8], max: [23.2, 8.2, 30.8] }],
  teleporter: { at: [21.3, -10.0, 10.6], to: [0.0, 15.1, -2.2] },
  colorMachine: { at: [0.2, 8.0, -25.4] },
  powerupMachine: { at: [-4.1, 1.6, 19.4] }
}
```
The ready flag lives on `MAP_DATA[id].ready !== false`; isReady(id) returns true unless explicitly ready: false.

Current readiness:
- night-of-the-living-void: ready
- ungaland: ready
- choco-rocklate-gladiator-arena: ready
- endless-shot: ready: false (scaffold)
- fearvelations: ready: false (scaffold)

## Per-map Definition (client/js/maps/<id>.js)
Each exports: id, name, description, ready, banner, loadingBackground, loadingAudio, secret {audio}, intro {video, blackHoldMs, fadeMs}, minLoadingMs?, bgmInGame?, taunts?, greeting {from,text}, assets {images[], models[]}, createLevel(loaded).

## createLevel (level factory)
```js
createLevel(loaded) {
  const scene = new THREE.Scene();
  //...lights, fog, sky dome...
  const model = loaded?.models?.[MODEL];
  const spawn = { x: 0, y: 0.5, z: 0, yaw: 0 };
  let collision = null, killY = -100;
  if (model) {
    model.scale.setScalar(MODEL_SCALE);
    scene.add(model);
    scene.updateMatrixWorld(true);
    const meshes = [];
    model.traverse(o => {
      if (o.isMesh && !NO_COLLIDE.includes(o.name)) meshes.push({geometry: o.geometry, matrixWorld: o.matrixWorld});
    });
    collision = new CollisionWorld(trianglesFromMeshes(meshes));
    killY = collision.bounds.minY - 30;
  } else {
    console.warn(`[map] ${MODEL} did not load; using placeholder ground`);
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(400,400), new THREE.MeshStandardMaterial({color:0x14172a})).rotateX(-Math.PI/2));
  }
  return {
    scene, groundY: 0, collision, killY,
    gunSpawns: guns.spawns, ammoSpawns: ammo.spawns,
    spawn,
    interactables: [...],
    update(dt,camera) {...},
    dispose() {...}
  };
}
```
- If model fails, placeholder PlaneGeometry(400,400)+GridHelper is used.
- Collision via trianglesFromMeshes(meshes) -> CollisionWorld; server rebuilds from .glb bytes independently.

## Gun/Ammo Spawns per Map
Each map file (e.g., ungaland.js) hardcodes:
- GUN_SPAWNS: [[6.4, 3.2, 19.5], [-10.6, 4.8, 31.9], [0.8, 4.0, -7.5]]
- AMMO_SPAWNS: [[22.5, 1.6, 5.1], [22.4, 5.2, 12.3], [10.7, 1.6, 32.7], [-11.7, 0.0, 8.6], [-12.9, 4.0, -8.4], [3.6, 6.4, -16.5]]
These are mirrored in server/maps.js and used by the server for multiplayer.

---
*End of audit-2-level-representation.md*