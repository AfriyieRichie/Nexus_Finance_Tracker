import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import { config } from './config';
import { logger } from './utils/logger';
import { errorMiddleware, notFoundMiddleware } from './middleware/error.middleware';
import { generalRateLimiter } from './middleware/rateLimiter.middleware';
import { auditLogger } from './middleware/auditLogger.middleware';

// Route imports — added as each module is built
import { authRouter } from './modules/auth/auth.routes';
import { organisationsRouter } from './modules/organisations/organisations.routes';
import { coaRouter } from './modules/chart-of-accounts/coa.routes';
import { periodsRouter } from './modules/accounting-periods/periods.routes';

const app = express();

// ─── Security Headers ───────────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: config.isProduction,
    crossOriginEmbedderPolicy: config.isProduction,
  }),
);

// ─── CORS ────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow requests with no origin (mobile apps, curl, Postman)
      if (!origin) return cb(null, true);
      if (config.allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: Origin ${origin} is not allowed`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);

// ─── Body Parsing ─────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Request Logging ─────────────────────────────────────────────────────
app.use(
  morgan('combined', {
    stream: { write: (msg) => logger.http(msg.trim()) },
    skip: (_req, res) => config.isTest && res.statusCode < 400,
  }),
);

// ─── Rate Limiting ────────────────────────────────────────────────────────
app.use('/api', generalRateLimiter);

// ─── Audit Logging ────────────────────────────────────────────────────────
app.use('/api', auditLogger);

// ─── Health Check ─────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), service: 'nexus-server' });
});

// ─── API Routes ───────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/organisations', organisationsRouter);
app.use('/api/v1/organisations/:organisationId/accounts', coaRouter);
app.use('/api/v1/organisations/:organisationId/periods', periodsRouter);

// ─── 404 & Error Handling ─────────────────────────────────────────────────
app.use(notFoundMiddleware);
app.use(errorMiddleware);

export { app };
