import rateLimit from 'express-rate-limit';

export const generalRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please slow down and try again.',
    },
  },
  keyGenerator: (req) => {
    // Key by authenticated user ID if present, otherwise by IP
    const userId = (req as { userId?: string }).userId;
    return userId ?? req.ip ?? 'unknown';
  },
});

export const authRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  message: {
    success: false,
    error: {
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts. Please wait before trying again.',
    },
  },
});

export const reportRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many report generation requests. Please wait.',
    },
  },
});
