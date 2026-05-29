import axios from 'axios';
import { getDomain } from 'tldts';
import { config } from '../../config/config.js';
import type {
  DiscoveryProvider,
  DiscoverInput,
  DiscoveredCompany,
  CompanyKind,
} from './discoveryProvider.js';

// Search-term sets per company kind. Places isn't drug-aware (drug match is done
// downstream by GPT), so these target the *type* of pharma business.
const QUERY_TERMS: Record<CompanyKind, string[]> = {
  manufacturer: ['pharmaceutical API manufacturer', 'bulk drug manufacturer', 'active pharmaceutical ingredient manufacturer'],
  supplier: ['pharmaceutical supplier', 'pharmaceutical raw material supplier', 'API supplier pharmaceutical'],
  exporter: ['pharmaceutical exporter', 'pharma export company', 'pharmaceutical export house'],
  distributor: ['pharmaceutical distributor', 'pharma wholesaler distributor', 'pharmaceutical stockist'],
  // Demand side — companies that BUY APIs: finished-formulation makers, importers, traders.
  // Kept to 3 terms to conserve the daily Places quota.
  buyer: [
    'pharmaceutical formulation manufacturer',
    'pharmaceutical company',
    'pharmaceutical importer',
  ],
  any: ['pharmaceutical company', 'pharmaceutical formulation manufacturer', 'pharmaceutical distributor'],
};

/**
 * Google Places API (New) — Text Search.
 * Company-by-location discovery; returns website + phone + address for free.
 * Drug matching happens downstream (crawl + GPT), since Places can't search by drug.
 *
 * Field mask drives billing SKU — requesting websiteUri + phone is a higher tier.
 * See plan open question on Places SKU/billing.
 */
const PLACES_URL = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = [
  'places.displayName',
  'places.formattedAddress',
  'places.websiteUri',
  'places.internationalPhoneNumber',
  'places.location',
  'places.addressComponents',
].join(',');

// PSL-aware: collapses a.example.co.in and example.co.in to the same registrable domain.
function registrableDomain(url: string): string | null {
  return getDomain(url) ?? null;
}

interface AddressComponent { longText?: string; shortText?: string; types?: string[] }

// Pull a human city + state out of Places address components (so the Location
// column is filled even when GPT classification doesn't return them).
function cityStateFrom(components: AddressComponent[] | undefined): { city?: string; state?: string } {
  const comps = components ?? [];
  const pick = (...types: string[]) =>
    comps.find((c) => c.types?.some((t) => types.includes(t)))?.longText;
  return {
    city: pick('locality', 'postal_town', 'administrative_area_level_3', 'administrative_area_level_2'),
    state: pick('administrative_area_level_1'),
  };
}

// Great-circle distance in km — used to band results by 100/300/500km from the user.
function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Places enforces a low burst/QPS limit. POST with spacing + 429 retry/backoff so
// firing several query terms per search doesn't trip RESOURCE_EXHAUSTED.
async function placesPost(body: unknown, fieldMask: string): Promise<{ places?: any[] }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const { data } = await axios.post(PLACES_URL, body, {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': config.googlePlacesApiKey,
          'X-Goog-FieldMask': fieldMask,
        },
      });
      return data;
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 429 && attempt < 3) {
        await sleep(800 * (attempt + 1)); // 0.8s, 1.6s, 2.4s
        continue;
      }
      throw err;
    }
  }
  return {};
}

export class GooglePlacesProvider implements DiscoveryProvider {
  async discover(input: DiscoverInput): Promise<DiscoveredCompany[]> {
    if (!config.googlePlacesApiKey) {
      throw new Error('GOOGLE_PLACES_API_KEY is not set');
    }

    const center = input.center;
    const locationMode = !input.city && !input.state && !!center;
    const loc = [input.city, input.state, 'India'].filter(Boolean).join(', ');
    const terms = QUERY_TERMS[input.businessType ?? 'manufacturer'] ?? QUERY_TERMS.manufacturer;
    const queries = locationMode ? terms : terms.map((t) => `${t} in ${loc}`);

    // Normalize exclusions to registrable domains so a saved "india-pharma.gsk.com"
    // also excludes "gsk.com" candidates (and vice-versa) — they're the same company.
    const exclude = new Set(
      (input.excludeDomains ?? []).map((d) => registrableDomain(d) ?? d.toLowerCase())
    );
    const seen = new Set<string>();
    const out: DiscoveredCompany[] = [];

    for (let qi = 0; qi < queries.length; qi++) {
      if (qi > 0) await sleep(350); // space out queries to stay under the burst limit
      const body: Record<string, unknown> = { textQuery: queries[qi], maxResultCount: 20 };
      // Soft proximity bias toward the user (circle radius capped at 50km by the API);
      // exact distance banding is done below with Haversine.
      if (center) {
        body.locationBias = {
          circle: { center: { latitude: center.lat, longitude: center.lng }, radius: 50000 },
        };
      }
      const data = await placesPost(body, FIELD_MASK);
      for (const p of data.places ?? []) {
        const website = p.websiteUri as string | undefined;
        if (!website) continue;
        const domain = registrableDomain(website);
        if (!domain || seen.has(domain) || exclude.has(domain.toLowerCase())) continue;
        const address = (p.formattedAddress as string) ?? '';
        // Only within India.
        if (!/\bindia\b/i.test(address)) continue;
        seen.add(domain);
        let distanceKm: number | undefined;
        if (center && p.location) {
          distanceKm = haversineKm(center, { lat: p.location.latitude, lng: p.location.longitude });
        }
        const loc = cityStateFrom(p.addressComponents);
        out.push({
          companyName: p.displayName?.text ?? '',
          website,
          phone: p.internationalPhoneNumber,
          address,
          city: loc.city ?? input.city,
          state: loc.state ?? input.state,
          distanceKm,
        });
      }
    }

    // Nearest first when we have a center; the route then bands by 100/300/500km.
    if (center) out.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
    return out;
  }

  /** Look up a single company by name to backfill its city/state from Places. */
  async lookupCityState(query: string): Promise<{ city?: string; state?: string } | null> {
    if (!config.googlePlacesApiKey || !query.trim()) return null;
    try {
      const data = await placesPost(
        { textQuery: `${query} India`, maxResultCount: 1 },
        'places.addressComponents,places.formattedAddress'
      );
      const p = data.places?.[0];
      if (!p) return null;
      const addr = (p.formattedAddress as string) ?? '';
      if (addr && !/\bindia\b/i.test(addr)) return null; // keep India-only
      return cityStateFrom(p.addressComponents);
    } catch {
      return null;
    }
  }
}
