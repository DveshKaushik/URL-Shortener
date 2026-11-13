import express from 'express';
import { register, login } from '../controllers/authController.js';
import {
  loginAccountLimiter,
  loginIpLimiter,
  publicIpLimiter,
  registerIpLimiter,
} from '../middleware/rateLimit.js';

const router = express.Router();

router.post('/register', publicIpLimiter, registerIpLimiter, register);
router.post('/login', publicIpLimiter, loginIpLimiter, loginAccountLimiter, login);

export default router;