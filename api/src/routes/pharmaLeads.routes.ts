import { Router } from 'express';
import { z } from 'zod';
import { PharmaLeadSearchJob } from '../models/pharmaLeadSearchJob.model.js';
import { PharmaLead } from '../models/pharmaLead.model.js';
import { GooglePlacesProvider } from '../services/discovery/googlePlaces.provider.js';
import { dispatchCrawl } from '../services/scraperClient.js';

export const pharmaLeadsRouter = Router();

const searchSchema = z.object({
  drugs: z.array(z.string()).min(1),
  city: z.string().optional(),
  state: z.string().optional(),
  batchSize: z.number().int().positive().max(200).optional(),
  businessType: z.enum(['manufacturer', 'supplier', 'exporter', 'distributor', 'buyer', 'any']).optional(),
  // Optional user location — used to expand search radius when city/state are empty.
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  /** When set, append the next batch to an existing job (load more). */
  jobId: z.string().optional(),
});

// Expand the radius until we have at least MIN_RESULTS unsaved companies:
// start at 100km, then widen by 200km up to ~3500km (covers all of India).
const RADIUS_BANDS_KM = [100, ...Array.from({ length: 17 }, (_, i) => 300 + i * 200)];
const MIN_RESULTS = 5;
const LOAD_MORE_BATCH = 5;

type SearchParams = z.infer<typeof searchSchema>;

async function collectExcludeDomains(jobId?: string): Promise<string[]> {
  const savedDocs = await PharmaLead.find({ saved: true }).select('domain').lean();
  const domains = savedDocs.map((d) => (d as { domain?: string }).domain).filter(Boolean) as string[];
  if (jobId) {
    const jobDocs = await PharmaLead.find({ jobId }).select('domain').lean();
    for (const d of jobDocs) {
      const domain = (d as { domain?: string }).domain;
      if (domain) domains.push(domain);
    }
  }
  return [...new Set(domains)];
}

async function discoverCompanies(
  params: SearchParams,
  excludeDomains: string[],
  limit: number
) {
  const provider = new GooglePlacesProvider();
  const useLocation =
    !params.city &&
    !params.state &&
    params.lat != null &&
    params.lng != null;

  if (useLocation) {
    const candidates = await provider.discover({
      drugs: params.drugs,
      center: { lat: params.lat!, lng: params.lng! },
      businessType: params.businessType,
      excludeDomains,
      limit,
    });
    let banded = candidates;
    for (const km of RADIUS_BANDS_KM) {
      banded = candidates.filter((c) => (c.distanceKm ?? Infinity) <= km);
      if (banded.length >= MIN_RESULTS) break;
    }
    if (banded.length < MIN_RESULTS) banded = candidates;
    return banded.slice(0, limit);
  }

  return (
    await provider.discover({
      drugs: params.drugs,
      city: params.city,
      state: params.state,
      businessType: params.businessType,
      excludeDomains,
      limit,
    })
  ).slice(0, limit);
}

