// WebSocket client wrapper: connect, auto-reconnect with backoff, ping/latency tracking,
// and a thin message dispatch layer on top of the shared events bus.
import { CLIENT_CONFIG } from '../core/config.js';
import { events } from '../core/events.js';

const MSG = {
  HELLO: 'hello', INPUT: 'input', PONG: 'pong',
  WELCOME: 'welcome', SNAPSHOT: 'snapshot',
  PLAYER_JOIN: 'playerJoin', PLAYER_LEAVE: 'playerLeave', PING: 'ping',
  CREATE_LOBBY: 'createLobby', JOIN_LOBBY: 'joinLobby', LEAVE_LOBBY: 'leaveLobby',
  SET_NAME: 'setName', SET_STATS: 'setStats', SET_PERK: 'setPerk', SET_CHARACTER: 'setCharacter', SELF_REVIVE: 'selfRevive', SET_MAP: 'setMap', SET_READY: 'setReady', CHAT: 'chat',
  LOBBY_STATE: 'lobbyState', LOBBY_ERROR: 'lobbyError', LOBBY_CHAT: 'lobbyChat',
  LOBBY_CLOSED: 'lobbyClosed',
  MAP_LOADED: 'mapLoaded', COUNTDOWN: 'countdown', LOAD_MAP: 'loadMap',
  MATCH_BEGIN: 'matchBegin', MAP_EVENT: 'mapEvent', INTRO_SKIP: 'introSkip', INTRO_VOTES: 'introVotes', MATCH_ABORTED: 'matchAborted',
  PLAYER_STATE: 'playerState', MATCH_STATE: 'matchState',
  SECRET: 'secret', SECRET_SONG: 'secretSong', SLAP: 'slap', KNOCKBACK: 'knockback',
  PICKUP: 'pickup', SHOOT: 'shoot', PICKUP_TAKEN: 'pickupTaken', PICKUP_RESPAWN: 'pickupRespawn', BULLET: 'bullet',
  SLAP_FX: 'slapFx', CHAT_SFX: 'chatSfx', POWERUP_PICKUP: 'powerupPickup', POWERUP_EVENT: 'powerupEvent',
  DEV_SPAWN_ENEMY: 'devSpawnEnemy', DEV_GOD: 'devGod', INTERACT: 'interact', INTERACT_RESULT: 'interactResult', REVIVE: 'revive', ENEMY_EVENT: 'enemyEvent', PLAYER_EVENT: 'playerEvent', GAME_OVER: 'gameOver', ROUND_EVENT: 'roundEvent'
};

export class NetworkClient {
  constructor() {
    this.socket = null;
    this.playerId = null;
    this.connected = false;
    this.ping = 0;
    this._reconnectDelay = CLIENT_CONFIG.RECONNECT_DELAY_MS;
    this._pingSentAt = 0;
  }

  connect(name = 'Player', stats = null, perk = null) {
    this._helloName = name;
    if (perk) this._helloPerk = perk;
    if (stats) this._helloStats = stats;
    this.socket = new WebSocket(CLIENT_CONFIG.WS_URL);

    this.socket.addEventListener('open', () => {
      this.connected = true;
      this._reconnectDelay = CLIENT_CONFIG.RECONNECT_DELAY_MS;
      events.emit('net:connected');
      this.send({ type: MSG.HELLO, name: this._helloName, stats: this._helloStats, perk: this._helloPerk });
    });

    this.socket.addEventListener('message', (event) => this._onMessage(event));

    this.socket.addEventListener('close', () => {
      this.connected = false;
      events.emit('net:disconnected');
      this._scheduleReconnect();
    });

    this.socket.addEventListener('error', () => {
      this.socket.close();
    });
  }

