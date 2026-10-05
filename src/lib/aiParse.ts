/**
 * Pure parsing/extraction helpers for the AI pipeline — no Convex or I/O
 * dependencies, so they can be unit tested directly (ROADMAP D1).
 * Used by src/convex/ai.ts.
 */

/** Tolerant JSON extraction — models sometimes wrap JSON in prose or fences. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to fence/prose extraction
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // fall through
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1));
  }
  throw new Error("AI returned an unparsable response");
}

/** Score coercion: finite numbers only, rounded and clamped to 0–100. */
export function clampScore(n: unknown, fallback: number): number {
  const value = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Maximum accepted job-posting URL length. */
export const MAX_URL_CHARS = 2_048;

/**
 * Basic SSRF guard: only public http(s) URLs. Not exhaustive (DNS rebinding
 * is out of scope for v1) but blocks the obvious localhost/private targets.
 */
export function assertPublicHttpUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim().slice(0, MAX_URL_CHARS);
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      "That doesn't look like a valid URL — paste the whole link, starting with https://",
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) job posting links can be imported.");
  }
  const host = parsed.hostname.toLowerCase();
  const isPrivate =
    host === "localhost" ||
    host === "[::1]" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^0\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (isPrivate) {
    throw new Error("Only public job posting pages can be imported.");
  }
  return parsed.toString();
}

/** Strip markup to readable text so the AI sees the posting, not the chrome. */
export function htmlToText(html: string): string {
  const withoutNoise = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const withBreaks = withoutNoise.replace(
    /<\s*(?:\/p|\/div|\/li|\/tr|\/h[1-6]|\/section|\/article|\/ul|\/ol|br)\b[^>]*>/gi,
    "\n",
  );
  const textOnly = withBreaks.replace(/<[^>]+>/g, " ");
  const decoded = textOnly
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_m, hex: string) => {
      const code = parseInt(hex, 16);
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
    })
    .replace(/&#(\d+);/g, (_m, dec: string) => {
      const code = Number(dec);
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : " ";
    })
    .replace(/&amp;/gi, "&"); // must run last so &amp;lt; survives one pass
  return decoded
    // Some boards entity-escape their HTML (&lt;div&gt;…): after decoding,
    // strip markup that only became visible now so tag soup never reaches
    // the matcher or the model.
    .replace(/<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?\/?>/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
