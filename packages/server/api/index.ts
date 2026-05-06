import { connectDatabase } from '../src/config/database';
import { app } from '../src/app';

// Trigger DB connection on cold start — non-blocking, completes before first request
void connectDatabase().catch(console.error);

export default app;
