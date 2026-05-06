import express, { Request, Response } from 'express';

let handler: express.Application;
let startupError: string | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { app } = require('../src/app') as { app: express.Application };
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { connectDatabase } = require('../src/config/database') as {
    connectDatabase: () => Promise<void>;
  };
  void connectDatabase().catch((e: unknown) =>
    console.error('[db] connection error:', e instanceof Error ? e.message : e),
  );
  handler = app;
} catch (e) {
  startupError = e instanceof Error ? (e.stack ?? e.message) : String(e);
  console.error('[startup] failed:', startupError);
  handler = express();
  handler.use((_req: Request, res: Response) => {
    res.status(500).json({ ok: false, error: 'startup_failed', details: startupError });
  });
}

export default handler;
