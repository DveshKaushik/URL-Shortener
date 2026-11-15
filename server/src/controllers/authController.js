import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../db.js';
import { normalizeEmail, validatePassword } from '../utils/authValidation.js';

export async function register(req, res) {
  const emailResult = normalizeEmail(req.body.email, { rejectDisposable: true });
  if (!emailResult.ok) {
    return res.status(400).json({ error: emailResult.error });
  }

  const passwordResult = validatePassword(req.body.password);
  if (!passwordResult.ok) {
    return res.status(400).json({ error: passwordResult.error });
  }

  const { email } = emailResult;
  const { password } = req.body;

  try {
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
      [email, passwordHash]
    );

    res.status(201).json({ user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}

export async function login(req, res) {
  const emailResult = normalizeEmail(req.body.email);
  if (!emailResult.ok) {
    return res.status(400).json({ error: emailResult.error });
  }

  if (typeof req.body.password !== 'string' || !req.body.password) {
    return res.status(400).json({ error: 'Password is required' });
  }

  const { email } = emailResult;
  const { password } = req.body;

  try {
    const result = await pool.query(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      token,
      user: { id: user.id, email: user.email },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  }
}
