## 1. MAP DATA FORMAT (concise)

The existing `MAP_DATA` in `client/js/maps/map-data.js` is a JS object per map. The editor produces a JSON override that merges editable fields:
- Editable: `spawn`, `enemyAreas`, `enemyAreasOpen`, `barrier`, `teleporters`, `colorMachine`, `powerupMachine`, `lyricMachine`, `gunSpawns`, `ammoSpawns`
- Read-only: `model`, `scale`, `noCollide`, `ready`
- Example: `editor/maps/ungaland-editor.json` reproduces current `MAP_DATA["ungaland"]` plus gun/ammo spawns.

## 2. LOADER / INTEGRATION

Editor JSON overrides are merged into `MAP_DATA` at startup via `client/js/core/editor-map-override.js`. Server reads a separate `editor/Server/{mapId}.json` for gun/ammo spawn overrides. Existing maps behave identically because overrides start from current `MAP_DATA` values.

## 3. EDITOR ARCHITECTURE

Standalone `editor/index.html` + `editor/js/` modules. Uses Three.js vendored GLTFLoader to load map .glb. Does NOT instantiate GameSession/LobbyManager. Editor state is separate from game state. Test-play serializes JSON and applies overrides via the loader before entering singleplayer.

## 4. SAVING

Primary: (a) Download JSON file — user clicks "Save", gets `mapname.json`, places it in `editor/maps/`. Secondary: (b) File System Access API for recent Chrome. Not recommended: (c) server write endpoint due to security risks.

## 5. FEATURE PLAN

Core features: orbit camera, grid + 3D surface raycast snapping, object palette (spawn, enemy areas, teleporters, machines, gun/ammo spawns), placement ghost/preview, select/move (drag), duplicate, property panel, area boxes for enemyAreas, undo/redo, new/open/autosave, layers/visibility toggles, test-play. Delete supported. Rotate/scale limited (yaw only, scale read-only).

## 6. TEST-PLAY

Serializer invokes `applyEditorOverridesToMAP_DATA(MAP_DATA)` before singleplayer countdown→loading→playing. After match ends (or Esc), overrides are cleared and game returns to editor.

## 7. VALIDATION RULES

No spawn in kill zone (using collision.bounds.minY - 30), no spawn inside solid (downward raycast), enemy areas within map bounds, no zero-volume areas, teleporter destinations must be placed, gun/ammo spawns not inside solids, no duplicate gun spawns within 2m, enemy areas don't overlap barrier.

## 8. RISKS

Client/server mismatch (avoided by dual artifacts: client MAP_DATA overrides + server gun/ammo override), breaking multiplayer flow (editor data only applied before match starts, multiplayer can ignore overrides), invalid data causing runtime errors (validation rules catch all known failure modes before commit).

## 9. BUILD ORDER

(A) data format + loader integration + editor scaffold (loads GLB, camera, grid, palette, places spawn + gun spawn, saves JSON file game can load)
(B) full editing tools (select/move/duplicate/property panel/area boxes/undo-redo/autosave/layers)
(C) save/load/new polish, validation, test-play, layers, USAGE_EDITOR.md documentation

---
*Design continued from EDITOR_DESIGN.md header*
# EDITOR_DESIGN � Rise of Lyric Map Editor

Design for an object-placement editor built on top of the existing Rise of Lyric gameplay codebase.

No existing source files are modified; this document and EDITOR_AUDIT.md are the only artifacts produced.

Source: real files under C:\Users\conta\Documents\DayToDayProjects\riseoflyric-editor-main.

---
