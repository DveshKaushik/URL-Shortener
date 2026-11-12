import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createShortLink,
  getMyLinks,
  redirectToLongUrl,
} from '../controllers/linkController.js';

const router = express.Router();

router.post('/shorten', requireAuth, createShortLink);
router.get('/links', requireAuth, getMyLinks);
router.get('/:code', redirectToLongUrl);

export default router;
