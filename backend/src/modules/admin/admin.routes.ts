import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { csrfProtection } from '../../middleware/csrf.js';
import { ok } from '../../utils/ApiResponse.js';
import * as adminService from './admin.service.js';
import * as securityService from '../security/security.service.js';

const router = Router();

// Admin only, throughout. The role check sits here so no individual route can forget it.
router.use(authenticate, authorize('admin'));

const paginationShape = {
  page: z.coerce.number().int().positive().catch(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).catch(25).default(25),
};

const usersQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  role: z.enum(['user', 'shelter', 'admin']).optional(),
  status: z.enum(['active', 'suspended', 'banned']).optional(),
  ...paginationShape,
});

const listQuerySchema = z.object({
  status: z.string().trim().max(30).optional(),
  ...paginationShape,
});

const auditQuerySchema = z.object({
  action: z.string().trim().max(40).optional(),
  entityKind: z.enum(['user', 'shelter', 'pet', 'review', 'report']).optional(),
  ...paginationShape,
});

const securityQuerySchema = z.object({
  event: z.string().trim().max(40).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  ...paginationShape,
});

/** Captured for the audit trail on every mutation. */
function auditContext(req: { ip?: string; get: (name: string) => string | undefined }) {
  return { ip: req.ip, userAgent: req.get('user-agent') };
}

router.get('/stats', asyncHandler(async (_req, res) => ok(res, await adminService.getPlatformStats())));

// --- Users -------------------------------------------------------------------

router.get(
  '/users',
  validate(usersQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { items, meta } = await adminService.listUsers(req.query as never);
    return ok(res, items, 200, meta);
  }),
);

router.put(
  '/users/:id/role',
  csrfProtection,
  validate(z.object({ role: z.enum(['user', 'shelter', 'admin']) })),
  asyncHandler(async (req, res) =>
    ok(
      res,
      await adminService.setUserRole(
        req.user!,
        String(req.params.id),
        (req.body as { role: 'user' | 'shelter' | 'admin' }).role,
        auditContext(req),
      ),
    ),
  ),
);

router.put(
  '/users/:id/status',
  csrfProtection,
  validate(
    z.object({
      status: z.enum(['active', 'suspended', 'banned']),
      note: z.string().trim().max(500).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { status, note } = req.body as { status: 'active' | 'suspended' | 'banned'; note?: string };
    return ok(
      res,
      await adminService.setUserStatus(req.user!, String(req.params.id), status, note, auditContext(req)),
    );
  }),
);

// --- Shelters ----------------------------------------------------------------

router.get(
  '/shelters',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { items, meta } = await adminService.listShelters(req.query as never);
    return ok(res, items, 200, meta);
  }),
);

router.put(
  '/shelters/:id/status',
  csrfProtection,
  validate(
    z.object({
      status: z.enum(['approved', 'rejected', 'suspended']),
      reason: z.string().trim().max(1000).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { status, reason } = req.body as {
      status: 'approved' | 'rejected' | 'suspended';
      reason?: string;
    };
    return ok(
      res,
      await adminService.reviewShelter(req.user!, String(req.params.id), status, reason, auditContext(req)),
    );
  }),
);

// --- Pets --------------------------------------------------------------------

router.get(
  '/pets',
  validate(listQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { items, meta } = await adminService.listPetsForModeration(req.query as never);
    return ok(res, items, 200, meta);
  }),
);

router.put(
  '/pets/:id/moderate',
  csrfProtection,
  validate(
    z.object({
      action: z.enum(['approve', 'reject', 'feature', 'unfeature']),
      note: z.string().trim().max(1000).optional(),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { action, note } = req.body as {
      action: 'approve' | 'reject' | 'feature' | 'unfeature';
      note?: string;
    };
    return ok(
      res,
      await adminService.moderatePet(req.user!, String(req.params.id), action, note, auditContext(req)),
    );
  }),
);

// --- Audit log ---------------------------------------------------------------
// Read-only by design: there is no write, update or delete route. An audit log an administrator
// can edit is not an audit log.

router.get(
  '/audit-logs',
  validate(auditQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { items, meta } = await adminService.listAuditLogs(req.query as never);
    return ok(res, items, 200, meta);
  }),
);

// --- Security log ------------------------------------------------------------
// Also append-only, and also read-only here: the security log is the evidence trail for every
// control in the app, so no write/update/delete route is exposed for it either.

router.get(
  '/security-logs',
  validate(securityQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { items, meta } = await securityService.listSecurityLogs(req.query as never);
    return ok(res, items, 200, meta);
  }),
);

router.get(
  '/security-summary',
  asyncHandler(async (_req, res) => ok(res, await securityService.getSecuritySummary())),
);

export default router;
