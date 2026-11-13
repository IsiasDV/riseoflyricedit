# EDITOR_AUDIT — Rise of Lyric

Audit of the existing codebase to inform a future map creator/editor. No existing files were modified; this document (and EDITOR_PROGRESS.md) are the only artifacts produced.

Source of truth: real files read under `C:\Users\conta\Documents\DayToDayProjects\riseoflyric-editor-main`. File paths below are relative to the project root.

--- 

## 1. Project overview

### Language / engine / framework
- **Language**: JavaScript, ESM (`"type": "module"` in `package.json`). Node.js server (>=18) + vanilla browser client.
- **Engine**: No game engine. Rendering via **Three.js r160**, vendored locally at `client/vendor/three.module.min.js` (no CDN, no bundler, no build step). `GLTFLoader` vendored at `client/vendor/GLTFLoader.js`; `SkeletonUtils.js` for skinned-model cloning.
- **Networking**: hand-rolled RFC 6455 WebSocket server (`server/websocket.js`, no `ws` lib) + dependency-free Node HTTP static server (`server/http-server.js`). JSON protocol: `server/protocol.js` (`MSG` constants), client mirror `client/js/net/network.js`.
- **Dependencies**: zero npm (`"dependencies": {}`).
- **Docs**: `ARCHITECTURE.xml` (authoritative inventory), `.clinerules.txt` (editor project rules), `README.md.bak` (gameplay + "adding a map" guide).

