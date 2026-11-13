# Editor Progress

## Phase 2: design implemented, editor running

### Files Created (new files, not modifying existing source)
| File | Line Count | Description |
|------|------------|-------------|
| client/js/maps/map-overrides.js | 11 | Data-only OVERRIDES module for all 5 maps |
| client/editor/index.html | 32 | Editor HTML shell served at /editor/ |
| client/editor/editor.js | 343 | Editor app: Three.js scene, palette, raycast placement, select/move/delete, property panel, download, autosave, test-play |
| client/editor/editor.css | 50 | Editor UI styles |

### Files Modified (existing source, minimal changes)
| File | Change |
|------|--------|
| client/js/maps/map-data.js | Added gunSpawns/ammoSpawns to all entries; added applyOverrides() + OVERRIDES import at end |
| client/js/maps/ungaland.js | GUN_SPAWNS/AMMO_SPAWNS now derive from MAP_DATA.ungaland |
| client/js/maps/choco-rocklate-gladiator-arena.js | GUN_SPAWNS/AMMO_SPAWNS now derive from MAP_DATA via D |
| client/js/maps/night-of-the-living-void.js | GUN_SPAWNS/AMMO_SPAWNS now derive from MAP_DATA |
| client/js/maps/endless-shot.js | GUN_SPAWNS/AMMO_SPAWNS now derive from MAP_DATA via D |
| client/js/maps/fearvelations.js | GUN_SPAWNS/AMMO_SPAWNS now derive from MAP_DATA via D |
| server/maps.js | GUN_SPAWNS/AMMO_SPAWNS derived from MAP_DATA arrays; isMapReady uses MAP_DATA directly |
| client/js/main.js | Test-play hook: ?testplay=<mapId> auto-starts singleplayer via lobby:start event |

### Files Updated (docs)
| File | Change |
|------|--------|
| editor-docs/README.md | Indexed design-2a, design-2b; updated descriptions |
| editor-docs/design-2a-verification-decisions.md | V1-V3 verified, D1 OVERRIDES format |
| editor-docs/design-2b-integration.md | D2 applyOverrides + gun/ammo migration |
| editor-docs/design-3-architecture.md | D4 editor at client/editor/, full file list, save flow |
| editor-docs/design-4-features.md | D5 yaw removed, full feature list |
| editor-docs/design-5-testplay.md | D3 test-play via applyOverrides + localStorage JSON |
| editor-docs/design-7-build-order.md | D6 milestones A-D with test steps |

### Editable Groups
player spawn, enemy areas (enemyAreas and enemyAreasOpen), gun pickup spawns, ammo pickup spawns, and interactables (barrier, teleporter {at,to}, teleporters {a,b,cost}, colorMachine, powerupMachine, lyricMachine, with optional costs).

### Read-Only
model, scale, noCollide.

### Verification
- `node -e "import('./client/js/maps/map-data.js')"` -> OK (all 5 maps, applyOverrides exported)
- `node -e "import('./server/maps.js')"` -> OK (GUN_SPAWNS/AMMO_SPAWNS derived from MAP_DATA)
- `node server.js` -> starts successfully, serves / and /editor/ at 200
- All client JS modules served at 200 from http://localhost:3000/

### Uncertain / Open Items
- endless-shot and fearvelations have no .glb files (only README.txt), so they render as placeholder ground in the editor
- night-of-the-living-void defines GUN_SPAWNS/AMMO_SPAWNS as non-exported const; migration reads from MAP_DATA instead
- Node v15.10.0 installed; package.json requires >=18.0.0 (node --test not available, verified via manual import tests instead)

---

*End of EDITOR_PROGRESS.md*
