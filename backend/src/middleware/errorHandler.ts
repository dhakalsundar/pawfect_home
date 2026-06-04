import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { ApiError, ErrorCode, type FieldErrors } from '../utils/ApiError.js';
import type { ErrorBody } from '../utils/ApiResponse.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

/** 404 for anything that fell through the router. */
export const notFound: RequestHandler = (req, _res, next) => {
  next(new ApiError(404, ErrorCode.NOT_FOUND, `Route ${req.method} ${req.originalUrl} not found.`));
};

/** Flattens a ZodError into the { fieldPath: message } shape the frontend forms consume. */
function zodToFields(error: ZodError): FieldErrors {
  const fields: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_root';
    // Keep the first message per field — showing three errors on one input is noise.
    if (!(path in fields)) fields[path] = issue.message;
  }
  return fields;
}

/** Mongoose duplicate-key errors carry the offending index in `keyValue`. */
function isDuplicateKeyError(err: unknown): err is { code: 11000; keyValue: Record<string, unknown> } {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

/** Mongoose's CastError for an unparseable ObjectId — matched by shape to avoid importing it. */
function isObjectIdCastError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const candidate = err as { name?: string; kind?: string };
  return candidate.name === 'CastError' && candidate.kind === 'ObjectId';
}

/**
 * The only place an error becomes a response.
 *
 * Operational errors (ApiError) are reported as-is. Everything else is a bug: logged with its full
 * stack, reported to the client as a generic 500 so internals never leak.
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let apiError: ApiError;

  if (err instanceof ApiError) {
    apiError = err;
  } else if (err instanceof ZodError) {
    apiError = ApiError.validation('Please check the highlighted fields.', zodToFields(err));
  } else if (isDuplicateKeyError(err)) {
    const field = Object.keys(err.keyValue)[0] ?? 'value';
    apiError = ApiError.conflict(`That ${field} is already in use.`);
  } else if (isObjectIdCastError(err)) {
    /**
     * A path parameter that is not a valid ObjectId reached a query. Mongoose throws CastError,
     * which would otherwise surface as a 500 — but a string that cannot even *be* an id can never
     * name an existing document, so this is a 404 like any other miss. Reporting it as 404 also
     * keeps it indistinguishable from "exists but isn't yours", which is what the ownership
     * checks rely on.
     */
    apiError = ApiError.notFound('Resource');
  } else if (err instanceof SyntaxError && 'body' in err) {
    apiError = ApiError.validation('Request body is not valid JSON.');
  } else {
    apiError = ApiError.internal();
  }

  // Log unexpected errors loudly; expected ones quietly.
  if (apiError.statusCode >= 500) {
    logger.error(
      { err, method: req.method, url: req.originalUrl, userId: req.user?.id },
      'Unhandled error',
    );
  } else {
    logger.warn(
      { code: apiError.code, method: req.method, url: req.originalUrl },
      apiError.message,
    );
  }

  const body: ErrorBody = {
    success: false,
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.fields ? { fields: apiError.fields } : {}),
    },
  };

  // Stack traces in development only — never in a production response.
  if (env.isDev && apiError.statusCode >= 500 && err instanceof Error) {
    (body.error as Record<string, unknown>).stack = err.stack;
  }

  res.status(apiError.statusCode).json(body);
};