  _onMessage(event) {
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    switch (msg.type) {
      case MSG.WELCOME:
        this.playerId = msg.id;
        events.emit('net:welcome', msg);
        break;
      case MSG.SNAPSHOT:
        events.emit('net:snapshot', msg);
        break;
      case MSG.PLAYER_JOIN:
        events.emit('net:playerJoin', msg);
        break;
      case MSG.PLAYER_LEAVE:
        events.emit('net:playerLeave', msg);
        break;
      case MSG.PING:
        this.send({ type: MSG.PONG });
        break;
      case MSG.LOBBY_STATE:
        events.emit('net:lobbyState', msg);
        break;
      case MSG.LOBBY_ERROR:
        events.emit('net:lobbyError', msg);
        break;
      case MSG.LOBBY_CHAT:
        events.emit('net:lobbyChat', msg);
        break;
      case MSG.LOBBY_CLOSED:
        events.emit('net:lobbyClosed', msg);
        break;
      case MSG.COUNTDOWN:
        events.emit('net:countdown', msg);
        break;
      case MSG.LOAD_MAP:
        events.emit('net:loadMap', msg);
        break;
      case MSG.MAP_EVENT:
        events.emit('net:mapEvent', msg);
        break;
      case MSG.INTRO_VOTES:
        events.emit('net:introVotes', msg);
        break;
      case MSG.INTRO_SKIP:
        events.emit('net:introSkip', msg);
        break;
      case MSG.MATCH_BEGIN:
        events.emit('net:matchBegin', msg);
        break;
      case MSG.MATCH_STATE:
        events.emit('net:matchState', msg);
        break;
      case MSG.PICKUP_TAKEN:
        events.emit('net:pickupTaken', msg);
        break;
      case MSG.PICKUP_RESPAWN:
        events.emit('net:pickupRespawn', msg);
        break;
      case MSG.BULLET:
        events.emit('net:bullet', msg);
        break;
      case MSG.KNOCKBACK:
        events.emit('net:knockback', msg);
        break;
      case MSG.ROUND_EVENT:
        events.emit('net:roundEvent', msg);
        break;
      case MSG.GAME_OVER:
        events.emit('net:gameOver', msg);
        break;
      case MSG.ENEMY_EVENT:
        events.emit('net:enemyEvent', msg);
        break;
      case MSG.PLAYER_EVENT:
        events.emit('net:playerEvent', msg);
        break;
      case MSG.INTERACT_RESULT:
        events.emit('net:interactResult', msg);
        break;
      case MSG.POWERUP_EVENT:
        events.emit('net:powerupEvent', msg);
        break;
      case MSG.SLAP_FX:
        events.emit('net:slapFx', msg);
        break;
      case MSG.CHAT_SFX:
        events.emit('net:chatSfx', msg);
        break;
      case MSG.SECRET_SONG:
        events.emit('net:secretSong', msg);
        break;
      case MSG.MATCH_ABORTED:
        events.emit('net:matchAborted', msg);
        break;
      default:
        events.emit('net:message', msg);
        break;
    }
  }

  send(data) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(data));
    }
  }

  createLobby(name) { this.send({ type: MSG.CREATE_LOBBY, name }); }
  joinLobby(name, code) { this.send({ type: MSG.JOIN_LOBBY, name, code }); }
  leaveLobby() { this.send({ type: MSG.LEAVE_LOBBY }); }
  setName(name) { this.send({ type: MSG.SET_NAME, name }); }
  setStats(stats) { this._helloStats = stats; this.send({ type: MSG.SET_STATS, stats }); }
  setCharacter(char) { this.send({ type: MSG.SET_CHARACTER, char }); }
  setPerk(perk) { this._helloPerk = perk; this.send({ type: MSG.SET_PERK, perk }); }
  sendSelfRevive() { this.send({ type: MSG.SELF_REVIVE }); }
  setMap(mapId) { this.send({ type: MSG.SET_MAP, mapId }); }
  setReady(ready) { this.send({ type: MSG.SET_READY, ready }); }
  sendPlayerState(s) { this.send({ type: MSG.PLAYER_STATE, ...s }); }
  sendIntroVote() { this.send({ type: MSG.INTRO_SKIP }); }
  mapLoaded() { this.send({ type: MSG.MAP_LOADED }); }
  sendPickup(kind, index) { this.send({ type: MSG.PICKUP, kind, index }); }
  sendShoot(s) { this.send({ type: MSG.SHOOT, ...s }); }
  sendSlap() { this.send({ type: MSG.SLAP }); }
  sendDevSpawn(x, y, z, kind = 'beh') { this.send({ type: MSG.DEV_SPAWN_ENEMY, x, y, z, kind }); }
  sendInteract(kind) { this.send({ type: MSG.INTERACT, kind }); }
  sendDevGod(on) { this.send({ type: MSG.DEV_GOD, on: !!on }); }
  sendRevive(targetId) { this.send({ type: MSG.REVIVE, targetId }); }
  sendPowerupPickup(id) { this.send({ type: MSG.POWERUP_PICKUP, id }); }
  sendSecret() { this.send({ type: MSG.SECRET }); }
  sendChat(text) { this.send({ type: MSG.CHAT, text }); }

  _scheduleReconnect() {
    setTimeout(() => this.connect(this._helloName), this._reconnectDelay);
    this._reconnectDelay = Math.min(this._reconnectDelay * 1.5, CLIENT_CONFIG.MAX_RECONNECT_DELAY_MS);
  }
}
