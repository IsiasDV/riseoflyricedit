// Central server configuration. Keep this the single source of truth for runtime constants.
export const CONFIG = {
  PORT: process.env.PORT ? Number(process.env.PORT) : 3000,
  HOST: process.env.HOST || '0.0.0.0',
  TICK_RATE_HZ: 20,              // fixed simulation/broadcast tick rate
  CLIENT_DIR: 'client',          // static files root, relative to project root
  MAX_PLAYERS: 64,
  HEARTBEAT_INTERVAL_MS: 15000,  // server -> client ping interval
  HEARTBEAT_TIMEOUT_MS: 30000,   // disconnect client if no pong received in this window
  MAX_LOBBY_PLAYERS: 8,          // max players in a single multiplayer lobby
  READY_THRESHOLD: 0.5,          // fraction of lobby that must be ready to start the countdown
  LOBBY_CODE_LENGTH: 4,         // length of generated lobby room codes
  COUNTDOWN_MS: process.env.COUNTDOWN_MS ? Number(process.env.COUNTDOWN_MS) : 5000, // start-game countdown
  LOAD_TIMEOUT_MS: process.env.LOAD_TIMEOUT_MS ? Number(process.env.LOAD_TIMEOUT_MS) : 60000, // max wait for all players to load
  CHAT_MAX_LENGTH: 200,         // max characters per chat message
  CHAT_MIN_INTERVAL_MS: 400,     // simple per-player chat rate limit
  // Hand slap (mirrors client/js/game/weapons.js melee)
  AMMO_RESPAWN_MS: 30000,        // ammo station respawn
  AMMO_PER_PICKUP: 10,
  GUN_RESPAWN_MS: 30000,         // gun spawn comes back this long after being taken
  GUN_PICKUP_RADIUS: 2.5,        // server-side touch tolerance (client uses ~1.1 m)
  SHOOT_MIN_INTERVAL_MS: 150,
  SLAP_RANGE: 2.2,
  SLAP_ARC_DEG: 70,
  SLAP_MAX_DY: 1.8,
  SLAP_MIN_INTERVAL_MS: 400,
  MAX_ENEMIES: 20,
  REVIVE_RANGE: 2.5
};
