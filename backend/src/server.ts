import http from 'node:http';
import { createApp } from './app.js';
import { connectDB, disconnectDB, isEphemeralDB } from './config/db.js';
import { attachSockets, closeSockets } from './sockets/index.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

async function bootstrap() {
  const app = createApp();

  // An explicit http.Server rather than app.listen(): Batch 11 attaches Socket.io to this exact
  // instance so the WebSocket upgrade shares the HTTP server and its cookie session.
  const server = http.createServer(app);

  await connectDB();

  /**
   * The in-memory database belongs to this process and starts empty every boot, so seed it here.
   * Running `npm run seed` separately would populate that script's own throwaway instance and
   * leave the API with nothing. Skipped entirely once a real MONGODB_URI is configured.
   */
  if (isEphemeralDB()) {
    const { seedDatabase } = await import('./scripts/seed.js');
    await seedDatabase();
  }

  // Socket.io shares this exact HTTP server, so the WebSocket upgrade carries the same session
  // cookies as a normal request — no second auth mechanism needed.
  attachSockets(server);

  server.listen(env.PORT, () => {
    logger.info(
      `PawfectHome API listening on http://localhost:${env.PORT}${env.API_PREFIX} [${env.NODE_ENV}]`,
    );
    logger.info(`CORS origins: ${env.allowedOrigins.join(', ')}`);

    const pending = Object.entries(env.isConfigured)
      .filter(([, ready]) => !ready)
      .map(([name]) => name);
    if (pending.length > 0) {
      logger.warn(`Not yet configured (expected during early batches): ${pending.join(', ')}`);
    }
  });

  /**
   * Graceful shutdown: stop accepting connections, let in-flight requests finish, then exit.
   * Without this, a deploy can cut off a request mid-write.
   */
  const shutdown = (signal: string) => {
    logger.info(`${signal} received — shutting down.`);
    // Close sockets first so open connections are told to go away rather than being cut mid-frame.
    void closeSockets().catch(() => undefined);

    server.close(() => {
      logger.info('HTTP server closed.');
      void disconnectDB()
        .catch((err: unknown) => logger.error({ err }, 'Error closing database connection'))
        .finally(() => process.exit(0));
    });

    // Don't hang forever if a socket refuses to close.
    setTimeout(() => {
      logger.error('Forced shutdown after 10s timeout.');
      process.exit(1);
    }, 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'Unhandled promise rejection');
    shutdown('unhandledRejection');
  });

  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'Uncaught exception');
    process.exit(1);
  });
}

void bootstrap();
