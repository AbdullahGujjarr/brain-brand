import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { OAuth2Client } from 'google-auth-library';
import { config } from '../config.js';
import { User } from '../models.js';

const router = Router();
const COOKIE = 'bb_session';
const WEEKS_8 = 8 * 7 * 24 * 60 * 60 * 1000;
const googleClient = new OAuth2Client();

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

const publicUser = (u) => ({ id: u._id, email: u.email, name: u.name, avatar: u.avatar });

function startSession(res, user) {
  const token = jwt.sign({ sub: String(user._id) }, config.jwtSecret, { expiresIn: '56d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    maxAge: WEEKS_8,
  });
  res.json({ user: publicUser(user) });
}

export async function requireUser(req, res, next) {
  try {
    const { sub } = jwt.verify(req.cookies?.[COOKIE] ?? '', config.jwtSecret);
    req.user = await User.findById(sub);
    if (!req.user) throw new Error('No user');
    next();
  } catch {
    res.status(401).json({ error: 'Please sign in.' });
  }
}

router.get('/config', (_req, res) => res.json({ googleClientId: config.googleClientId }));

router.post('/register', limiter, async (req, res) => {
  const name = String(req.body.name ?? '').trim();
  const email = String(req.body.email ?? '').trim().toLowerCase();
  const password = String(req.body.password ?? '');
  if (!name) return res.status(400).json({ error: 'Please enter your name.' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email.' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (await User.exists({ email })) return res.status(409).json({ error: 'That email already has an account. Sign in instead.' });

  const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12) });
  startSession(res, user);
});

router.post('/login', limiter, async (req, res) => {
  const email = String(req.body.email ?? '').trim().toLowerCase();
  const password = String(req.body.password ?? '');
  const user = await User.findOne({ email });
  if (user && !user.passwordHash && user.googleId) {
    return res.status(400).json({ error: 'This account uses Google sign-in. Use the Google button.' });
  }
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'Wrong email or password.' });
  }
  startSession(res, user);
});

router.post('/google', limiter, async (req, res) => {
  if (!config.googleClientId) return res.status(503).json({ error: 'Google sign-in is not set up yet.' });
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: String(req.body.credential ?? ''),
      audience: config.googleClientId,
    });
    payload = ticket.getPayload();
  } catch {
    return res.status(401).json({ error: 'Google sign-in failed. Please try again.' });
  }
  if (!payload?.email || !payload.email_verified) {
    return res.status(401).json({ error: 'Your Google email is not verified.' });
  }

  const email = payload.email.toLowerCase();
  let user = await User.findOne({ $or: [{ googleId: payload.sub }, { email }] });
  if (!user) {
    user = await User.create({ email, name: payload.name || email.split('@')[0], googleId: payload.sub, avatar: payload.picture });
  } else if (!user.googleId) {
    // Emails are not verified at sign-up, so someone else could have registered this
    // address. Google has proved who owns it, so any earlier password stops working.
    user.googleId = payload.sub;
    user.passwordHash = undefined;
    user.avatar ||= payload.picture;
    await user.save();
  }
  startSession(res, user);
});

router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

router.get('/me', requireUser, (req, res) => res.json({ user: publicUser(req.user) }));

export default router;
