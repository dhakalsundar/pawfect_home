import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { randomUUID } from 'node:crypto';

import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { configurePassport, passport } from './config/passport.js';
import apiRoutes from './routes/index.js';
import webhookRoutes from './modules/donations/webhook.routes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { mongoSanitize, xssSanitize, hppGuard } from './middleware/sanitize.js';
import { ipGuard } from './middleware/ipGuard.js';

export function createApp(): Express {
  const app = express();

  // Behind Render/Railway/Vercel proxies, so req.ip and Secure cookies resolve correctly.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const existing = req.headers['x-request-id'];
        const id = typeof existing === 'string' ? existing : randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      // Health checks would otherwise dominate the log at info level.
      autoLogging: { ignore: (req) => req.url?.endsWith('/health') ?? false },
    }),
  );

  app.use(
    helmet({
      // The API serves JSON, never HTML, so CSP here would only affect error pages.
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      // Exact origins only. A wildcard is incompatible with credentialed requests anyway,
      // and cookie auth means every request is credentialed.
      origin: (origin, callback) => {
        if (!origin || env.allowedOrigins.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id'],
      maxAge: 86_400,
    }),
  );

  /**
   * The Stripe webhook is mounted HERE, above express.json(), and nowhere else.
   *
   * Signature verification is an HMAC over the exact bytes Stripe sent. If the JSON parser ran
   * first, `req.body` would be a parsed object and re-serialising it changes key order, whitespace
   * and unicode escaping — the signature then never matches, and the failure looks like a
   * misconfigured secret rather than a middleware-ordering mistake. Moving this line below the
   * parser breaks every webhook silently.
   */
  app.use(`${env.API_PREFIX}/webhooks`, webhookRoutes);

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(compression());

  // Passport is used only to complete the Google OAuth handshake; our own JWT cookies carry the
  // session afterwards, so no session middleware is initialised.
  configurePassport();
  app.use(passport.initialize());

  /**
   * Input hardening, mounted after body parsing and before any route so nothing can forget it.
   * Order matters: strip Mongo operators first, then HTML from the remaining string values. The
   * Stripe webhook is deliberately mounted above express.json() and never reaches here, so its raw
   * body stays byte-exact for signature verification.
   */
  // Edge IP filter first, then operator-stripping, parameter-pollution collapse, and HTML stripping.
  app.use(ipGuard);
  app.use(mongoSanitize);
  app.use(hppGuard);
  app.use(xssSanitize);

  app.use(env.API_PREFIX, apiRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
