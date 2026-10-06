/**
 * Pure helpers for the shareable read-only resume link (ROADMAP E11).
 *
 * Slugs are short, unguessable, lowercase, URL-safe strings. They live on the
 * `tailoredResumes` doc (`shareSlug`) and are resolved by the public
 * `resumes:getSharedResume` query — no account needed to view, no edit path.
 */

/** Crockford-ish alphabet without vowels-lookalikes (no 0/o, 1/l). */
const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

const DEFAULT_LENGTH = 10;

/**
 * A random share slug, e.g. "kx3mtr9wpq". Uses the Web Crypto RNG, which is
 * available in the browser, in Convex functions, and in the test runner.
 */
export function makeShareSlug(length: number = DEFAULT_LENGTH): string {
  const size = Math.max(1, Math.floor(length));
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const byte of bytes) {
    out += SLUG_ALPHABET[byte % SLUG_ALPHABET.length];
  }
  return out;
}

/** True for a slug we could have issued (lowercase alnum, 4–32 chars). */
export function isValidShareSlug(slug: string): boolean {
  return /^[a-z0-9]{4,32}$/.test(slug);
}

/** The absolute public URL for a slug, e.g. https://app/r/kx3mtr9wpq. */
export function shareUrl(origin: string, slug: string): string {
  return `${origin.replace(/\/+$/, "")}/r/${slug}`;
}
