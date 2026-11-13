import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Per-user URL creation. Override in production via env without code changes. */
const SHORTEN_PER_USER = positiveInt(process.env.RATE_LIMIT_SHORTEN_USER, 30);
const SHORTEN_PER_USER_DAY = positiveInt(process.env.RATE_LIMIT_SHORTEN_USER_DAY, 100);
const SHORTEN_PER_IP = positiveInt(process.env.RATE_LIMIT_SHORTEN_IP, 40);
const LOGIN_ATTEMPTS = positiveInt(process.env.RATE_LIMIT_LOGIN, 10);
const REGISTER_PER_IP = positiveInt(process.env.RATE_LIMIT_REGISTER, 5);
const REDIRECT_PER_IP = positiveInt(process.env.RATE_LIMIT_REDIRECT, 120);
const PUBLIC_PER_IP = positiveInt(process.env.RATE_LIMIT_PUBLIC, 300);

function clientIp(req) {
  return ipKeyGenerator(req.ip ?? '');
}

function limiter({ windowMs, limit, error, keyGenerator, skipSuccessfulRequests = false }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests,
    keyGenerator: keyGenerator ?? ((req) => clientIp(req)),
    message: { error },
  });
}

/** Broad cap so scripts cannot hammer public routes. */
export const publicIpLimiter = limiter({
  windowMs: MINUTE,
  limit: PUBLIC_PER_IP,
  error: 'Too many requests. Try again in a minute.',
});

/** Failed logins only, so a normal sign-in does not consume the budget. */
export const loginIpLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: LOGIN_ATTEMPTS,
  skipSuccessfulRequests: true,
  error: 'Too many login attempts from this network. Try again later.',
});

/** Stops password guessing against one account from many addresses. */
export const loginAccountLimiter = limiter({
  windowMs: 15 * MINUTE,
  limit: LOGIN_ATTEMPTS,
  skipSuccessfulRequests: true,
  error: 'Too many login attempts for this account. Try again later.',
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return email ? `login:${email}` : clientIp(req);
  },
});

/** Slows automated account creation. */
export const registerIpLimiter = limiter({
  windowMs: HOUR,
  limit: REGISTER_PER_IP,
  error: 'Too many accounts created from this network. Try again later.',
});

/** One IP cannot fan out creates across many accounts. */
export const shortenIpLimiter = limiter({
  windowMs: HOUR,
  limit: SHORTEN_PER_IP,
  error: 'Too many links created from this network. Try again later.',
});

export const shortenUserHourlyLimiter = limiter({
  windowMs: HOUR,
  limit: SHORTEN_PER_USER,
  error: 'You have created too many links this hour. Try again later.',
  keyGenerator: (req) => {
    const userId = req.user?.userId;
    return userId != null ? `shorten:hour:${userId}` : clientIp(req);
  },
});

export const shortenUserDailyLimiter = limiter({
  windowMs: 24 * HOUR,
  limit: SHORTEN_PER_USER_DAY,
  error: 'You have created too many links today. Try again tomorrow.',
  keyGenerator: (req) => {
    const userId = req.user?.userId;
    return userId != null ? `shorten:day:${userId}` : clientIp(req);
  },
});

/** Stops redirect loops and click-farming from one address. */
export const redirectIpLimiter = limiter({
  windowMs: MINUTE,
  limit: REDIRECT_PER_IP,
  error: 'Too many redirects from this network. Try again in a minute.',
});
