import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Express 5 forwards rejected promises to the error handler on its own, but wrapping is still worth
 * keeping: it makes the intent explicit at every route and keeps the codebase working identically
 * if a handler is ever mounted on an Express 4 sub-app.
 */
export function asyncHandler<
  Req extends Request = Request,
  Res extends Response = Response,
>(fn: (req: Req, res: Res, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    void Promise.resolve(fn(req as Req, res as Res, next)).catch(next);
  };
}
