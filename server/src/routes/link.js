import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createShortLink,
  getMyLinks,
  redirectToLongUrl,
  updateLink,
} from '../controllers/linkController.js';
import { getLinkAnalytics } from '../controllers/analyticsController.js';

const router = express.Router();

router.post('/shorten', requireAuth, createShortLink);
router.get('/links', requireAuth, getMyLinks);
router.get('/links/:id/analytics', requireAuth, getLinkAnalytics);
router.patch('/links/:id', requireAuth, updateLink);
router.get('/:code', redirectToLongUrl);

export default router;
