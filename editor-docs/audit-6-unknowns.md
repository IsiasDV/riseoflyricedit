# Editor Docs: Audit 6 - Unknowns

Anything that could not be determined, and which files to check.

## Not Fully Verified (from earlier audit)
- **Exact `createLevel` call site and asset-load sequence.** `game-session.js` (~1500 lines) was only partially read. `_onLoadMsg`/`_onBeginMsg` that call `loadAssets` -> `getMap(id).createLevel(loaded)` and assign `this.pendingLevel`/`this.level` were not fully inspected. Check `client/js/game/game-session.js` lines ~1150-1360.
- **Renderers not read:** `client/js/render/enemies.js` (EnemyRenderer), `avatar.js`, `viewmodel.js`, `bullets.js`, `powerups.js`, `spatial-audio.js`, `motion-blur.js`, `nameplate.js`.
- **UI screens not read:** `client/js/ui/hud.js`, `match-screens.js`, `pause-menu.js`, `game-over.js`, `scoreboard.js`, `game-chat.js`, `map-intro.js`, `console.js`.
- **Game systems not read:** `client/js/game/sfx.js`, `lyric.js`, `announcer.js`, `grandmaster-beh.js`, `away.js`, `head-bob.js`, `cinematic.js`, `player-state.js`, `remote-players.js`, `secret-code.js`, `input/haptics.js`.

## Unverified Technical Questions
- **Whether Three.js runs headless under Node.** Server tooling that reuses client collision/map code imports `three.module.min.js` indirectly via some game modules. A DOM/WebGL context may or may not be required. Verify by requiring a client game module under Node.
- **Which client game modules import Three.js for tooling.** Map-world.js imports CollisionWorld (pure), but the dependency tree may pull in three.js for other game modules that the server also uses.

## Confirmed Findings (from directory listing)
- No existing level editor code. Confirmed by directory listing; no separate editor branch or tooling folder outside client/, server/, test/.

## Empty Log Files
- `err2.txt`, `out2.txt`, `output.txt`, `test.log`, `server.err.log`, `server.out.log` are all 0 bytes - no runtime information there.

---
*End of audit-6-unknowns.md*