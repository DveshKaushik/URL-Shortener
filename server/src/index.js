import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import pool from './db.js';
import authRoutes from './routes/auth.js';
import { requireAuth } from './middleware/auth.js';
import linkRoutes from './routes/link.js';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'change-me' || JWT_SECRET.length < 32) {
  console.error(
    'Fatal: set JWT_SECRET in server/.env to a strong secret (32+ characters), not "change-me".'
  );
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser clients (curl, server-to-server) with no Origin
      if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
        return callback(null, true);
      }
      return callback(null, false);
    },
  })
);

app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || '32kb' }));

app.get('/', (req, res) => {
  res.send('URL shortener API is running');
});

app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: true });
  } catch (err) {
    console.error(err);
    res.status(503).json({ ok: false, db: false });
  }
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ message: 'You are authenticated', user: req.user });
});

app.use('/api', authRoutes);
app.use('/api', linkRoutes);
app.use('/', linkRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
