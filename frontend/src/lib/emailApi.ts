import type {
  EmailDraftLength,
  EmailDraftTone,
  EmailLabel,
  EmailMessage,
  EmailThreadListItem,
  GeneratedEmailDraft,
  PersonalTemplate,
  PersonalTemplatesList,
} from './types';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000';
const DEMO_USER = 'demo-user';
const EMAIL = '/v1/email';

const headers = { 'Content-Type': 'application/json', 'X-User-Id': DEMO_USER };

export interface Result<T> {
  data: T;
  live: boolean;
}

function qs(params: Record<string, string | number | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}

async function emailGet<T>(path: string, params?: Record<string, string | number | undefined>): Promise<Result<T>> {
  try {
    const res = await fetch(`${API_BASE}${EMAIL}${path}${params ? qs(params) : ''}`, {
      headers,
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const msg = (body as { error?: string }).error ?? `${res.status}`;
      throw new Error(msg);
    }
    return { data: await res.json(), live: true };
  } catch {
    return { data: undefined as T, live: false };
  }
}

async function emailPost<T>(path: string, body?: unknown, params?: Record<string, string>): Promise<Result<T>> {
  try {
    const suffix = params ? qs(params) : '';
    const res = await fetch(`${API_BASE}${EMAIL}${path}${suffix}`, {
      method: 'POST',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${res.status}`);
    if (res.status === 204) return { data: undefined as T, live: true };
    return { data: await res.json(), live: true };
  } catch {
    return { data: undefined as T, live: false };
  }
}

async function emailPatch<T>(path: string, body: unknown): Promise<Result<T>> {
  try {
    const res = await fetch(`${API_BASE}${EMAIL}${path}`, { method: 'PATCH', headers, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`${res.status}`);
    return { data: await res.json(), live: true };
  } catch {
    return { data: undefined as T, live: false };
  }
}

async function emailDelete(path: string): Promise<Result<void>> {
  try {
    const res = await fetch(`${API_BASE}${EMAIL}${path}`, { method: 'DELETE', headers });
    if (!res.ok) throw new Error(`${res.status}`);
    return { data: undefined, live: true };
  } catch {
    return { data: undefined, live: false };
  }
}

export async function getThreads(params: {
  accountId: string;
  labelId?: string;
  pageToken?: string;
  pageSize?: number;
  q?: string;
}): Promise<Result<{ threads: EmailThreadListItem[]; nextPageToken: string | null }>> {
  return emailGet('/threads', params);
}

export async function getThread(
  accountId: string,
  threadId: string
): Promise<Result<{ id: string; messages: EmailMessage[] }>> {
  return emailGet(`/threads/${encodeURIComponent(threadId)}`, { accountId });
}

export async function getLabels(accountId: string): Promise<Result<EmailLabel[]>> {
  return emailGet('/labels', { accountId });
}

export async function sendMailboxMessage(body: {
  accountId: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html: string;
}): Promise<Result<{ id: string; threadId?: string }>> {
  return emailPost('/messages/send', body);
}

export async function generateDraft(body: {
  tone: EmailDraftTone;
  prompt: string;
  subject?: string;
  context?: string;
  recipientName?: string;
  length?: EmailDraftLength;
}): Promise<Result<GeneratedEmailDraft>> {
  return emailPost('/drafts/generate', body);
}

export async function replyMessage(
  messageId: string,
  body: { accountId: string; html: string }
): Promise<Result<{ id: string; threadId?: string }>> {
  return emailPost(`/messages/${messageId}/reply`, body);
}

export async function replyAllMessage(
  messageId: string,
  body: { accountId: string; html: string }
): Promise<Result<{ id: string; threadId?: string }>> {
  return emailPost(`/messages/${messageId}/reply-all`, body);
}

export async function forwardMessage(
  messageId: string,
  body: { accountId: string; to: string | string[]; html?: string }
): Promise<Result<{ id: string; threadId?: string }>> {
  return emailPost(`/messages/${messageId}/forward`, body);
}

export async function trashThreads(accountId: string, threadIds: string[]): Promise<Result<{ success: boolean }>> {
  return emailPost('/threads/trash', { accountId, threadIds });
}

export async function batchModifyThreads(
  accountId: string,
  threadIds: string[],
  opts: { addLabelIds?: string[]; removeLabelIds?: string[] }
): Promise<Result<{ success?: boolean }>> {
  return emailPost('/threads/batch-modify', { accountId, threadIds, ...opts });
}

export async function modifyMessage(
  accountId: string,
  messageId: string,
  opts: { addLabelIds?: string[]; removeLabelIds?: string[] }
): Promise<Result<{ success: boolean }>> {
  return emailPatch(`/messages/${messageId}?accountId=${encodeURIComponent(accountId)}`, opts);
}

export async function listPersonalTemplates(): Promise<Result<PersonalTemplatesList>> {
  const r = await emailGet<PersonalTemplatesList>('/templates');
  if (!r.live || !r.data) return { data: { own: [], shared: [] }, live: false };
  const map = (d: { _id?: string; id?: string } & PersonalTemplate) => ({
    ...d,
    id: d.id ?? (d._id as string),
  });
  return {
    data: {
      own: (r.data.own ?? []).map(map),
      shared: (r.data.shared ?? []).map(map),
    },
    live: true,
  };
}

export async function createPersonalTemplate(body: {
  title: string;
  subject?: string;
  bodyHtml: string;
  isShared?: boolean;
}): Promise<Result<PersonalTemplate>> {
  const r = await emailPost<PersonalTemplate>('/templates', body);
  if (r.live && r.data) return { data: { ...r.data, id: r.data.id ?? (r.data as { _id?: string })._id! }, live: true };
  return { data: { id: '', title: '', bodyHtml: '' }, live: false };
}

export async function updatePersonalTemplate(
  id: string,
  body: Partial<{ title: string; subject: string; bodyHtml: string; isShared: boolean }>
): Promise<Result<PersonalTemplate>> {
  return emailPatch(`/templates/${id}`, body);
}

export async function deletePersonalTemplate(id: string): Promise<Result<void>> {
  return emailDelete(`/templates/${id}`);
}

export function attachmentFetchUrl(accountId: string, messageId: string, attachmentId: string): string {
  return `${API_BASE}${EMAIL}/messages/${messageId}/attachments/${attachmentId}?accountId=${accountId}`;
}

export async function fetchAttachmentBlob(
  accountId: string,
  messageId: string,
  attachmentId: string
): Promise<Blob | null> {
  try {
    const res = await fetch(attachmentFetchUrl(accountId, messageId, attachmentId), { headers });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}
