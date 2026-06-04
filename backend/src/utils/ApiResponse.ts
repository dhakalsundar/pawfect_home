import type { Response } from 'express';
import type { ErrorCodeValue, FieldErrors } from './ApiError.js';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface SuccessBody<T> {
  success: true;
  data: T;
  meta?: PaginationMeta;
}

export interface ErrorBody {
  success: false;
  error: {
    code: ErrorCodeValue;
    message: string;
    fields?: FieldErrors;
  };
}

export type ApiBody<T> = SuccessBody<T> | ErrorBody;

/**
 * The single place a success response is shaped. Controllers call this rather than res.json()
 * directly, so the envelope can never drift between endpoints.
 */
export function ok<T>(
  res: Response,
  data: T,
  statusCode = 200,
  meta?: PaginationMeta,
): Response<SuccessBody<T>> {
  const body: SuccessBody<T> = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

export function created<T>(res: Response, data: T): Response<SuccessBody<T>> {
  return ok(res, data, 201);
}

export function noContent(res: Response): Response {
  return res.status(204).send();
}

/** Builds the pagination meta block from a total count and the requested page/limit. */
export function buildMeta(total: number, page: number, limit: number): PaginationMeta {
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}
