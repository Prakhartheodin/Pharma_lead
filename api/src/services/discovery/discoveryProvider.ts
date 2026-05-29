// Discovery is behind this interface so a keyword SERP (Google CSE / Serper)
// can be added later without touching the crawler. See plan "Discovery Strategy".

export interface DiscoveredCompany {
  companyName: string;
  website: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  /** Distance from the search center, when a geolocation center was provided. */
  distanceKm?: number;
}

export type CompanyKind = 'manufacturer' | 'supplier' | 'exporter' | 'distributor' | 'buyer' | 'any';

export interface DiscoverInput {
  drugs: string[];
  city?: string;
  state?: string;
  limit: number;
  /** What kind of company to look for. Drives the Places query terms. */
  businessType?: CompanyKind;
  /** When city/state are empty, bias discovery around the user's location. */
  center?: { lat: number; lng: number };
  /** Registrable domains to skip (e.g. already-saved leads). */
  excludeDomains?: string[];
}

export interface DiscoveryProvider {
  discover(input: DiscoverInput): Promise<DiscoveredCompany[]>;
}
