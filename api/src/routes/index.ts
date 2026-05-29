import { Router } from 'express';
import { pharmaLeadsRouter } from './pharmaLeads.routes.js';
import { pharmaTemplatesRouter } from './pharmaTemplates.routes.js';
import { pharmaCampaignsRouter } from './pharmaCampaigns.routes.js';
import { emailRouter } from './email.routes.js';

export const router = Router();

router.use('/pharma-leads', pharmaLeadsRouter);
router.use('/pharma-templates', pharmaTemplatesRouter);
router.use('/pharma-campaigns', pharmaCampaignsRouter);
router.use('/email', emailRouter);
