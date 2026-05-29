import { Router, type Request, type Response, type NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { config } from '../config/config.js';
import { PharmaLead } from '../models/pharmaLead.model.js';
import { PharmaLeadSearchJob } from '../models/pharmaLeadSearchJob.model.js';

export const internalRouter = Router();

// Constant-time comparison to avoid leaking the secret via response timing.
function secretMatches(provided: string | undefined): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(config.workerSecret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Shared-secret gate for worker -> api calls. See plan "Callback contract".
function requireWorkerSecret(req: Request, res: Response, next: NextFunction) {
  if (!secretMatches(req.header('X-Worker-Secret'))) {
    return res.status(401).json({ error: 'bad worker secret' });
  }
  next();
}

internalRouter.use(requireWorkerSecret);

// POST /internal/pharma-leads/ingest — one POST per company (domain).
// Idempotent upsert on (jobId, domain); merges Places seed + crawled contacts.
internalRouter.post('/pharma-leads/ingest', async (req, res) => {
  const lead = req.body;
  if (!lead?.jobId || !lead?.domain) {
    return res.status(400).json({ error: 'jobId and domain required' });
  }
  // Never let the worker dictate `saved` — it's owned by the user via the UI.
  // New leads default to saved:false and show up under Search; the user stars the
  // ones worth keeping, which moves them to Contacts.
  const { saved: _ignoreSaved, ...fields } = lead;
  const result = await PharmaLead.updateOne(
    { jobId: lead.jobId, domain: lead.domain },
    { $set: { ...fields, lastCrawledAt: new Date() } },
    { upsert: true, setDefaultsOnInsert: true }
  );
  // Only count progress on a genuine insert — retried callbacks must not inflate it.
  if (result.upsertedCount > 0) {
    await PharmaLeadSearchJob.findByIdAndUpdate(lead.jobId, {
      $inc: { 'progress.leadsCreated': 1, 'progress.crawledDomains': 1 },
    });
  }
  res.json({ ok: true, inserted: result.upsertedCount > 0 });
});

// POST /internal/pharma-leads/job-summary — final summary on crawl completion.
internalRouter.post('/pharma-leads/job-summary', async (req, res) => {
  const { jobId, status, failedDomains } = req.body ?? {};
  if (!jobId) return res.status(400).json({ error: 'jobId required' });
  await PharmaLeadSearchJob.findByIdAndUpdate(jobId, {
    status: status ?? 'completed',
    completedAt: new Date(),
    ...(failedDomains != null ? { 'progress.failedDomains': failedDomains } : {}),
  });
  res.json({ ok: true });
});
