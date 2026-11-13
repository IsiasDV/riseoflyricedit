# Editor Docs: Design 7 - Build Order (Decision D6)

## Milestone A: Data migration (gun/ammo into MAP_DATA)

Goal: gunSpawns/ammoSpawns live in MAP_DATA; map modules and server/maps.js derive from it;
maps.test.mjs still passes. No editor UI yet.

Steps:
1. Add gunSpawns/ammoSpawns arrays to every MAP_DATA entry in client/js/maps/map-data.js (contents
   copied verbatim from current exports).
2. Change client/js/maps/ungaland.js, choco-rocklate-gladiator-arena.js,
   night-of-the-living-void.js, endless-shot.js, fearvelations.js to derive GUN_SPAWNS/AMMO_SPAWNS
   from MAP_DATA.
3. Change server/maps.js to derive GUN_SPAWNS/AMMO_SPAWNS from MAP_DATA arrays.
4. Run: `node --test test/` - confirm maps.test.mjs passes (client/server gun/ammo arrays match).
5. Run: `node server.js` and open http://localhost:3000 - confirm all five maps still start and play
   identically.

Test steps for me: run `node --test test/`; open http://localhost:3000; start singleplayer on each
map; confirm gameplay unchanged.

Exit criterion: node --test test/ passes; game start works on all maps; no visible change.

Milestone A test target: ungaland (endless-shot and fearvelations have no .glb files - only
README.txt in their map/ folders - so they cannot be test-play targets).

## Milestone B: Overrides pipeline with NO editor UI

Goal: create map-overrides.js, applyOverrides, test-play hook, auto-start; prove by hand-editing.

Steps:
1. Create client/js/maps/map-overrides.js with OVERRIDES for all 5 maps (design-2a).
2. Append applyOverrides + `import { OVERRIDES }; applyOverrides(MAP_DATA, OVERRIDES)` to the END of
   client/js/maps/map-data.js (design-2b).
3. Add the test-play hook at the end of map-data.js: guard typeof location/localStorage, read
   ?testplay query, read localStorage draft, JSON.parse try/catch, applyOverrides one-map (design-5,
   D3).
4. Add auto-start in client/js/main.js after GameSession constructed: check ?testplay, emit
   lobby:start {mapId, mode:'single'} (design-5, V3).
5. Hand-test: edit map-overrides.js directly to move the ungaland powerupMachine (e.g. change
   powerupMachine.at). Save. Restart server. Open http://localhost:3000. Start singleplayer on
   ungaland. Confirm powerupMachine at new location.
6. Hand-test test-play: write a JSON draft to localStorage via browser console for ungaland (e.g.
   change powerupMachine cost). Open http://localhost:3000/?testplay=ungaland. Confirm game
   auto-starts singleplayer on ungaland with edited cost. Refresh without ?testplay; confirm reverted.

Test steps for me: hand-edit map-overrides.js; restart server; verify in-game; hand-write localStorage
draft; open ?testplay=ungaland; verify auto-start and revert on refresh.

Exit criterion: applyOverrides merges correctly; test-play auto-starts and reverts; node --test test/
passes.

## Milestone C: Editor core

Goal: editor page loads a .glb, palette, raycast placement, select/move/delete, property panel,
download of map-overrides.js, localStorage autosave, Test Play button.

Steps:
1. Create client/editor/index.html, client/editor/editor.js, client/editor/editor.css (design-3, D4).
2. Editor imports ../js/maps/map-data.js and ../vendor/three.module.min.js; loads map .glb via
   ../assets/... paths.
3. Implement palette (10 item types), raycast-on-surface placement, select/move/delete, property
   panel (per design-4, D5 no yaw), localStorage autosave (debounced 500ms), download map-overrides.js,
   Test Play button (writes localStorage, opens ?testplay=<mapId>).
4. Run: open http://localhost:3000/editor/. Confirm it loads ungaland's .glb and renders a placable
   preview. Place a gun spawn, move it, change its position in the property panel. Download
   map-overrides.js and confirm it contains valid data. Click Test Play; confirm game auto-starts on
   ungaland with the placed gun spawn visible.

Test steps for me: open /editor/; place items; download map-overrides.js; click Test Play; verify
in-game; verify refresh reverts.

Exit criterion: editor page loads, places items of each type, downloads valid module, test-play works.

## Milestone D: Remaining editing and polish

Goal: enemy-area box handles, multi-select, duplicate, undo/redo, validation (design-6), layers,
snapping, USAGE_EDITOR.md.

Steps:
1. Add enemy-area box handles (8 corners + 6 faces), multi-select, duplicate, undo/redo (design-4).
2. Add validation rules using CollisionWorld.groundAt/raycast, bounds, killY (design-6). Block
   save/test-play on invalid data.
3. Add snapping (grid 0.5/1/2m, cost nearest 50) and layers/visibility per item type (design-4).
4. Write USAGE_EDITOR.md (user-facing editor documentation).
5. Run full `node --test test/` and manual playtest on all five maps.

Test steps for me: place enemy area, resize with handles; multi-select and change cost; undo/redo;
trigger validation errors; write USAGE_EDITOR.md; run node --test test/.

Exit criterion: all features work; validation blocks bad data; node --test test/ passes; USAGE_EDITOR.md
complete.
