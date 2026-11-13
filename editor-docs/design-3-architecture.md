# Editor Docs: Design 3 - Architecture (Decision D4)

## Decision D4 - Editor location

Editor files live INSIDE the client tree so they are served by the same http-server at the same origin:
- `client/editor/index.html` - editor HTML shell (served at /editor/index.html)
- `client/editor/editor.js` - editor app: canvas, scene, palette, property panel, undo stack, localStorage draft, export
- `client/editor/editor.css` - editor UI styles

From `/editor/index.html`:
- Import `../js/maps/map-data.js` -> resolves to `client/js/maps/map-data.js` (verified V1).
- Import `../vendor/three.module.min.js` -> resolves to `client/vendor/three.module.min.js`.
- Load `../assets/map_ungaland/map/map.glb` -> resolves to `client/assets/...`.
- localStorage is same-origin with the game page at `http://localhost:3000/`, so drafts written by the
  editor are readable by the game page's test-play hook (design-5, D3).

## Complete file list

### NEW files (create only, never modify existing source)
- `client/editor/index.html` - editor shell; loads editor.js; same origin as game.
- `client/editor/editor.js` - editor application logic.
- `client/editor/editor.css` - editor UI styles.
- `client/js/maps/map-overrides.js` - NEW data-only OVERRIDES module (design-2a).
- `USAGE_EDITOR.md` - NEW user-facing editor documentation (milestone D).

### EXISTING files that change (minimal, non-gameplay logic)
- `client/js/maps/map-data.js` - add gunSpawns/ammoSpawns per entry; append applyOverrides + import OVERRIDES at end (design-2b).
- `client/js/maps/ungaland.js` - derive GUN_SPAWNS/AMMO_SPAWNS from MAP_DATA.
- `client/js/maps/choco-rocklate-gladiator-arena.js` - derive from MAP_DATA.
- `client/js/maps/night-of-the-living-void.js` - derive from MAP_DATA.
- `client/js/maps/endless-shot.js` - derive from MAP_DATA.
- `client/js/maps/fearvelations.js` - derive from MAP_DATA.
- `server/maps.js` - derive GUN_SPAWNS/AMMO_SPAWNS from MAP_DATA arrays (design-2b).
- `client/js/main.js` - add test-play hook: after GameSession constructed, check ?testplay query and auto-start singleplayer (design-5, D3).

## Saving / publishing flow end to end

1. User edits in the editor page (`/editor/`). Changes autosave to localStorage key `editor_draft_<mapId>` (debounced 500ms).
2. User clicks "Download map-overrides.js". Browser downloads a full replacement `map-overrides.js` containing all maps' overrides as plain JSON-compatible data (no functions).
3. User saves that file over `client/js/maps/map-overrides.js` (manual file replace, outside the running server).
4. To make the change live in the game: restart the server (`node server.js`) so map-data.js re-imports OVERRIDES and applyOverrides merges it into MAP_DATA.
5. Multiplayer: saved overrides affect multiplayer only after a server restart (server reads MAP_DATA at startup). The editor displays a banner: "Multiplayer picks up saved overrides after server restart."
6. Test-play (no publish needed): editor writes a JSON draft to localStorage and opens the game with `?testplay=<mapId>`; map-data.js reads localStorage and applies it in the same pass (design-5, D3). Nothing persists to the committed file.
