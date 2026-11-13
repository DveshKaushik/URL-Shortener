import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  checkDestination,
  createShortLink,
  getMyLinks,
  redirectToLongUrl,
  updateLink,
} from '../controllers/linkController.js';
import { getLinkAnalytics, getOverview, getReport } from '../controllers/analyticsController.js';
import {
  publicIpLimiter,
  redirectIpLimiter,
  shortenIpLimiter,
  shortenUserDailyLimiter,
  shortenUserHourlyLimiter,
} from '../middleware/rateLimit.js';

const router = express.Router();

router.post('/safety', requireAuth, checkDestination);
router.post(
  '/shorten',
  publicIpLimiter,
  shortenIpLimiter,
  requireAuth,
  shortenUserHourlyLimiter,
  shortenUserDailyLimiter,
  createShortLink
);
router.get('/links', requireAuth, getMyLinks);
router.get('/analytics/overview', requireAuth, getOverview);
router.get('/reports', requireAuth, getReport);
router.get('/links/:id/analytics', requireAuth, getLinkAnalytics);
router.patch('/links/:id', requireAuth, updateLink);
router.get('/:code', publicIpLimiter, redirectIpLimiter, redirectToLongUrl);

export default router;
