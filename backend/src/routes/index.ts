import { Router } from 'express';
import healthRoutes from '../modules/health/health.routes.js';
import authRoutes from '../modules/auth/auth.routes.js';
import newsletterRoutes from '../modules/newsletter/newsletter.routes.js';
import petsRoutes from '../modules/pets/pets.routes.js';
import adoptionsRoutes from '../modules/adoptions/adoptions.routes.js';
import favoritesRoutes from '../modules/favorites/favorites.routes.js';
import usersRoutes from '../modules/users/users.routes.js';
import sheltersRoutes from '../modules/shelters/shelters.routes.js';
import adminRoutes from '../modules/admin/admin.routes.js';
import uploadRoutes from '../modules/upload/upload.routes.js';
import notificationsRoutes from '../modules/notifications/notifications.routes.js';
import messagesRoutes from '../modules/messages/messages.routes.js';
import donationsRoutes from '../modules/donations/donations.routes.js';
import reviewsRoutes from '../modules/reviews/reviews.routes.js';

/**
 * The API surface, mounted under env.API_PREFIX (/api/v1).
 * Each batch adds its module here; nothing else in the app knows about route paths.
 */
const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/newsletter', newsletterRoutes);
router.use('/pets', petsRoutes);
router.use('/adoptions', adoptionsRoutes);
router.use('/favorites', favoritesRoutes);
router.use('/users', usersRoutes);
router.use('/shelters', sheltersRoutes);
router.use('/admin', adminRoutes);
router.use('/upload', uploadRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/conversations', messagesRoutes);
router.use('/donations', donationsRoutes);
router.use('/reviews', reviewsRoutes);

// The Stripe webhook is NOT mounted here — it must sit above express.json(). See app.ts.

export default router;
