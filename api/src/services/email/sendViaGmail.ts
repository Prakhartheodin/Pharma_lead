import { z } from 'zod';
import { EmailAccount } from '../../models/emailAccount.model.js';
import { PharmaLead } from '../../models/pharmaLead.model.js';
import * as emailClient from './emailClient.service.js';

/** Dharwin-compatible send body + optional Pharma lead tracking. */
export const sendPayloadSchema = z
  .object({
    accountId: z.string(),
    to: z.string().email(),
    subject: z.string().min(1),
    html: z.string().optional(),
    body: z.string().optional(),
    leadId: z.string().optional(),
    drugs: z.array(z.string()).optional(),
  })
  .refine((d) => Boolean((d.html ?? d.body ?? '').trim()), {
    message: 'html or body is required',
  });

export type SendPayload = z.infer<typeof sendPayloadSchema>;

function bodyToHtml(html?: string, body?: string): string {
  const raw = (html ?? body ?? '').trim();
  return raw.includes('<') ? raw : raw.replace(/\n/g, '<br/>');
}

export async function sendViaGmail(userId: string, payload: SendPayload) {
  if (payload.leadId) {
    const lead = await PharmaLead.findById(payload.leadId);
    if (!lead) throw Object.assign(new Error('lead not found'), { status: 404 });
    if (lead.get('doNotContact')) {
      throw Object.assign(new Error('lead is marked do not contact'), { status: 409 });
    }
  }

  const account = await EmailAccount.findOne({
    _id: payload.accountId,
    user: userId,
    status: 'active',
  });
  if (!account) throw Object.assign(new Error('account not found'), { status: 404 });

  const html = bodyToHtml(payload.html, payload.body);
  let gmailResult: { id?: string | null; threadId?: string | null };
  try {
    gmailResult = await emailClient.sendMessage(payload.accountId, userId, {
      to: payload.to,
      subject: payload.subject,
      html,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw Object.assign(new Error(message), { status: 502 });
  }

  if (payload.leadId) {
    const lead = await PharmaLead.findById(payload.leadId);
    const drugs = payload.drugs ?? (lead?.matchedDrugs as string[] | undefined) ?? [];
    await PharmaLead.findByIdAndUpdate(payload.leadId, {
      status: 'contacted',
      lastPitchedAt: new Date(),
      lastPitchedDrugs: drugs,
    });
  }

  return { ok: true, id: gmailResult.id, threadId: gmailResult.threadId };
}
