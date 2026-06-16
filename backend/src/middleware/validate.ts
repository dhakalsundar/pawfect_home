import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodType } from 'zod';
import { ApiError, type FieldErrors } from '../utils/ApiError.js';

type Source = 'body' | 'query' | 'params';

/**
 * Parses and REPLACES the request source with the validated result, so controllers receive
 * coerced, typed, stripped data — unknown keys are dropped rather than quietly forwarded into a
 * Mongo update.
 */
export function validate(schema: ZodType, source: Source = 'body'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      const fields: FieldErrors = {};
      for (const issue of result.error.issues) {
        const path = issue.path.join('.') || '_root';
        // First message per field only; three errors on one input is noise.
        if (!(path in fields)) fields[path] = issue.message;
      }
      return next(ApiError.validation('Please check the highlighted fields.', fields));
    }

    // req.query is a getter in Express 5, so assigning to it throws. Redefine the property instead.
    if (source === 'query') {
      Object.defineProperty(req, 'query', { value: result.data, writable: true, configurable: true });
    } else {
      req[source] = result.data as never;
    }

    next();
  };
}
