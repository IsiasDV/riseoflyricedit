# Editor Docs: Design 2a - Code Verification and Decisions D1

## V1 - http-server.js serving directory and editor page paths

server/config.js sets `CLIENT_DIR: 'client'` (line 9). server/http-server.js line 33 resolves
`clientRoot = path.resolve(PROJECT_ROOT, 'client')` and serves static files from there.
A page at `client/editor/index.html` is served at `/editor/index.html`.
- Import `../js/...` from the editor page resolves to `client/js/...` (works, same origin).
- Load `../assets/...` resolves to `client/assets/...` (works, .glb/.opus served with correct MIME).
- Path-traversal guard (line 47) normalizes and confines to clientRoot, so `../` inside client is fine
  but cannot escape above `client/`. No other restrictions.

## V2 - Spawn yaw in MAP_DATA

MAP_DATA.spawn is `[x, y, z]` only - there is NO yaw field in MAP_DATA (verified in map-data.js).
Yaw is hardcoded to 0 inside each map module's createLevel, e.g.
`spawn = { x: sx, y: sy, z: sz, yaw: 0 }` (ungaland.js, choco, etc.).
The player controller and camera track their own yaw separately at runtime.
Conclusion: do NOT add yaw to MAP_DATA or to the player-spawn editable schema.

## V3 - Singleplayer start trigger and hook point

main.js line 133: `new MenuSystem(network, lobby).start()`.
User picks SINGLEPLAYER -> lobby.openSingleplayer() sets `this.mode = 'single'` -> START GAME button emits
`events.emit('lobby:start', { mapId: this.mapId, mode: this.mode })` (lobby.js _activateMenu).
game-session.js listens for `lobby:start` -> `_onStart(e)` -> if `mode === 'multi'` return, else
`_runLocal(mapId)` -> `_load(mapId, ...)` -> `getMap(mapId)` -> `map.createLevel(assets)`.
Hook point in main.js: after `new GameSession(...)` is constructed (line 46), before `loop.start()`
(line 118), check `location.search` for `?testplay=<mapId>`; if present, emit
`events.emit('lobby:start', { mapId: <from query>, mode: 'single' })` to auto-start singleplayer
on that map without clicking through the lobby.

## Decision D1 - OVERRIDES file

New file: `client/js/maps/map-overrides.js` - a data-only ES module exporting one constant:

```js
export const OVERRIDES = {
  'ungaland': {
    spawn: [0, 5.2, 0],
    enemyAreas: [{ min: [-18.8, 2.3, 3.8], max: [23.2, 8.2, 30.8] }],
    powerupMachine: { at: [-4.1, 1.6, 19.4], cost: 500 },
    ready: true
  },
  'choco-rocklate-gladiator-arena': {},
  'night-of-the-living-void': {},
  'endless-shot': {},
  'fearvelations': {}
};
```

- Plain data only: objects, arrays, numbers, strings, booleans, null. No functions, no methods.
- Each map id maps to an object containing only the editable fields to override.
- A field set to `null` means "remove this key from MAP_DATA" (e.g. `teleporter: null` deletes it).
- Missing map ids or missing fields mean "use MAP_DATA as-is".
- The editor loads this file, lets the user edit it, and downloads a full replacement that the user
  saves over `client/js/maps/map-overrides.js`.
