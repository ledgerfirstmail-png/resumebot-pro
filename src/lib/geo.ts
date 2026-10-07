/**
 * 35-mile local scan (ROADMAP P20): parse the radius token a user adds to a
 * location ("Columbus, OH within 35mi", or the radar's radius select), and
 * measure distances with the haversine formula so postings with text-only
 * locations ("Gahanna, OH", "43215") can be filtered to a true radius around
 * the scanned place. Pure and dependency-free so vitest covers it without
 * network access — the server side (Nominatim + cache) lives in jobSearch.ts.
 */

import { US_STATES } from "./matchScore";

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
 * Radius up to which the name-match fallback may pass postings that couldn't
 * be measured — 35 miles around a named town covers its metro; wider radii
 * need real coordinates instead of a name check.
 */
export const RADIUS_FALLBACK_MAX_MILES = 35;

const STATE_ABBRS = [...new Set(Object.values(US_STATES))].join("|");
/** State abbreviations only count next to a comma or a ZIP ("in"/"or" are words). */
const ABBR_AFTER_COMMA_RE = new RegExp(`[,;|]\\s*(${STATE_ABBRS})\\b`, "i");
const ABBR_BEFORE_ZIP_RE = new RegExp(`\\b(${STATE_ABBRS})\\s+\\d{5}\\b`, "i");

/**
 * The US state a location string names ("oh"), or null. Full state names
 * match anywhere; two-letter abbreviations only count in unambiguous spots
 * (", OH", "OH 43215") so "Work in Columbus" never reads as Indiana.
 */
export function usStateInText(text: string): string | null {
  const pl = text.toLowerCase().replace(/\s+/g, " ").trim();
  for (const [name, abbr] of Object.entries(US_STATES)) {
    if (pl.includes(name)) return abbr;
  }
  return (
    ABBR_AFTER_COMMA_RE.exec(pl)?.[1] ?? ABBR_BEFORE_ZIP_RE.exec(pl)?.[1] ?? null
  );
}

/**
 * Fallback trust when a posting's location can't be measured: it names the
 * scanned place (word-boundary city/ZIP token) and — when both strings name
 * US states — the states agree, so "Columbus, GA" never matches a
 * "Columbus, OH" chip even though both spell Columbus.
 */
export function placeFallbackAllowed(
  postLocation: string,
  placeQuery: string,
): boolean {
  const pl = postLocation.toLowerCase().replace(/\s+/g, " ").trim();
  const tokens = placeQuery
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
  if (!pl || tokens.length === 0) return false;
  // The longest token (city or ZIP) carries the identity; short tokens like
  // "oh" would false-match inside unrelated words.
  const place = tokens.reduce((a, b) => (b.length > a.length ? b : a));
  if (!new RegExp(`\\b${place}\\b`).test(pl)) return false;
  const postState = usStateInText(pl);
  if (!postState) return true; // posting names no state — nothing to conflict
  const chipState = usStateInText(placeQuery);
  if (!chipState) {
    // A stateless chip is only trustworthy when it's a ZIP (unambiguous);
    // a bare city name ("Columbus") can't confirm which state it meant.
    return /^\d{5}(-\d{4})?$/.test(placeQuery.trim());
  }
  return postState === chipState;
}

/** Inputs for one posting's radius decision (all resolved up-front). */
export interface RadiusDecisionInput {
  postLocation: string;
  /** Radius chips only — plain chips are handled by the caller (any-of). */
  chips: RadiusChip[];
  /** Chip place → resolved origin (null when the geocoder failed for it). */
  origins: Map<string, GeoPlace | null>;
  /** Normalized posting-location key → cached place (null when unmeasured). */
  places: Map<string, GeoPlace | null>;
}

/**
 * Decide whether one posting passes the radius chips — the accuracy core of
 * the local scan, pure so tests cover every branch:
 *   • measured: a candidate location resolves to cached coordinates inside
 *     the radius → pass; outside → fail (the map wins over the name).
 *   • unmeasured: posting never got coordinates and the radius is
 *     commute-sized (≤35mi) → trust the name via placeFallbackAllowed.
 *   • anywhere/remote postings have no auto-pass — a local scan keeps them
 *     only when they name the scanned place; add a Remote chip for those.
 *   • degraded (no chip origin resolved — geocoder down): fall back to name
 *     matching so the scan still returns results instead of nothing.
 */
export function passesRadiusChips(input: RadiusDecisionInput): boolean {
  const loc = input.postLocation;
  if (input.chips.length === 0) return false;
  const anyOrigin = input.chips.some(
    (c) => (input.origins.get(c.location) ?? null) !== null,
  );
  if (!anyOrigin) {
    // Geocoder down — degrade to name matching so the scan stays usable.
    return input.chips.some((c) => placeFallbackAllowed(loc, c.location));
  }
  const trimmed = loc.trim();
  const firstPart = trimmed.split(",")[0].trim();
  const candidates = [
    ...new Set([trimmed, firstPart].filter((s) => s.length >= 2)),
  ];
  for (const chip of input.chips) {
    const origin = input.origins.get(chip.location) ?? null;
    if (!origin) continue; // this chip couldn't be geocoded — no distance check
    const radius = chip.radiusMiles ?? 0;
    let measured = false;
    for (const candidate of candidates) {
      const place = input.places.get(normalizeGeoKey(candidate));
      if (!place) continue;
      measured = true;
      if (
        haversineMiles(origin.lat, origin.lon, place.lat, place.lon) <=
        radius
      ) {
        return true;
      }
    }
    if (
      !measured &&
      radius <= RADIUS_FALLBACK_MAX_MILES &&
      placeFallbackAllowed(loc, chip.location)
    ) {
      return true;
    }
  }
  return false;
}
