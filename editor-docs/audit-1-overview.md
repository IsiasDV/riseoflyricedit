# Editor Docs: Audit 1 - Overview

Language, framework, build/run, entry points, main loops, state management.

## Language and Framework
- Language: JavaScript, ESM (type:module in package.json).
- Engine: No game engine. Three.js r160, vendored locally at client/vendor/three.module.min.js.
- Networking: Hand-rolled RFC 6455 WebSocket server (server/websocket.js), dependency-free Node HTTP static server (server/http-server.js).
- Dependencies: Zero npm (dependencies: empty object).

## How to Build and Run
- No build step. From project root:
  node server.js
  open http://localhost:3000
- Env vars: PORT (default 3000), HOST (default 0.0.0.0), DEBUG (any value enables debug logs).
- Tests: node --test test/ (~28 test files).

## Entry Points
- Server: server.js - boots createHttpServer, WebSocketServer, GameServer; listens on CONFIG.PORT; graceful shutdown on SIGINT/SIGTERM.
- Client: client/index.html loads CSS then <script type="module" src="js/main.js"></script>.

## Main Loops
- Server: Fixed-tick at CONFIG.TICK_RATE_HZ = 20 Hz via setInterval. calls GameServer._onTick() which broadcasts a snapshot and calls lobby.broadcastMatchStates(tick).
- Client: requestAnimationFrame loop in GameLoop (client/js/core/loop.js). Deltas clamped to 0.25 s. calls update then render.

## State Management
- Server owns GameServer.players (id to {id,name,connection,x,y,z,ry,lastInput}). Static placeholders at (0,0,0).
- Client owns WorldState (client/js/state/state.js): players Map synced from snapshots.
- GameSession (client/js/game/game-session.js) owns match lifecycle: state in {idle, countdown, loading, black, playing}. this.level (active) / this.pendingLevel (built during loading).
- Lobby phase (lobby.phase in {lobby, countdown, loading, playing}) managed by LobbyManager (server/lobby-manager.js).

## Network Protocol
- WebSocket JSON, 20 Hz tick.
- Client to server: hello/input/pong plus lobby messages (createLobby, joinLobby, setMap, setReady, pickup, shoot, slap, secret, interact, revive, chat, dev*).
- Server to client: welcome/snapshot/playerJoin/Leave, lobbyState/countdown/loadMap/matchBegin/matchState/gameOver, bullet/knockback/pickupTaken/Respawn/enemyEvent/playerEvent/roundEvent/powerupEvent/secretSong/matchAborted.

---
*End of audit-1-overview.md*