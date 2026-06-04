import type { Request, Response } from 'express';
import { ok } from '../../utils/ApiResponse.js';
import { getHealth } from './health.service.js';

export function health(_req: Request, res: Response) {
  return ok(res, getHealth());
}
