import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './db.js';
import authRoutes from './routes/auth.js';
import { requireAuth } from './middleware/auth.js';
import linkRoutes from './routes/link.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Correct client IP behind reverse proxies (for geo / unique visitors)
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('URL shortener API is running');
});

app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({ dbTime: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database connection failed' });
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
