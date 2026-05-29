import { Router } from 'express';
import { z } from 'zod';
import { PharmaTemplate } from '../models/pharmaTemplate.model.js';

export const pharmaTemplatesRouter = Router();

// Starter outreach templates, inserted once when the collection is empty.
const DEFAULT_TEMPLATES = [
  {
    name: 'First touch — API supplier',
    subject: 'Sourcing {{matched_drugs}} — partnership with {{company_name}}',
    bodyHtml:
      'Hello {{company_name}} team,\n\nWe are sourcing {{matched_drugs}} for our formulation pipeline and came across your work in {{city}}, {{state}}. We would like to discuss supply, lead times, and documentation (COA/GMP).\n\nCould we set up a short call this week?\n\nBest regards,\n{{agent_name}}',
    variables: ['company_name', 'matched_drugs', 'city', 'state', 'agent_name'],
  },
  {
    name: 'Export enquiry',
    subject: 'Export enquiry for {{matched_drugs}}',
    bodyHtml:
      'Dear Sir/Madam,\n\nWe represent a distributor evaluating export partners for {{matched_drugs}}. Please share your export catalogue, MOQ, and pricing for {{company_name}}.\n\nReachable at {{recipient_email}}.\n\nRegards,\n{{agent_name}}\n{{date}}',
    variables: ['matched_drugs', 'company_name', 'recipient_email', 'agent_name', 'date'],
  },
  {
    name: 'Follow-up',
    subject: 'Following up — {{company_name}}',
    bodyHtml:
      'Hi,\n\nJust following up on my earlier note about {{matched_drugs}}. Happy to share our requirement spec and volumes whenever convenient.\n\nThanks,\n{{agent_name}}',
    variables: ['company_name', 'matched_drugs', 'agent_name'],
  },
];

// GET /v1/pharma-templates — list templates (seeds defaults on first call).
pharmaTemplatesRouter.get('/', async (_req, res) => {
  if ((await PharmaTemplate.estimatedDocumentCount()) === 0) {
    await PharmaTemplate.insertMany(DEFAULT_TEMPLATES);
  }
  const templates = await PharmaTemplate.find().sort({ createdAt: 1 }).limit(100);
  res.json(templates);
});

const templateSchema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  bodyHtml: z.string().min(1),
  variables: z.array(z.string()).optional(),
});

// POST /v1/pharma-templates — create a template.
pharmaTemplatesRouter.post('/', async (req, res) => {
  const parsed = templateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const tpl = await PharmaTemplate.create(parsed.data);
  res.status(201).json(tpl);
});