### How to build and run
No build step. From project root:
```
node server.js
# open http://localhost:3000
```
Env vars: `PORT` (default 3000), `HOST` (default 0.0.0.0), `DEBUG` (any value enables debug logs). Tests: `node --test test/` (~28 test files using Node's built-in test runner).

### Entry point
- Server: `server.js` — boots `createHttpServer(CONFIG.CLIENT_DIR)`, `WebSocketServer`, `GameServer`; listens on CONFIG.PORT; graceful shutdown on SIGINT/SIGTERM.
- Client: `client/index.html` loads CSS then `<script type="module" src="js/main.js"></script>`.

### Main loop
- Server fixed-tick at `CONFIG.TICK_RATE_HZ = 20 Hz` via `setInterval` → `GameServer._onTick()` → `_tickOnce()` broadcasts a `snapshot` (players only; no movement/physics yet) and `lobbies.broadcastMatchStates(tick)`. Heartbeat every `HEARTBEAT_INTERVAL_MS` (15 s).
  ```js
  this._tickInterval = setInterval(() => this._onTick(), 1000 / CONFIG.TICK_RATE_HZ);
  ```
- Client `requestAnimationFrame` loop: `GameLoop` (`client/js/core/loop.js`), delta clamped to 0.25 s; calls `update` then `render`. In `main.js`, `update` ticks `session`/`flyby`/remote meshes; `render` uses `motionBlur.render(session.scene ?? flyby.scene ?? scene, ...)`.

### Scene / state management
- Server owns `GameServer.players` (id → `{id,name,connection,x,y,z,ry,lastInput}`); players are static placeholders at (0,0,0) — no server movement yet.
- Client owns `WorldState` (`client/js/state/state.js`): `players` Map synced from snapshots via `applySnapshot`.
- `GameSession` (`client/js/game/game-session.js`) owns match lifecycle: `state ∈ {idle, countdown, loading, black, playing}`; `this.level` (active) / `this.pendingLevel` (built during loading). Lobby phase (`lobby.phase ∈ {lobby,countdown,loading,playing}`) managed by `LobbyManager` (`server/lobby-manager.js`).
- Multiplayer flow: `countdown` → `loadMap` → (all loaded) `matchBegin` → gameplay → `gameOver` → lobby. Singleplayer runs the same steps locally.

---
*Section 2 continues on next edit*
## 2. Level representation

Levels are **not data files**. Each level/map is a **JavaScript module** exporting a definition object with a `createLevel(loaded)` factory. There is no JSON level format and no level editor yet.

### Map registry
- `client/js/maps/maps.js`: `MAPS` array of 5 map definition objects; `getMap(id)`, `listMaps()`, `nextMapId(currentId)`. Comment: "To add a map: create a definition file, import it here, and mirror its id/name in server/maps.js."
- `server/maps.js`: server mirror `MAPS` (ids/names only), `isMapReady(id)` (delegates to client `isReady`), `SECRET_MAPS`, `TAUNT_MAPS`, `INTRO_MAPS`, `GUN_SPAWNS`, `AMMO_SPAWNS`, `DEFAULT_MAP_ID`.

### Map metadata (facts shared by client level builder and server collision loader)
`client/js/maps/map-data.js` exports `MAP_DATA` keyed by map id. Each entry:
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
The `ready` flag lives on `MAP_DATA[id].ready !== false`; `isReady(id)` returns true unless explicitly `ready: false`. Current readiness:
- `night-of-the-living-void`: ready
- `ungaland`: ready
- `choco-rocklate-gladiator-arena`: ready
- `endless-shot`: **ready: false** (scaffold)
- `fearvelations`: **ready: false** (scaffold)

### Per-map definition (`client/js/maps/<id>.js`)
Each exports: `id, name, description, ready, banner, loadingBackground, loadingAudio, secret {audio}, intro {video, blackHoldMs, fadeMs}?, minLoadingMs?, bgmInGame?, taunts?, greeting {from,text}, assets {images[], models[]}, createLevel(loaded)`.

### `createLevel(loaded)` — level factory (illustrated by `night-of-the-living-void.js`)
```js
createLevel(loaded) {
  const scene = new THREE.Scene();
  // ... lights, fog, sky dome ...
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
## 2. Level representation

Levels are **not data files**. Each level/map is a **JavaScript module** exporting a definition object with a `createLevel(loaded)` factory. There is no JSON level format and no level editor yet.

### Map registry
- `client/js/maps/maps.js`: `MAPS` array of 5 map definition objects; `getMap(id)`, `listMaps()`, `nextMapId(currentId)`. Comment: "To add a map: create a definition file, import it here, and mirror its id/name in server/maps.js."
- `server/maps.js`: server mirror `MAPS` (ids/names only), `isMapReady(id)` (delegates to client `isReady`), `SECRET_MAPS`, `TAUNT_MAPS`, `INTRO_MAPS`, `GUN_SPAWNS`, `AMMO_SPAWNS`, `DEFAULT_MAP_ID`.

### Map metadata (facts shared by client level builder and server collision loader)
`client/js/maps/map-data.js` exports `MAP_DATA` keyed by map id. Each entry:
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
The `ready` flag lives on `MAP_DATA[id].ready !== false`; `isReady(id)` returns true unless explicitly `ready: false`. Current readiness:
- `night-of-the-living-void`: ready
- `ungaland`: ready
- `choco-rocklate-gladiator-arena`: ready
- `endless-shot`: **ready: false** (scaffold)
- `fearvelations`: **ready: false** (scaffold)

### Per-map definition (`client/js/maps/<id>.js`)
Each exports: `id, name, description, ready, banner, loadingBackground, loadingAudio, secret {audio}, intro {video, blackHoldMs, fadeMs}?, minLoadingMs?, bgmInGame?, taunts?, greeting {from,text}, assets {images[], models[]}, createLevel(loaded)`.

### `createLevel(loaded)` — level factory (illustrated by `night-of-the-living-void.js`)
```js
createLevel(loaded) {
  const scene = new THREE.Scene();
  // ... lights, fog, sky dome ...
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
- If model fails → placeholder PlaneGeometry(400,400)+GridHelper.
- Collision via `trianglesFromMeshes(meshes)` → `CollisionWorld`; server rebuilds from `.glb` bytes independently.

---
*Section 3 begins on the next line*
    interactables: [...],
    update(dt,camera) {...},
    dispose() {...}
  };
}
```
- If model fails → placeholder PlaneGeometry(400,400)+GridHelper.
- Collision via `trianglesFromMeshes(meshes)` → `CollisionWorld`; server rebuilds from `.glb` bytes independently.
# EDITOR_AUDIT — Rise of Lyric

Audit of the existing codebase to inform a future map creator/editor. No existing files were modified; this document (and EDITOR_PROGRESS.md) are the only artifacts produced.

Source of truth: real files read under `C:\Users\conta\Documents\DayToDayProjects\riseoflyric-editor-main`. File paths below are relative to the project root.

--AUDIT_PART1_END--

## 1. Project overview

### Language / engine / framework
- Language: JavaScript, ESM (`"type": "module"` in `package.json`). Node.js server (>=18) + vanilla browser client.
- Engine: no game engine. Rendering via Three.js r160, vendored locally at `client/vendor/three.module.min.js` (no CDN, no bundler, no build step). `GLTFLoader` vendored at `client/vendor/GLTFLoader.js`; `SkeletonUtils.js` for skinned-model cloning.
- Networking: hand-rolled RFC 6455 WebSocket server (`server/websocket.js`, no `ws` lib) + dependency-free Node HTTP static server (`server/http-server.js`). JSON protocol: `server/protocol.js` (`MSG` constants), client mirror `client/js/net/network.js`.
- Dependencies: zero npm (`"dependencies": {}`).
- Docs: `ARCHITECTURE.xml` (authoritative inventory), `.clinerules.txt` (editor project rules), `README.md.bak` (gameplay + "adding a map" guide).

### How to build and run
No build step. From project root:
```
node server.js
# open http://localhost:3000
```
Env vars: `PORT` (default 3000), `HOST` (default 0.0.0.0), `DEBUG` (any value enables debug logs). Tests: `node --test test/` (~28 test files).

### Entry point
- Server: `server.js` — boots `createHttpServer(CONFIG.CLIENT_DIR)`, `WebSocketServer`, `GameServer`; listens on CONFIG.PORT; graceful shutdown on SIGINT/SIGTERM.
- Client: `client/index.html` loads CSS then `<script type="module" src="js/main.js"></script>`.

### Main loop
- Server fixed-tick at `CONFIG.TICK_RATE_HZ = 20 Hz` via `setInterval` → `GameServer._onTick()` → `_tickOnce()` broadcasts a `snapshot` (players only; no movement/physics yet) and `lobbies.broadcastMatchStates(tick)`. Heartbeat every `HEARTBEAT_INTERVAL_MS` (15 s).
  ```js
  this._tickInterval = setInterval(() => this._onTick(), 1000 / CONFIG.TICK_RATE_HZ);
  ```
- Client `requestAnimationFrame` loop: `GameLoop` (`client/js/core/loop.js`), delta clamped to 0.25 s; calls `update` then `render`. In `main.js`, `update` ticks `session`/`flyby`/remote meshes; `render` uses `motionBlur.render(session.scene ?? flyby.scene ?? scene, ...)`.

### Scene / state management
- Server owns `GameServer.players` (id → `{id,name,connection,x,y,z,ry,lastInput}`); players are static placeholders at (0,0,0) — no server movement yet.
- Client owns `WorldState` (`client/js/state/state.js`): `players` Map synced from snapshots via `applySnapshot`.
- `GameSession` (`client/js/game/game-session.js`) owns match lifecycle: `state ∈ {idle, countdown, loading, black, playing}`; `this.level` (active) / `this.pendingLevel` (built during loading). Lobby phase (`lobby.phase ∈ {lobby,countdown,loading,playing}`) managed by `LobbyManager` (`server/lobby-manager.js`).
- Multiplayer flow: `countdown` → `loadMap` → (all loaded) `matchBegin` → gameplay → `gameOver` → lobby. Singleplayer runs the same steps locally.
--AUDIT_PART1_DONE--
## 2. Level representation

Levels are **not data files**. Each level/map is a **JavaScript module** exporting a definition object with a `createLevel(loaded)` factory. There is no JSON level format and no level editor yet.

### Map registry
- `client/js/maps/maps.js`: `MAPS` array of 5 map definition objects; `getMap(id)`, `listMaps()`, `nextMapId(currentId)`. Comment: "To add a map: create a definition file, import it here, and mirror its id/name in server/maps.js."
- `server/maps.js`: server mirror `MAPS` (ids/names only), `isMapReady(id)` (delegates to client `isReady`), `SECRET_MAPS`, `TAUNT_MAPS`, `INTRO_MAPS`, `GUN_SPAWNS`, `AMMO_SPAWNS`, `DEFAULT_MAP_ID`.

### Map metadata (facts shared by client level builder and server collision loader)
`client/js/maps/map-data.js` exports `MAP_DATA` keyed by map id. Each entry:
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
The `ready` flag lives on `MAP_DATA[id].ready !== false`; `isReady(id)` returns true unless explicitly `ready: false`. Current readiness:
- `night-of-the-living-void`: ready
- `ungaland`: ready
- `choco-rocklate-gladiator-arena`: ready
- `endless-shot`: **ready: false** (scaffold)
- `fearvelations`: **ready: false** (scaffold)

### Per-map definition (`client/js/maps/<id>.js`)
Each exports: `id, name, description, ready, banner, loadingBackground, loadingAudio, secret {audio}, intro {video, blackHoldMs, fadeMs}?, minLoadingMs?, bgmInGame?, taunts?, greeting {from,text}, assets {images[], models[]}, createLevel(loaded)`.

### `createLevel(loaded)` — level factory (illustrated by `night-of-the-living-void.js`)
```js
createLevel(loaded) {
  const scene = new THREE.Scene();
  // ... lights, fog, sky dome ...
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
- If model fails → placeholder PlaneGeometry(400,400)+GridHelper.
- Collision via `trianglesFromMeshes(meshes)` → `CollisionWorld`; server rebuilds from `.glb` bytes independently.## 3. Placeable things
### 3.1 Terrain / map geometry^<br>- File/fn: client/js/maps/<id>.js createLevel(loaded). Model from MAP_DATA[<id>].model, scaled by MAP_DATA.scale.^<br>- Collision: trianglesFromMeshes(meshes)->CollisionWorld (static triangle soup, uniform XZ grid, sphere push-out, vertical ground queries). Skinned meshes excluded (visual only). Server independently rebuilds from .glb bytes via trianglesFromGlb (server/map-world.js).^<br>- Rendering: Added to map THREE.Scene; per-map lights/fog. Placeholder PlaneGeometry+GridHelper if model fails.
### 3.2 Kill plane / fall boundary^<br>- File/fn: computed per map as killY = collision.bounds.minY - 30 (game-session.js). No visual representation. Assumption: infinite horizontal kill floor at minY - 30.
### 3.2 Kill plane / fall boundary
### 3.3 Player spawn point^<br>- File/fn: MAP_DATA[<id>].spawn; set in game-session.js.^<br>- Collision: PlayerController radius 0.35, step height 0.4. All players share spawn, can overlap.^<br>- Rendering: None for spawn; local first-person, remote as placeholder boxes.
