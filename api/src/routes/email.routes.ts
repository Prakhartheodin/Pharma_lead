import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { config } from '../config/config.js';
import { EmailAccount } from '../models/emailAccount.model.js';
import { requireUser, toUserObjectId } from '../middleware/requireUser.js';
import * as emailClient from '../services/email/emailClient.service.js';
import * as emailTemplateService from '../services/email/emailTemplate.service.js';
import * as emailSignatureService from '../services/email/emailSignature.service.js';
import { generateEmailDraftOptions } from '../services/email/emailDraftOpenAI.service.js';
import { sendPayloadSchema, sendViaGmail } from '../services/email/sendViaGmail.js';

export const emailRouter = Router();

function parseStateUserId(stateEncoded: string): string | undefined {
  try {
    const decoded = JSON.parse(Buffer.from(stateEncoded, 'base64url').toString('utf8'));
    return decoded.userId ? String(decoded.userId) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Browser OAuth entry — no X-User-Id header (navigate here from the SPA).
 * Encodes userId in Google OAuth state; defaults to demo-user for the stand-in auth.
 */
function redirectToGoogleOAuth(req: Request, res: Response) {
  const raw = String(req.query.userId ?? req.header('X-User-Id') ?? 'demo-user').trim();
  if (!raw) {
    return res.status(400).json({ error: 'userId query parameter is required' });
  }
  try {
    const userId = toUserObjectId(raw);
    const url = emailClient.getGoogleAuthUrl(userId);
    return res.redirect(url);
  } catch (err) {
    console.error('[oauth] start failed:', (err as Error).message);
    return res.status(500).json({ error: (err as Error).message });
  }
}

/** Browser OAuth entry — no X-User-Id header (preferred from the SPA). */
emailRouter.get('/auth/google/start', redirectToGoogleOAuth);

/** If opened in the browser without headers, redirect instead of 401 JSON. */
emailRouter.get('/auth/google', (req, res) => {
  const header = req.header('X-User-Id');
  const wantsJson =
    req.header('Accept')?.includes('application/json') ||
    req.header('Content-Type')?.includes('application/json');
  if (header && wantsJson) {
    try {
      const userId = toUserObjectId(header);
      return res.json({ url: emailClient.getGoogleAuthUrl(userId) });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  }
  return redirectToGoogleOAuth(req, res);
});

// OAuth callback — no auth header (Google redirect).
emailRouter.get('/auth/google/callback', async (req, res) => {
  const code = String(req.query.code ?? '');
  const state = String(req.query.state ?? '');
  if (!code) return res.status(400).send('Missing code');
  const userIdRaw = parseStateUserId(state);
  if (!userIdRaw) return res.redirect(`${config.corsOrigin}/?gmail_error=invalid_state`);
  const userId = toUserObjectId(userIdRaw);
  try {
    const account = await emailClient.handleGoogleCallback(code, userId, state);
    res.redirect(`${config.corsOrigin}/?gmail_connected=${encodeURIComponent(account.email)}`);
  } catch (err) {
    console.error('[oauth] callback failed:', (err as Error).message);
    res.redirect(`${config.corsOrigin}/?gmail_error=auth_failed`);
  }
});

emailRouter.use(requireUser);

emailRouter.get('/accounts', async (req, res) => {
  const accounts = await emailClient.listGmailAccounts(req.userId!);
  res.json(accounts);
});

emailRouter.delete('/accounts/:id', async (req, res) => {
  await emailClient.disconnectGmailAccount(req.params.id, req.userId!);
  res.json({ success: true });
});

const accountIdQuery = z.object({ accountId: z.string() });

emailRouter.get('/messages', async (req, res) => {
  const q = accountIdQuery.safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: q.error.flatten() });
  const result = await emailClient.listMessages(q.data.accountId, req.userId!, {
    labelId: String(req.query.labelId ?? ''),
    pageToken: String(req.query.pageToken ?? ''),
    pageSize: req.query.pageSize ? parseInt(String(req.query.pageSize), 10) : 20,
    query: String(req.query.q ?? ''),
  });
  res.json(result);
});

emailRouter.get('/threads', async (req, res) => {
  const q = accountIdQuery.safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: q.error.flatten() });
  try {
    const result = await emailClient.listThreads(q.data.accountId, req.userId!, {
      labelId: String(req.query.labelId ?? ''),
      pageToken: String(req.query.pageToken ?? ''),
      pageSize: req.query.pageSize ? parseInt(String(req.query.pageSize), 10) : 20,
      query: String(req.query.q ?? ''),
    });
    res.json(result);
  } catch (err) {
    console.error('[email] listThreads failed:', (err as Error).message);
    res.status(502).json({ error: (err as Error).message });
  }
});

