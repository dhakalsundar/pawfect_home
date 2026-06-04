import mongoose from 'mongoose';
import { env } from '../../config/env.js';
import { isEphemeralDB } from '../../config/db.js';

export interface HealthReport {
  status: 'ok' | 'degraded';
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
  version: string;
  database: {
    state: 'connected' | 'connecting' | 'disconnected';
    ephemeral: boolean;
  };
  services: Record<string, 'configured' | 'not_configured'>;
}

const startedAt = Date.now();

/**
 * A health check that reports which integrations are actually wired up. During early batches most
 * of these are intentionally `not_configured` — the endpoint makes that visible rather than
 * leaving it to be discovered when a feature silently fails.
 */
const READY_STATES = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnected',
} as const;

export function getHealth(): HealthReport {
  const services = Object.fromEntries(
    Object.entries(env.isConfigured).map(([name, ready]) => [
      name,
      ready ? ('configured' as const) : ('not_configured' as const),
    ]),
  );

  const state =
    READY_STATES[mongoose.connection.readyState as keyof typeof READY_STATES] ?? 'disconnected';

  // `db` in `services` only reflects whether MONGODB_URI was supplied. Report the live connection
  // separately — running on the in-memory fallback is "connected" but very much not production
  // ready, and conflating the two would hide that.
  return {
    status: state === 'connected' ? 'ok' : 'degraded',
    environment: env.NODE_ENV,
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.1.0',
    database: { state, ephemeral: isEphemeralDB() },
    services,
  };
}
