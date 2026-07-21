// Geocoding for delivery addresses — free, keyless, aggressively cached.
// The address universe is Kevin's repeat corporate buildings (dozens, not
// thousands): each normalized address is geocoded ONCE into GeoPoint, then
// served from Postgres forever. Nominatim usage policy compliance: sequential
// requests, ≥1.1s apart, descriptive User-Agent, results cached. US Census
// geocoder is the keyless fallback. Server-only.
import { prisma } from "./db";

const UA = "CaterGenie/1.0 (bistro-to-go operations dashboard; contact: bvukmir@gmail.com)";

/**
 * Normalize a street address into a building-level cache key: lowercase,
 * suite/floor/room stripped (suites poison geocoder hit rates and drive time
 * only cares about the building), whitespace collapsed.
 */
export function normalizeAddressKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[,.]/g, " ")
    .replace(/\b(suite|ste|floor|fl|room|rm|unit|#)\s*[\w-]+\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

let lastHit = 0;
const throttle = async () => {
  const wait = lastHit + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHit = Date.now();
};

async function nominatim(q: string): Promise<{ lat: number; lng: number } | null> {
  await throttle();
  const r = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=us&q=${encodeURIComponent(q)}`,
    { headers: { "User-Agent": UA } }
  );
  if (!r.ok) return null;
  const j = (await r.json()) as Array<{ lat: string; lon: string }>;
  if (!j?.length) return null;
  return { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon) };
}

async function census(q: string): Promise<{ lat: number; lng: number } | null> {
  const r = await fetch(
    `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=${encodeURIComponent(q)}`
  );
  if (!r.ok) return null;
  const j = (await r.json()) as { result?: { addressMatches?: Array<{ coordinates: { x: number; y: number } }> } };
  const m = j.result?.addressMatches?.[0];
  return m ? { lat: m.coordinates.y, lng: m.coordinates.x } : null;
}

/**
 * Cache-first geocode. `raw` should be a full address ("501 Grant Street,
 * Pittsburgh, PA 15219"). Returns coordinates or null; failures are cached
 * (failed=true) so sync runs never re-hammer the APIs for known misses.
 */
export async function geocodeCached(raw: string): Promise<{ lat: number; lng: number } | null> {
  const addressKey = normalizeAddressKey(raw);
  if (!addressKey) return null;
  const hit = await prisma.geoPoint.findUnique({ where: { addressKey } });
  if (hit) return hit.lat != null && hit.lng != null ? { lat: hit.lat, lng: hit.lng } : null;

  // Geocode the suite-stripped form — building-level is what routing needs.
  const query = raw.replace(/\b(suite|ste|floor|fl|room|rm|unit|#)\s*[\w-]+\b/gi, "").replace(/\s+/g, " ").trim();
  let pt: { lat: number; lng: number } | null = null;
  let provider: string | null = null;
  try {
    pt = await nominatim(query);
    if (pt) provider = "nominatim";
  } catch {
    // fall through to census
  }
  if (!pt) {
    try {
      pt = await census(query);
      if (pt) provider = "census";
    } catch {
      // cached as failed below
    }
  }
  await prisma.geoPoint.upsert({
    where: { addressKey },
    create: { addressKey, addressRaw: raw, lat: pt?.lat ?? null, lng: pt?.lng ?? null, provider, failed: !pt, attempts: 1 },
    update: { lat: pt?.lat ?? null, lng: pt?.lng ?? null, provider, failed: !pt, attempts: { increment: 1 } },
  });
  return pt;
}

/** Bistro To Go, East Ohio St (North Side), Pittsburgh — runs start/end here. */
export const DEPOT = { lat: 40.4533, lng: -80.0011, label: "Bistro To Go (depot)" };
