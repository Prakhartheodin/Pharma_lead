import express from 'express';
import cors from 'cors';
import { config } from './config/config.js';
import { connectDb } from './config/db.js';
import { router as v1 } from './routes/index.js';
import { internalRouter } from './routes/internal.routes.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors({ origin: config.corsOrigin, credentials: true }));

app.get('/health', (_req, res) => res.json({ ok: true, service: 'api' }));

app.use('/v1', v1);
app.use('/internal', internalRouter); // worker -> api, secret-protected

// Last-resort error handler: a thrown route error returns 500 instead of nothing.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[api] route error:', err instanceof Error ? err.message : err);
  if (!res.headersSent) res.status(500).json({ error: 'internal error' });
});

// Never let a stray async rejection terminate the server.
process.on('unhandledRejection', (reason) => {
  console.error('[api] unhandledRejection:', reason instanceof Error ? reason.message : reason);
});

async function main() {
  await connectDb();
  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[api] listening on :${config.port}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[api] fatal:', err);
  process.exit(1);
});