emailRouter.get('/threads/:id', async (req, res) => {
  const q = accountIdQuery.safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: q.error.flatten() });
  const thread = await emailClient.getThread(q.data.accountId, req.userId!, req.params.id);
  res.json(thread);
});

emailRouter.get('/messages/:id', async (req, res) => {
  const q = accountIdQuery.safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: q.error.flatten() });
  const message = await emailClient.getMessage(q.data.accountId, req.userId!, req.params.id);
  res.json(message);
});

emailRouter.get('/messages/:messageId/attachments/:attachmentId', async (req, res) => {
  const q = accountIdQuery.safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: q.error.flatten() });
  const data = await emailClient.getAttachment(
    q.data.accountId,
    req.userId!,
    req.params.messageId,
    req.params.attachmentId
  );
  const buf = Buffer.from(data, 'base64');
  res.set('Content-Disposition', 'attachment');
  res.send(buf);
});

const sendBodySchema = z.object({
  accountId: z.string(),
  to: z.union([z.string().email(), z.array(z.string().email())]),
  cc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  bcc: z.union([z.string().email(), z.array(z.string().email())]).optional(),
  subject: z.string().default(''),
  html: z.string().default(''),
  attachments: z
    .array(
      z.object({
        filename: z.string(),
        content: z.union([z.string(), z.instanceof(Buffer)]),
        mimeType: z.string().optional(),
      })
    )
    .optional(),
  leadId: z.string().optional(),
  drugs: z.array(z.string()).optional(),
});

emailRouter.post('/messages/send', async (req: Request, res: Response) => {
  const parsed = sendBodySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  if (parsed.data.leadId) {
    try {
      const result = await sendViaGmail(req.userId!, {
        accountId: parsed.data.accountId,
        to: Array.isArray(parsed.data.to) ? parsed.data.to[0] : parsed.data.to,
        subject: parsed.data.subject,
        html: parsed.data.html,
        leadId: parsed.data.leadId,
        drugs: parsed.data.drugs,
      });
      return res.status(201).json(result);
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      return res.status(e.status ?? 500).json({ error: e.message ?? 'send failed' });
    }
  }

  try {
    const result = await emailClient.sendMessage(parsed.data.accountId, req.userId!, parsed.data);
    res.status(201).json(result);
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

const draftSchema = z.object({
  tone: z.enum(['professional', 'friendly', 'formal', 'persuasive', 'empathetic']),
  prompt: z.string().min(3).max(2000),
  subject: z.string().max(500).optional(),
  context: z.string().max(4000).optional(),
  recipientName: z.string().max(200).optional(),
  length: z.enum(['short', 'medium', 'long']).optional(),
});

emailRouter.post('/drafts/generate', async (req, res) => {
  const parsed = draftSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const result = await generateEmailDraftOptions(parsed.data);
    res.json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 502).json({ error: e.message ?? 'draft failed' });
  }
});

const replySchema = z.object({
  accountId: z.string(),
  html: z.string().default(''),
  attachments: z.array(z.object({
    filename: z.string(),
    content: z.union([z.string(), z.instanceof(Buffer)]),
    mimeType: z.string().optional(),
  })).optional(),
});

emailRouter.post('/messages/:id/reply', async (req, res) => {
  const parsed = replySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const result = await emailClient.replyMessage(
    parsed.data.accountId,
    req.userId!,
    req.params.id,
    parsed.data
  );
  res.status(201).json(result);
});

emailRouter.post('/messages/:id/reply-all', async (req, res) => {
  const parsed = replySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const result = await emailClient.replyAllMessage(
    parsed.data.accountId,
    req.userId!,
    req.params.id,
    parsed.data
  );
  res.status(201).json(result);
});

const forwardSchema = replySchema.extend({
  to: z.union([z.string().email(), z.array(z.string().email())]),
});

emailRouter.post('/messages/:id/forward', async (req, res) => {
  const parsed = forwardSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const result = await emailClient.forwardMessage(
    parsed.data.accountId,
    req.userId!,
    req.params.id,
    parsed.data
  );
  res.status(201).json(result);
});

emailRouter.patch('/messages/:id', async (req, res) => {
  const q = accountIdQuery.safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: q.error.flatten() });
  const body = z.object({
    addLabelIds: z.array(z.string()).optional(),
    removeLabelIds: z.array(z.string()).optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });
  await emailClient.modifyMessage(q.data.accountId, req.userId!, req.params.id, body.data);
  res.json({ success: true });
});

