import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireUser } from '../middleware/requireUser.js';
import { sendViaGmail, sendPayloadSchema } from '../services/email/sendViaGmail.js';

export const pharmaCampaignsRouter = Router();
pharmaCampaignsRouter.use(requireUser);

async function handleSend(req: Request, res: Response) {
  const parsed = sendPayloadSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const result = await sendViaGmail(req.userId!, parsed.data);
    res.json(result);
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    const status = e.status ?? 500;
    res.status(status).json({ error: e.message ?? 'send failed' });
  }
}

pharmaCampaignsRouter.post('/send', handleSend);
pharmaCampaignsRouter.post('/send-test', handleSend);
