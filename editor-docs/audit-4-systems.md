# Editor Docs: Audit 4 - Systems

Input, camera, rendering, collision, asset loading, game-session level setup, and server map data usage.

## Input Handling
- `client/js/input/input.js` `InputManager`: keyboard `keys`/`pressed` sets, pointer-lock mouse deltas (`consumeMouseDelta`), gamepad polling (`pollGamepad`: sticks with 0.15 deadzone, held/edge buttons). Canvas click requests pointer lock. No movement logic here - pure state recording.

## Gameplay Input
- `client/js/game/free-look.js` `FreeLook`: applies mouse/stick deltas to camera yaw/pitch (sensitivity from `settings.lookScale()`), clamps pitch.
- `client/js/game/player-controller.js` `PlayerController`: walk/run/crouch/jump, ground/air accel, gravity, knockback, noclip `flyUpdate`. Optional `CollisionWorld`; else flat `groundY`.

## Camera
- `client/js/render/camera.js` `createCamera()`: PerspectiveCamera FOV 70, near 0.1, far 1000.
- Applied via `FreeLook` (`client/js/game/free-look.js`); `head-bob.js`, `cinematic.js` exist but not fully reviewed.

## Rendering
- `client/js/render/renderer.js` `createRenderer(canvas)`: `WebGLRenderer({antialias, stencil})`, pixel ratio capped at 2, `bindResize`.
- `main.js` `render()`: `motionBlur.render(session.scene ?? flyby.scene ?? scene, camera, ...)`.
- Sky dome uses `renderOrder = -1`; fog per scene. Transparent/additive blended pickups and props.
- No formal render-layer system beyond `renderOrder` and manual scene selection (lobby backdrop flyby vs match level vs base scene).

## Collision
- `client/js/game/collision-world.js` `CollisionWorld`: static triangle soup, uniform XZ grid (CSR typed arrays), normals, `pushOut` (sphere collision + slide), `groundAt`, `raycast`, `markGate`/`setGateOpen` (gated barrier triangles ignored when open). `gatedWorld(tris, barrier)` appends barrier box and marks its triangle range. `trianglesFromMeshes(meshes)` converts THREE meshes to world-space triangles.
- Server `server/map-world.js` `trianglesFromGlb(buf, scale, noCollide)` parses `.glb` accessors (no Three.js) into world-space triangles; `loadMapWorld` wraps with `gatedWorld`.
- `client/js/game/nav.js` `findPath`/`segmentClear`: A* over 0.75 m grid on `CollisionWorld` for the Meh chaser.

## Asset Loading
- `client/js/core/assets.js` `loadAssets(manifest = {}, onProgress)`: `LOADERS.images/models/sounds/audio`; models via GLTFLoader (`gltf.scene.animations` kept). Progress 0 to 1; failures non-fatal. Manifests: per-map `assets`, `weaponManifest()`, `enemyManifest(defs)`, `characterManifest(...)`, `announcerManifest`, `sfxManifest`, `weaponManifest`.

## GameSession Level Setup
- `GameSession` (client/js/game/game-session.js) owns match lifecycle: `state in {idle, countdown, loading, black, playing}`.
- `this.level` (active) / `this.pendingLevel` (built during loading).
- `pendingLevel` built via `getMap(id).createLevel(loaded)` after `loadAssets(...)` preloads the map's manifest.
- The map's `createLevel` builds: THREE scene, lights, fog, sky, props, pickups, collision world, spawn, interactables.

## Server Usage of Map Data
- Server uses MAP_DATA in two key places:
  1. `server/map-world.js` `loadMapWorld(mapId)`: parses the map .glb and builds a CollisionWorld (collision). Rebuilds independently from .glb bytes.
  2. `server/maps.js` `GUN_SPAWNS` and `AMMO_SPAWNS`: hardcoded map arrays (mirror of client data). Server also reads MAP_DATA shape for spawning logic.
- Server does not read a JSON map data file directly; it reads client MAP_DATA or matches the hardcoded values in server/maps.js.

---
*End of audit-4-systems.md*