import type { PharmaLead, EmailAccount, Template } from './types';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000';
// Stand-in for real auth (backend uses an X-User-Id header until session/JWT lands).
const DEMO_USER = 'demo-user';

const headers = { 'Content-Type': 'application/json', 'X-User-Id': DEMO_USER };

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

/** Each call returns { data, live }. live=false means the API was unreachable. */
export interface Result<T> { data: T; live: boolean; }

export async function listLeads(params?: { jobId?: string; saved?: boolean }): Promise<Result<PharmaLead[]>> {
  const qs = new URLSearchParams();
  if (params?.jobId) qs.set('jobId', params.jobId);
  if (params?.saved) qs.set('saved', 'true');
  const suffix = qs.toString() ? `?${qs.toString()}` : '';
  try {
    const data = await get<any[]>(`/v1/pharma-leads${suffix}`);
    const leads = data.map((d) => ({ ...d, id: d.id ?? d._id })) as PharmaLead[];
    return { data: leads, live: true };
  } catch {
    return { data: [], live: false };
  }
}

export async function startSearch(input: {
  drugs: string[]; city?: string; state?: string; businessType?: string; lat?: number; lng?: number;
  jobId?: string;
  batchSize?: number;
}): Promise<Result<{ jobId?: string; discovered?: number; status?: string; error?: string }>> {
  try {
    const res = await fetch(`${API_BASE}/v1/pharma-leads/search`, {
      method: 'POST', headers, body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    // The API returns a body (status:'failed' + error) even on 4xx/5xx — surface it
    // rather than hiding the reason (e.g. Places daily quota 429).
    if (!res.ok && !data?.error && !data?.jobId) throw new Error(`${res.status}`);
    return { data, live: true };
  } catch {
    return { data: {}, live: false };
  }
}

/** Fetch the next batch (default 5) into an existing search job. */
export async function loadMoreSearch(input: {
  jobId: string;
  drugs: string[];
  city?: string;
  state?: string;
  businessType?: string;
  lat?: number;
  lng?: number;
}): Promise<Result<{ jobId?: string; discovered?: number; status?: string; error?: string }>> {
  return startSearch({ ...input, batchSize: 5 });
}

export interface JobStatus {
  status?: string;
  progress?: { discoveredUrls?: number; crawledDomains?: number; leadsCreated?: number };
}
export async function getJobStatus(jobId: string): Promise<Result<JobStatus>> {
  try {
    return { data: await get<JobStatus>(`/v1/pharma-leads/search/${jobId}`), live: true };
  } catch {
    return { data: {}, live: false };
  }
}

export async function saveLead(id: string, saved: boolean): Promise<Result<{ saved: boolean }>> {
  try {
    const res = await fetch(`${API_BASE}/v1/pharma-leads/${id}/save`, {
      method: 'PATCH', headers, body: JSON.stringify({ saved }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return { data: await res.json(), live: true };
  } catch {
    return { data: { saved }, live: false };
  }
}

export async function listAccounts(): Promise<Result<EmailAccount[]>> {
  try {
    const data = await get<any[]>('/v1/email/accounts');
    return { data: data.map((d) => ({ ...d, id: d.id ?? d._id })) as EmailAccount[], live: true };
  } catch {
    return { data: [], live: false };
  }
}

export async function disconnectAccount(accountId: string): Promise<Result<{ success: boolean }>> {
  try {
    const res = await fetch(`${API_BASE}/v1/email/accounts/${encodeURIComponent(accountId)}`, {
      method: 'DELETE',
      headers,
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return { data: await res.json(), live: true };
  } catch {
    return { data: { success: false }, live: false };
  }
}

export async function listTemplates(): Promise<Result<Template[]>> {
  try {
    const data = await get<any[]>('/v1/pharma-templates');
    return { data: data.map((d) => ({ ...d, id: d.id ?? d._id })) as Template[], live: true };
  } catch {
    return { data: [], live: false };
  }
}

export async function sendEmail(input: {
  accountId: string;
  to: string;
  subject: string;
  body: string;
  leadId?: string;
  drugs?: string[];
}): Promise<Result<{ ok: boolean; id?: string; threadId?: string }>> {
  try {
    const res = await fetch(`${API_BASE}/v1/pharma-campaigns/send`, {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return { data: await res.json(), live: true };
  } catch {
    return { data: { ok: false }, live: false };
  }
}

/**
 * Gmail OAuth — full-page redirect (browsers cannot send X-User-Id on navigation).
 * Uses /v1/email/auth/google/start which encodes demo-user in OAuth state.
 */
export function getGmailConnectUrl(): string {
  return `${API_BASE}/v1/email/auth/google/start?userId=${encodeURIComponent(DEMO_USER)}`;
}

export async function connectGmail(): Promise<Result<{ url: string }>> {
  return { data: { url: getGmailConnectUrl() }, live: true };
}
