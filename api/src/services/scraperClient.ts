import axios from 'axios';
import { config } from '../config/config.js';
import type { DiscoveredCompany } from './discovery/discoveryProvider.js';

/**
 * Dispatch a crawl to the Python scraper service. The scraper crawls each company,
 * classifies with GPT, and streams leads back to /internal/pharma-leads/ingest.
 * The callback target is derived from the scraper's own config — never sent here.
 */
export async function dispatchCrawl(input: {
  jobId: string;
  drugs: string[];
  city?: string;
  state?: string;
  companies: DiscoveredCompany[];
}): Promise<{ jobId: string; status: string; companies: number }> {
  const { data } = await axios.post(
    `${config.scraperUrl}/crawl`,
    {
      jobId: input.jobId,
      drugList: input.drugs,
      city: input.city,
      state: input.state,
      companies: input.companies.map((c) => ({
        website: c.website,
        companyName: c.companyName,
        phone: c.phone,
        address: c.address,
        city: c.city,
        state: c.state,
      })),
    },
    { headers: { 'X-Worker-Secret': config.workerSecret }, timeout: 15000 }
  );
  return data;
}