emailRouter.post('/messages/batch-modify', async (req, res) => {
  const body = z.object({
    accountId: z.string(),
    messageIds: z.array(z.string()),
    addLabelIds: z.array(z.string()).optional(),
    removeLabelIds: z.array(z.string()).optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });
  const result = await emailClient.batchModifyMessages(
    body.data.accountId,
    req.userId!,
    body.data.messageIds,
    body.data
  );
  res.json(result);
});

emailRouter.post('/threads/batch-modify', async (req, res) => {
  const body = z.object({
    accountId: z.string(),
    threadIds: z.array(z.string()),
    addLabelIds: z.array(z.string()).optional(),
    removeLabelIds: z.array(z.string()).optional(),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });
  const result = await emailClient.batchModifyThreads(
    body.data.accountId,
    req.userId!,
    body.data.threadIds,
    body.data
  );
  res.json(result);
});

emailRouter.post('/threads/trash', async (req, res) => {
  const body = z.object({ accountId: z.string(), threadIds: z.array(z.string()) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });
  await emailClient.trashThreads(body.data.accountId, req.userId!, body.data.threadIds);
  res.json({ success: true });
});

emailRouter.delete('/messages/:id', async (req, res) => {
  const q = accountIdQuery.safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: q.error.flatten() });
  await emailClient.deleteMessage(q.data.accountId, req.userId!, req.params.id);
  res.json({ success: true });
});

emailRouter.get('/labels', async (req, res) => {
  const q = accountIdQuery.safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: q.error.flatten() });
  const labels = await emailClient.listLabels(q.data.accountId, req.userId!);
  res.json(labels);
});

emailRouter.post('/labels', async (req, res) => {
  const q = accountIdQuery.safeParse(req.query);
  if (!q.success) return res.status(400).json({ error: q.error.flatten() });
  const body = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });
  const label = await emailClient.createLabel(q.data.accountId, req.userId!, body.data);
  res.status(201).json(label);
});

// Personal templates (Dharwin /email/templates)
const templateBody = z.object({
  title: z.string().min(1).max(200),
  subject: z.string().max(500).optional(),
  bodyHtml: z.string().min(1),
  isShared: z.boolean().optional(),
});

emailRouter.get('/templates', async (req, res) => {
  const data = await emailTemplateService.listTemplatesForUser(req.userId!);
  res.json(data);
});

emailRouter.post('/templates', async (req, res) => {
  const parsed = templateBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const doc = await emailTemplateService.createTemplate(req.userId!, parsed.data);
  res.status(201).json(doc);
});

emailRouter.patch('/templates/:templateId', async (req, res) => {
  const parsed = templateBody.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const doc = await emailTemplateService.updateTemplateById(
      req.params.templateId,
      req.userId!,
      parsed.data
    );
    res.json(doc);
  } catch (err) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

emailRouter.delete('/templates/:templateId', async (req, res) => {
  try {
    await emailTemplateService.deleteTemplateById(req.params.templateId, req.userId!);
    res.status(204).send();
  } catch (err) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

emailRouter.get('/signature', async (req, res) => {
  const doc = await emailSignatureService.getOrCreateSignature(req.userId!);
  res.json(doc);
});

emailRouter.patch('/signature', async (req, res) => {
  const body = z.object({ html: z.string().optional(), enabled: z.boolean().optional() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.flatten() });
  const doc = await emailSignatureService.updateSignature(req.userId!, body.data);
  res.json(doc);
});
