# Editor Docs: Design 5 - Test-Play (Decision D3)

## Decision D3 - Test-play via applyOverrides + localStorage JSON

Test-play reuses the same `applyOverrides` function from map-data.js (design-2b). It does NOT use a
separate merge hook or `getMap(id).ready` hack.

### Why the getMap.ready hack is no longer needed

applyOverrides runs at the END of map-data.js, BEFORE any map module imports map-data.js. Each map
module computes its `ready` at import time from `MAP_DATA[id].ready !== false` (e.g.
ungaland.js `ready: MAP_DATA.ungaland.ready !== false`). Since applyOverrides already mutated
MAP_DATA[id].ready in place, `getMap(id).ready` already reflects the override. Verified against
lobby.js: the UI gate `getMap(this.mapId).ready === false` reads the map module's pre-computed ready,
which is now correct. No hack needed.

### How it works

1. Editor user edits a map (e.g. ungaland). Every change autosaves to localStorage key
   `editor_draft_<mapId>` as PLAIN JSON (debounced 500ms). Drafts are never code.
2. User clicks "Test Play". Editor writes the same draft to localStorage (already there from autosave)
   and opens the game page at `http://localhost:3000/?testplay=ungaland`.
3. Game page loads. main.js imports modules; map-data.js runs applyOverrides. At the END of
   map-data.js, the test-play hook runs:
   - Guard: `if (typeof location === 'undefined' || typeof localStorage === 'undefined') return;` -
     Node/server is unaffected (no location/localStorage).
   - Parse `location.search` for `?testplay=<mapId>`. If absent, skip (normal operation, zero impact).
   - Read `localStorage.getItem('editor_draft_<mapId>')`. If absent, skip.
   - `JSON.parse` inside try/catch. On failure, log warning and skip (never crash the game).
   - Build a one-map overrides object `{ [mapId]: parsedDraft }` and call
     `applyOverrides(MAP_DATA, oneMapOverrides)`. Same whitelist, same type-checking, same null-delete.
   - Clear `editor_testplay_map` from localStorage so a normal reload doesn't re-apply a stale draft.
4. Since map-data.js finished merging BEFORE map modules and GameSession run, all subsequent code
   (map modules at import top level, createLevel inside _load, isReady) sees the merged data.
5. Auto-start singleplayer (V3): in main.js, after `new GameSession(...)` is constructed (line 46)
   and before `loop.start()` (line 118), check `location.search` for `?testplay=<mapId>`. If present,
   emit `events.emit('lobby:start', { mapId: <from query>, mode: 'single' })`. game-session
   `_onStart` -> `_runLocal(mapId)` -> `_load` -> `map.createLevel(assets)` with merged MAP_DATA.
   The user does not click through the lobby.
6. Game runs singleplayer with the editor's draft values active.

## What does NOT happen

- No server changes (multiplayer untouched).
- No permanent MAP_DATA mutation (draft lives in localStorage only; committed file unchanged until
  user downloads and saves map-overrides.js, then restarts server).
- No JSON import attributes (draft is read via localStorage.getItem + JSON.parse, not import).
- No modification of map module source files.
- After a normal reload without ?testplay, nothing is applied; MAP_DATA reverts to committed values.
