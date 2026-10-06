/**
 * 35-mile local scan (ROADMAP P20): parse the radius token a user adds to a
 * location ("Columbus, OH within 35mi", or the radar's radius select), and
 * measure distances with the haversine formula so postings with text-only
 * locations ("Gahanna, OH", "43215") can be filtered to a true radius around
 * the scanned place. Pure and dependency-free so vitest covers it without
 * network access — the server side (Nominatim + cache) lives in jobSearch.ts.
 */

/** Minimum radius the scan accepts — a tighter "within" is noise. */
export const MIN_RADIUS_MILES = 5;
/** Maximum radius offered — beyond a commute, a state chip is the better filter. */
export const MAX_RADIUS_MILES = 100;

/**
 * Matches a trailing "within <n> mi" token (case-insensitive) and captures
 * the number: "Columbus, OH within 35mi", "within 50 miles".
 */
export const RADIUS_RE = /\s*within\s+(\d{1,3})\s*(?:mi|miles|mile)\s*$/i;

/** One location chip after parsing: where to scan and how far around it. */
export interface RadiusChip {
  /** The bare place ("Columbus, OH") — what boards match and maps resolve. */
  location: string;
  /** Radius in miles when a radius applies to this chip. */
  radiusMiles?: number;
}

/** Parse one raw location chip into its place + optional radius. */
export function parseRadiusLocation(raw: string): RadiusChip {
  const text = raw.trim().replace(/\s+/g, " ");
  const match = RADIUS_RE.exec(text);
  if (!match) return { location: text };
  return {
    location: text.slice(0, match.index).trim(),
    radiusMiles: clampRadius(Number(match[1])),
  };
}

/** Keep a radius inside the supported band. */
export function clampRadius(miles: number): number {
  return Math.max(MIN_RADIUS_MILES, Math.min(MAX_RADIUS_MILES, Math.round(miles)));
}

/**
 * Split the joined location string ("Columbus, OH within 35mi, Remote") into
 * chips. Because chips are comma-joined and a chip itself contains commas,
 * fragments accumulate until one carries the radius token:
 *   ["Columbus", "OH within 35mi", "Remote"] →
 *   [{location: "Columbus, OH", radiusMiles: 35}, {location: "Remote"}]
 * A radius fragment with no place in front of it is dropped.
 */
export function parseLocationChips(raw: string): RadiusChip[] {
  const chips: RadiusChip[] = [];
  let pending: string[] = [];
  for (const fragment of raw.split(/[,;|]/)) {
    const part = fragment.trim().replace(/\s+/g, " ");
    if (!part) continue;
    const match = RADIUS_RE.exec(part);
    if (!match) {
      pending.push(part);
      continue;
    }
    const place = [...pending, part.slice(0, match.index).trim()]
      .join(", ")
      .trim();
    pending = [];
    if (place) {
      chips.push({ location: place, radiusMiles: clampRadius(Number(match[1])) });
    }
  }
  if (pending.length > 0) chips.push({ location: pending.join(", ") });
  return chips;
}

/** Stable cache key for a place string. */
export function normalizeGeoKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 120);
}

const MILES_TO_KM = 1.609344;
const EARTH_RADIUS_KM = 6371;

/** Great-circle distance between two lat/lon points, in miles. */
export function haversineMiles(
  aLat: number,
  aLon: number,
  bLat: number,
  bLon: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  const angle = 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  return (angle * EARTH_RADIUS_KM) / MILES_TO_KM;
}

/** One resolved place: display name + coordinates. */
export interface GeoPlace {
  displayName: string;
  lat: number;
  lon: number;
}

/** Extract the first usable coordinate pair from a Nominatim results payload. */
export function nominatimFirstPlace(payload: unknown): GeoPlace | null {
  if (!Array.isArray(payload) || payload.length === 0) return null;
  const row = payload[0] as Record<string, unknown>;
  const lat = parseCoord(row.lat);
  const lon = parseCoord(row.lon);
  const name =
    typeof row.display_name === "string" && row.display_name.trim().length > 0
      ? row.display_name.trim()
      : "";
  if (lat === undefined || lon === undefined || !name) return null;
  return { displayName: name, lat, lon };
}

function parseCoord(value: unknown): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

/**
 * Fallback check when a posting's location can't be geocoded: keep it only
 * when it names the scanned place (its main token — the city or ZIP — or
 * every token at once), so we never claim a match we can't place on a map.
 */
export function mentionsPlace(postLocation: string, placeQuery: string): boolean {
  const pl = postLocation.toLowerCase().trim();
  const tokens = placeQuery
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
  if (!pl || tokens.length === 0) return false;
  return tokens.every((t) => pl.includes(t));
}
