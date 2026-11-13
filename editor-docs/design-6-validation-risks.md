# Editor Docs: Design 6 - Validation Rules and Risks

## Validation rules (checked before save / before test-play)

### Spawn point must be on map surface
For gun/ammo/player spawn: run `CollisionWorld.groundAt(x, z, y + 2, 4)` (existing method, returns {x,y,z,ny} or null). Require a result and `|result.y - y| < 1.5` (within 1.5m of the floor). If not on surface, flag "spawn floats above/below floor".

### Enemy area box must contain walkable floor
For each enemy area {min,max}: sample the center `(min+max)/2` with `groundAt(x, z, y1+30, 400)`. Require result.y between min.y and max.y (inside the box height). Also require `result.ny >= 0.8` (flat enough to stand). Use `buildSpawnPoints`-style logic but as a quick validation: at least one valid floor cell inside the box.

### Teleporter `to` must be on surface
Same groundAt check as spawn. Destination must be within map bounds (collision bounds minX/maxX/minZ/maxZ).

### Barrier box inside map bounds
Barrier min/max must be within collision world bounds (minX<=min.x, max.x<=maxX, etc.). Barrier cost >= 0 and <= 10000.

### Costs >= 0
All interactable costs clamped to [0, 10000]. Default costs from interactions.js COSTS apply if omitted.

### enemyAreas min <= max
For every area, min.x<=max.x, min.y<=max.y, min.z<=max.z. Otherwise invalid.

### killY awareness
killY = collision.bounds.minY - 30 (existing). Spawns below killY are flagged. Editor does not edit killY (derived, read-only).

## How checks use existing collision code

- `client/js/game/collision-world.js` exports `CollisionWorld` with `groundAt(x, z, fromY, maxDist)` and `raycast(...)`. The editor builds a CollisionWorld from the loaded map .glb meshes (same as `createLevel` does client-side) and calls these methods.
- Map bounds come from `collision.bounds` ({minX,maxX,minY,maxY,minZ,maxZ}).

## Three most likely failure points and how the design avoids each

### 1. Client/server drift
Server/maps.js GUN_SPAWNS/AMMO_SPAWNS could diverge from MAP_DATA after the move. Avoided: server/maps.js derives both from MAP_DATA at server startup (one source). maps.test.mjs asserts equality, so drift is caught in CI/tests.

### 2. Breaking multiplayer
Editor runs in a standalone page; it never touches the running server or other clients. Saving writes a download file or localStorage only. Test-play applies MAP_DATA overrides in place for one tab only and reverts on reload. Multiplayer server reads MAP_DATA at startup; saved editor data affects multiplayer only after a server restart (design-3, decision D). The editor warns the user: "Multiplayer picks up saved data only after server restart."

### 3. Bad data crashing createLevel
A malformed MAP_DATA entry (e.g. enemyAreas with min>max, missing spawn) could throw inside `createLevel` or `loadSpawnPoints`. Avoided: validation rules above run before save and before test-play; invalid fields are highlighted in the property panel and save/test-play are blocked until fixed. If a draft somehow crashes createLevel, the game page shows the existing placeholder-ground fallback (createLevel already handles model-load failure gracefully), and refreshing the game tab clears the test-play draft because the query param is gone.