// POST /v1/pharma-leads/search — create a job, run Google Places discovery,
// then dispatch the discovered companies to the scraper. The scraper crawls and
// streams leads back to /internal/pharma-leads/ingest.
pharmaLeadsRouter.post('/search', async (req, res) => {
  const parsed = searchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const isLoadMore = !!parsed.data.jobId;
  const limit = parsed.data.batchSize ?? (isLoadMore ? LOAD_MORE_BATCH : 50);

  let job;
  if (isLoadMore) {
    job = await PharmaLeadSearchJob.findById(parsed.data.jobId);
    if (!job) return res.status(404).json({ error: 'job not found' });
  } else {
    job = await PharmaLeadSearchJob.create({
      drugs: parsed.data.drugs,
      city: parsed.data.city,
      state: parsed.data.state,
      batchSize: limit,
      status: 'queued',
    });
  }

  try {
    const excludeDomains = await collectExcludeDomains(isLoadMore ? String(job.id) : undefined);
    const companies = await discoverCompanies(parsed.data, excludeDomains, limit);

    const prevDiscovered = (job as { progress?: { discoveredUrls?: number } }).progress?.discoveredUrls ?? 0;
    await PharmaLeadSearchJob.findByIdAndUpdate(job.id, {
      status: companies.length ? 'running' : 'completed',
      startedAt: (job as { startedAt?: Date }).startedAt ?? new Date(),
      'progress.discoveredUrls': isLoadMore ? prevDiscovered + companies.length : companies.length,
      ...(companies.length ? { $unset: { completedAt: 1 } } : { completedAt: new Date() }),
    });

    if (companies.length === 0) {
      return res.status(201).json({ jobId: job.id, status: 'completed', discovered: 0 });
    }

    await dispatchCrawl({
      jobId: job.id,
      drugs: parsed.data.drugs,
      city: parsed.data.city,
      state: parsed.data.state,
      companies,
    });

    return res.status(201).json({ jobId: job.id, status: 'running', discovered: companies.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await PharmaLeadSearchJob.findByIdAndUpdate(job.id, { status: 'failed', error: message });
    return res.status(502).json({ jobId: job.id, status: 'failed', error: message });
  }
});

// POST /v1/pharma-leads/recrawl — re-run the crawl for EXISTING leads to refresh
// their contacts/URLs with the current extraction logic. Updates leads in place
// (upsert on jobId+domain), reusing stored seeds — no Google Places discovery spend.
// Body: { saved?: boolean } to limit to saved leads.
pharmaLeadsRouter.post('/recrawl', async (req, res) => {
  const filter = req.body?.saved ? { saved: true } : {};
  const leads = await PharmaLead.find(filter)
    .select('jobId website companyName contacts matchedDrugs')
    .lean();

  const byJob = new Map<string, typeof leads>();
  for (const l of leads) {
    const lead = l as { jobId?: unknown; website?: string };
    if (!lead.website || !lead.jobId) continue;
    const jid = String(lead.jobId);
    if (!byJob.has(jid)) byJob.set(jid, []);
    byJob.get(jid)!.push(l);
  }

  let jobsDispatched = 0;
  let companies = 0;
  for (const [jobId, group] of byJob) {
    const job = (await PharmaLeadSearchJob.findById(jobId).lean()) as
      | { drugs?: string[]; city?: string; state?: string }
      | null;
    const drugs = job?.drugs?.length
      ? job.drugs
      : [...new Set(group.flatMap((l) => (l as { matchedDrugs?: string[] }).matchedDrugs ?? []))];
    const seeds = group.map((l) => {
      const lead = l as { website: string; companyName?: string; contacts?: { type: string; value: string; confidence?: number }[] };
      const phone = (lead.contacts ?? [])
        .filter((c) => c.type === 'phone')
        .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0]?.value;
      return { website: lead.website, companyName: lead.companyName ?? '', phone };
    });
    try {
      await dispatchCrawl({ jobId, drugs, city: job?.city, state: job?.state, companies: seeds });
      await PharmaLeadSearchJob.findByIdAndUpdate(jobId, { status: 'running' });
      jobsDispatched += 1;
      companies += seeds.length;
    } catch {
      // skip a job that fails to dispatch; others still proceed
    }
  }
  res.json({ ok: true, jobsDispatched, companies });
});

// POST /v1/pharma-leads/backfill-location — fill city/state for leads that lack it,
// by looking each company up on Google Places (reliable address components).
// Body: { saved?: boolean } to limit to saved leads.
pharmaLeadsRouter.post('/backfill-location', async (req, res) => {
  const baseFilter = req.body?.saved ? { saved: true } : {};
  const leads = await PharmaLead.find(baseFilter)
    .select('companyName domain city state')
    .lean();
  const provider = new GooglePlacesProvider();
  let scanned = 0;
  let updated = 0;
  for (const l of leads) {
    const lead = l as { _id: unknown; companyName?: string; domain?: string; city?: string; state?: string };
    if (lead.city && lead.state) continue;
    scanned += 1;
    const loc = await provider.lookupCityState(lead.companyName || lead.domain || '');
    if (loc && (loc.city || loc.state)) {
      await PharmaLead.updateOne(
        { _id: lead._id },
        { $set: { city: lead.city || loc.city, state: lead.state || loc.state } }
      );
      updated += 1;
    }
  }
  res.json({ ok: true, scanned, updated });
});

pharmaLeadsRouter.get('/search/:jobId', async (req, res) => {
  const job = await PharmaLeadSearchJob.findById(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'not found' });
  res.json(job);
});

// TODO: pause / resume / cancel proxy to the scraper service
pharmaLeadsRouter.post('/search/:jobId/pause', (_req, res) => res.json({ todo: 'pause' }));
pharmaLeadsRouter.post('/search/:jobId/resume', (_req, res) => res.json({ todo: 'resume' }));
pharmaLeadsRouter.post('/search/:jobId/cancel', (_req, res) => res.json({ todo: 'cancel' }));

pharmaLeadsRouter.get('/', async (req, res) => {
  const filter: Record<string, unknown> = {};
  const jobId = req.query.jobId;
  // Coerce + validate to a 24-hex ObjectId string so a `?jobId[$ne]=` style
  // object can't reach the Mongo query (NoSQL operator injection).
  if (typeof jobId === 'string' && /^[a-f\d]{24}$/i.test(jobId)) filter.jobId = jobId;
  if (req.query.saved === 'true') filter.saved = true;
  const leads = await PharmaLead.find(filter).sort({ confidence: -1 }).limit(200);
  res.json(leads);
});

// PATCH /v1/pharma-leads/:leadId/save — bookmark / un-bookmark a lead.
pharmaLeadsRouter.patch('/:leadId/save', async (req, res) => {
  const saved = req.body?.saved !== false; // default true
  const lead = await PharmaLead.findByIdAndUpdate(
    req.params.leadId,
    { saved },
    { new: true }
  );
  if (!lead) return res.status(404).json({ error: 'not found' });
  res.json({ id: lead.id, saved: lead.get('saved') });
});

pharmaLeadsRouter.get('/:leadId', async (req, res) => {
  const lead = await PharmaLead.findById(req.params.leadId);
  if (!lead) return res.status(404).json({ error: 'not found' });
  res.json(lead);
});
