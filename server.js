// Entry point for Rise of Lyric's server. Run with: node server.js
import { CONFIG } from './server/config.js';
import { createHttpServer } from './server/http-server.js';
import { WebSocketServer } from './server/websocket.js';
import { GameServer } from './server/game-server.js';
import { logger } from './server/logger.js';

const httpServer = createHttpServer(CONFIG.CLIENT_DIR);
const wsServer = new WebSocketServer(httpServer);
const gameServer = new GameServer(wsServer);

// Keep the server alive if a single handler throws; log the reason instead of exiting.
process.on('uncaughtException', (err) => logger.error('Uncaught exception:', err && err.stack ? err.stack : err));
process.on('unhandledRejection', (err) => logger.error('Unhandled rejection:', err && err.stack ? err.stack : err));

httpServer.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${CONFIG.PORT} is already in use. Stop the other server or set PORT=<other>.`);
  } else {
    logger.error('HTTP server error:', err);
  }
  process.exit(1);
});

httpServer.listen(CONFIG.PORT, CONFIG.HOST, () => {
  logger.info(`Rise of Lyric server running at http://localhost:${CONFIG.PORT}`);
  logger.info(`WebSocket endpoint available on the same port (ws://localhost:${CONFIG.PORT})`);
  logger.info(`Simulation tick rate: ${CONFIG.TICK_RATE_HZ} Hz`);
});

function shutdown() {
  logger.info('Shutting down...');
  gameServer.shutdown();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
