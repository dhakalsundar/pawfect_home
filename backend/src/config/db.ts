import { readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

let memoryServer: { stop: () => Promise<unknown> } | null = null;

/**
 * Deletes `mongo-mem-*` data directories left behind by previous runs.
 *
 * mongodb-memory-server only cleans up on a graceful shutdown, and a dev server dies by SIGKILL
 * constantly — every `tsx watch` restart, every Ctrl-C that does not land, every crash. Each
 * orphan is ~130 MB. In this project they reached **686 directories / 84 GB** and filled the disk
 * completely, at which point every tool that writes a file fails. Sweeping at boot keeps it
 * bounded without anyone having to remember.
 *
 * Only directories older than an hour are touched, so a second backend running concurrently
 * (tests against a separate instance, say) never has its live data dir pulled out from under it.
 */
async function sweepOrphanedDataDirs(): Promise<void> {
  const temp = tmpdir();
  const cutoff = Date.now() - 60 * 60 * 1000;
  let removed = 0;

  try {
    for (const name of await readdir(temp)) {
      if (!name.startsWith('mongo-mem-')) continue;

      const path = join(temp, name);
      try {
        const info = await stat(path);
        if (!info.isDirectory() || info.mtimeMs > cutoff) continue;
        await rm(path, { recursive: true, force: true });
        removed += 1;
      } catch {
        // In use by another process, or already gone. Either way, skip it.
      }
    }
  } catch {
    // Never let housekeeping stop the server from booting.
    return;
  }

  if (removed > 0) {
    logger.info({ removed }, 'Swept orphaned in-memory MongoDB data directories');
  }
}

/**
 * Resolves the connection string.
 *
 * When MONGODB_URI is unset in development we spin up an in-memory MongoDB rather than refusing to
 * boot. That keeps the whole auth flow runnable and testable before anyone provisions an Atlas
 * cluster. It is explicitly refused in production — silently starting a throwaway database that
 * loses every user on restart is far worse than failing to start.
 */
async function resolveUri(): Promise<string> {
  if (env.MONGODB_URI) return env.MONGODB_URI;

  if (env.isProd) {
    throw new Error('MONGODB_URI is required in production.');
  }

  logger.warn(
    'MONGODB_URI not set — starting an in-memory MongoDB. Data is DISCARDED on shutdown. ' +
      'Set MONGODB_URI in backend/.env to persist data.',
  );

  // Imported lazily so the dev-only dependency is never pulled into a production build.
  const { MongoMemoryServer } = await import('mongodb-memory-server');

  await sweepOrphanedDataDirs();

  const server = await MongoMemoryServer.create();
  memoryServer = server;
  return server.getUri('pawfecthome');
}

export async function connectDB(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;

  const uri = await resolveUri();

  // Fail fast on a bad connection string instead of buffering commands for 30s and then
  // surfacing a confusing timeout at the first query.
  mongoose.set('bufferCommands', false);
  mongoose.set('strictQuery', true);
  if (env.isDev) mongoose.set('autoIndex', true);

  mongoose.connection.on('error', (err) => logger.error({ err }, 'MongoDB connection error'));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));

  await mongoose.connect(uri, {
    maxPoolSize: 10,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 8000,
    socketTimeoutMS: 45_000,
  });

  logger.info(
    `MongoDB connected → ${mongoose.connection.name}${memoryServer ? ' (in-memory)' : ''}`,
  );
}

export async function disconnectDB(): Promise<void> {
  await mongoose.connection.close();
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
}

/** True when running against a throwaway in-memory database — surfaced by /health. */
export function isEphemeralDB(): boolean {
  return memoryServer !== null;
}
