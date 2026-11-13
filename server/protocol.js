// Shared message type constants for the client<->server JSON protocol.
// Keep this file mirrored conceptually with client/js/net/network.js usage.
export const MSG = {
  // Client -> Server
  HELLO: 'hello',           // { type: 'hello', name } - sent once after connection opens
  INPUT: 'input',           // { type: 'input', seq, keys, lookX, lookY } - per-tick input state
  PONG: 'pong',             // { type: 'pong' } - heartbeat reply

  // Client -> Server (multiplayer lobbies)
  CREATE_LOBBY: 'createLobby', // { type: 'createLobby', name } - creates a new lobby, caller becomes host
  JOIN_LOBBY: 'joinLobby',     // { type: 'joinLobby', name, code } - joins an existing lobby by room code
  LEAVE_LOBBY: 'leaveLobby',   // { type: 'leaveLobby' } - leaves the current lobby
  SET_NAME: 'setName',         // { type: 'setName', name } - renames self within the lobby
  SET_STATS: 'setStats',       // { type: 'setStats', stats: {gamesPlayed,kills,deaths,downs,revives,bestRound} } - client-reported lifetime totals, relayed in lobbyState
  SET_CHARACTER: 'setCharacter', // { char } - choose your character (lobby phase only)
  SET_PERK: 'setPerk',         // { type: 'setPerk', perk } - choose a perma-perk (lobby phase only)
  SELF_REVIVE: 'selfRevive',   // { type: 'selfRevive' } - One Man Show: stand yourself up while downed
  SET_MAP: 'setMap',           // { type: 'setMap', mapId } - host only, changes the selected map
  SET_READY: 'setReady',       // { type: 'setReady', ready } - toggle ready; countdown starts at >=50% ready
  INTRO_SKIP: 'introSkip',     // { type: 'introSkip' } - vote to skip the map intro cutscene (ENTER); server -> clients when everyone voted
  INTRO_VOTES: 'introVotes',   // server -> clients { votes, total } while the intro vote is open
  MAP_EVENT: 'mapEvent',       // server -> clients { event: 'barrier' | 'linked' } shared map state changes
  CHAT: 'chat',                // { type: 'chat', text } - lobby text chat message
  MAP_LOADED: 'mapLoaded',     // { type: 'mapLoaded' } - this client finished loading the map
  PICKUP: 'pickup',            // { type: 'pickup', kind: 'gun'|'ammo', index } - touched a pickup spawn
  SHOOT: 'shoot',              // { type: 'shoot', ox,oy,oz, dx,dy,dz } - fired the gun
  SLAP: 'slap',                // { type: 'slap' } - Hand attack landed its swing; server resolves the target
  SECRET: 'secret',            // { type: 'secret' } - player entered the map's secret code
  INTERACT: 'interact', // { kind } client -> server: use a priced machine
  INTERACT_RESULT: 'interactResult', // { kind, ok, reason?, cost } server -> that player
  DEV_GOD: 'devGod', // { on } - debug: enemies ignore this player
  DEV_SPAWN_ENEMY: 'devSpawnEnemy', // { type, x, y, z } - debug: spawn an enemy
  REVIVE: 'revive',            // { type: 'revive', targetId } - sent while holding the revive key
  PLAYER_STATE: 'playerState', // { type: 'playerState', x, y, z, yaw, crouch, away } - in-match position (client-authoritative)

  // Server -> Client
  WELCOME: 'welcome',       // { type: 'welcome', id, tickRate } - assigns the client its player id
  SNAPSHOT: 'snapshot',     // { type: 'snapshot', tick, players: [{id,x,y,z,ry}] } - world state broadcast
  PLAYER_JOIN: 'playerJoin',// { type: 'playerJoin', id, name }
  PLAYER_LEAVE: 'playerLeave', // { type: 'playerLeave', id }
  PING: 'ping',             // { type: 'ping' } - heartbeat request

  // Server -> Client (multiplayer lobbies)
  LOBBY_STATE: 'lobbyState',   // { type: 'lobbyState', code, hostId, mapId, phase, readyNeeded, players: [{id,name,ready,stats}] }
  LOBBY_ERROR: 'lobbyError',   // { type: 'lobbyError', message }
  LOBBY_CHAT: 'lobbyChat',     // { type: 'lobbyChat', id, name, text, ts }
  LOBBY_CLOSED: 'lobbyClosed', // { type: 'lobbyClosed', reason } - lobby was torn down (e.g. game started)
  COUNTDOWN: 'countdown',      // { type: 'countdown', mapId, durationMs } - host started the match
  LOAD_MAP: 'loadMap',         // { type: 'loadMap', mapId, characters: { [playerId]: 'void'|'boss' } } - countdown over, show loading screen
  MATCH_BEGIN: 'matchBegin',   // { type: 'matchBegin', mapId } - all players loaded
  MATCH_STATE: 'matchState',   // { type: 'matchState', tick, players: [{id,x,y,z,yaw,crouch}], stats?: rows } - stats only when changed
  PICKUP_TAKEN: 'pickupTaken',     // { type: 'pickupTaken', kind, index, id } - spawn taken by player id
  PICKUP_RESPAWN: 'pickupRespawn', // { type: 'pickupRespawn', kind, index } - spawn is back
  BULLET: 'bullet',            // { type: 'bullet', id, ox,oy,oz, dx,dy,dz } - visual bullet from player id
  KNOCKBACK: 'knockback',      // { type: 'knockback', targetId, fromId, dx, dz } - victim slides along (dx,dz)
  SECRET_SONG: 'secretSong',   // { type: 'secretSong', id, name } - play the secret song (once per match)
  ENEMY_EVENT: 'enemyEvent',   // { type, event: spawn|laugh|dehd|die, id, x,y,z, targetId }
  PLAYER_EVENT: 'playerEvent', // { type, event: gunLost|down|revived|dead, id }
  ROUND_EVENT: 'roundEvent',   // { type, event: start|end, round, total?, nextMs? }
  GAME_OVER: 'gameOver',       // { type, round, players: [{id,name,char,kills,downs,revives,deaths,status}] }
  POWERUP_PICKUP: 'powerupPickup', // { type, id } client -> server: touched powerup orb id
  POWERUP_EVENT: 'powerupEvent',   // { type, event: drop|gone|picked|buffEnd|lyricJoin|lyricLeave, ... } server -> client (see game/powerups.js)
  SLAP_FX: 'slapFx',          // { type: 'slapFx', id } - player id swung the Hand (sound cue)
  CHAT_SFX: 'chatSfx',         // { type: 'chatSfx', sound: 'getMoving', id } - chat phrase triggered a sound for everyone
  MATCH_ABORTED: 'matchAborted' // { type: 'matchAborted', reason } - load timed out, back to lobby
};
