/**
 * Deterministic resume↔posting match score (feature: "find employers that are
 * hiring and score the resume for a match"). Pure and dependency-free so it
 * can rank dozens of listings per search without spending AI credits — the AI
 * tailoring pass remains the deep 0–100 fit score.
 *
 * Weighted model (total 0–100):
 *   45  term coverage  — of the posting's most important terms, how many the
 *                        profile already speaks to (title + top description terms)
 *   35  skills signal  — how many of the profile's listed skills the posting
 *                        explicitly mentions (full marks at 5 hits)
 *   20  title fit      — token overlap between the posting title and the
 *                        profile's own headline/recent titles
 */

/** The slice of a resume profile the scorer needs (ResumeProfileData fits). */
export interface MatchProfile {
  title: string;
  skills: string[];
  summary: string;
  experience: Array<{ title: string; bullets: string[] }>;
}

export interface MatchPosting {
  title: string;
  description: string;
}

export interface MatchResult {
  /** 0–100 match of this profile against the posting. */
  score: number;
  /** Posting terms the profile already covers (highest-value first). */
  matchedKeywords: string[];
  /** Posting terms the profile does NOT cover — feed these to tailoring. */
  missingKeywords: string[];
}

/** Generic job-posting filler that carries no matching signal. */
export const STOPWORDS = new Set([
  "the", "and", "for", "with", "you", "your", "are", "our", "will", "this",
  "that", "have", "has", "who", "what", "when", "where", "how", "all", "any",
  "can", "must", "plus", "from", "into", "about", "more", "than", "then",
  "them", "they", "their", "there", "here", "been", "being", "were", "was",
  "not", "but", "also", "its", "an", "of", "on", "in", "to", "at", "by",
  "or", "as", "is", "we", "us", "if", "per", "via", "do", "did", "does",
  "job", "role", "team", "work", "working", "works", "office", "remote",
  "hybrid", "full", "part", "time", "type", "level", "mid", "senior",
  "junior", "lead", "staff", "principal", "candidate", "applicant", "apply",
  "ability", "strong", "great", "ideal", "looking", "join", "help", "get",
  "set", "like", "need", "needs", "want", "would", "could", "should",
  "new", "one", "two", "well", "across", "among", "within", "without",
  "under", "over", "between", "including", "include", "includes", "etc",
  "please", "today", "whoever", "everyone", "someone", "people", "person",
  "equal", "opportunity", "benefits", "salary", "compensation", "range",
  "offer", "offers", "hiring", "company", "business", "market", "year",
  "years", "month", "months", "day", "days", "week", "weeks",

  // German function words: auto-scanned EU boards (e.g. Arbeitnow) return
  // German postings, and English-only stopwords let filler like "und"/"die"
  // flood the top-26 terms — depressing coverage scores and polluting the
  // gap chips. Umlaut-free forms only: tokenize() splits on non-ASCII, so
  // "über" never survives as one token anyway. Ambiguous-with-English words
  // (an, am, war, da, um, man, was) are deliberately left out.
  "und", "oder", "aber", "denn", "weil", "dass", "wenn", "als", "wie",
  "nicht", "kein", "keine", "keinen", "sich", "wir", "du", "ich", "mir",
  "mich", "dich", "dir", "uns", "diese", "dieser", "dieses", "diesen",
  "dem", "den", "der", "die", "das", "ein", "eine", "einen", "einem",
  "einer", "eines", "ist", "sind", "waren", "wird", "werden", "wurde",
  "worden", "hat", "haben", "hatte", "hatten", "sein", "seine", "seinen",
  "seiner", "bei", "aus", "auf", "im", "vor", "nach", "zwischen", "mit",
  "von", "zu", "zum", "zur", "des", "doch", "dann", "dort", "hier",
  "sehr", "mehr", "schon", "noch", "nur", "auch", "seit", "vom", "beim",
  "sowie", "dabei", "davon", "dazu", "bereits",

  // Markup/entity residue ("you'll" → "ll", "&amp;" → "amp") that can
  // survive text cleanup in board feeds — noise, never fit signal.
  "ll", "re", "ve", "amp", "nbsp", "quot", "apos", "lt", "gt",
]);

/**
 * Split free text into normalized matching terms: lowercase, tech tokens
 * preserved ("c++", "c#", "node.js"), leading/trailing dots/dashes trimmed.
 */
export function tokenize(text: string): string[] {
  const raw = text.toLowerCase().split(/[^a-z0-9+#.]+/g);
  const out: string[] = [];
  for (let token of raw) {
    token = token.replace(/^[.-]+/, "").replace(/[.-]+$/, "");
    if (token.length < 2) continue;
    if (!/[a-z0-9]/.test(token)) continue;
    out.push(token);
  }
  return out;
}

/** Padded phrase containment — " go " must not match inside "algorithms". */
function mentions(haystack: string, phrase: string): boolean {
  const pad = (s: string) => ` ${s.replace(/\s+/g, " ").trim()} `;
  return pad(haystack.toLowerCase()).includes(pad(phrase.toLowerCase()));
}

/** Top `count` non-stopword terms by frequency, first occurrence breaking ties. */
function topTerms(tokens: string[], count: number): string[] {
  const freq = new Map<string, number>();
  const order = new Map<string, number>();
  tokens.forEach((t, i) => {
    if (STOPWORDS.has(t)) return;
    if (!freq.has(t)) order.set(t, i);
    freq.set(t, (freq.get(t) ?? 0) + 1);
  });
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || (order.get(a[0]) ?? 0) - (order.get(b[0]) ?? 0))
    .slice(0, count)
    .map(([t]) => t);
}

function dedupe(tokens: string[]): string[] {
  return [...new Set(tokens)];
}

/**
 * Score one profile against one posting. Never throws; empty inputs score 0.
 */
export function matchProfileToPosting(
  profile: MatchProfile,
  posting: MatchPosting,
): MatchResult {
  const postingText = `${posting.title} ${posting.description}`;
  const titleTokens = tokenize(posting.title).filter((t) => !STOPWORDS.has(t));
  const allPostingTokens = tokenize(postingText);
  const descTerms = topTerms(allPostingTokens, 26);

  const freq = new Map<string, number>();
  for (const t of allPostingTokens) freq.set(t, (freq.get(t) ?? 0) + 1);

  // The posting's identity: its title terms + most important description terms.
  const postingTerms = dedupe([...titleTokens, ...descTerms]);

  // Everything the profile can speak to: headline, skills, summary, bullets.
  const profileParts: string[] = [profile.title, profile.summary];
  for (const skill of profile.skills) profileParts.push(skill);
  for (const role of profile.experience) {
    profileParts.push(role.title);
    profileParts.push(...role.bullets);
  }
  const profileTokens = new Set(
    profileParts.flatMap((p) => tokenize(p)).filter((t) => !STOPWORDS.has(t)),
  );

  const matchedKeywords = postingTerms.filter((t) => profileTokens.has(t));
  const missingKeywords = postingTerms.filter((t) => !profileTokens.has(t));

  // 45 — how much of the posting's important vocabulary the profile covers.
  // Real postings always carry terms no resume will (payroll, PTO, filler),
  // so coverage is dampened before scaling — a strong fit shouldn't be
  // punished for the JD's boilerplate.
  const termCoverage =
    postingTerms.length > 0 ? matchedKeywords.length / postingTerms.length : 0;
  const termScore = Math.round(45 * Math.min(1, termCoverage * 1.35));

  // 35 — how many of the candidate's own skills this posting explicitly wants.
  const skillHits = profile.skills.slice(0, 15).filter((s) =>
    mentions(postingText, s),
  ).length;
  const skillScore = Math.round(35 * Math.min(1, skillHits / 5));

  // 20 — headline overlap with the posting's own title.
  const postingTitleTerms = dedupe(
    tokenize(posting.title).filter((t) => !STOPWORDS.has(t)),
  );
  const profileTitleTerms = dedupe(
    [
      ...tokenize(profile.title),
      ...profile.experience.slice(0, 3).flatMap((r) => tokenize(r.title)),
    ].filter((t) => !STOPWORDS.has(t)),
  );
  const overlap = postingTitleTerms.filter((t) =>
    profileTitleTerms.includes(t),
  ).length;
  const titleDenom = Math.min(postingTitleTerms.length, profileTitleTerms.length);
  const titleScore =
    titleDenom > 0 ? Math.round(20 * (overlap / titleDenom)) : 0;

  const score = Math.max(
    0,
    Math.min(100, termScore + skillScore + titleScore),
  );

  return {
    score,
    matchedKeywords: matchedKeywords
      .sort((a, b) => (freq.get(b) ?? 0) - (freq.get(a) ?? 0))
      .slice(0, 10),
    missingKeywords: missingKeywords
      .sort((a, b) => (freq.get(b) ?? 0) - (freq.get(a) ?? 0))
      .slice(0, 12),
  };
}

/**
 * Location filtering (radar "Add locations"): a search may carry several
 * locations at once ("Remote, Berlin"), so the stored comma/semicolon string
 * is split into normalized terms the boards are matched against.
 */
export function locationTerms(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const terms = new Set<string>();
  for (const part of raw.split(/[,;|]/)) {
    const term = part.trim().toLowerCase().replace(/\s+/g, " ");
    if (term.length >= 2) terms.add(term);
  }
  return [...terms];
}

/** Listings open to the whole world pass any location filter. */
const ANYWHERE_RE = /\bremote\b|worldwide|anywhere|global|\bintl\b/;

/** US states (lowercase name → abbreviation), alphabetical; DC included. */
export const US_STATES: Record<string, string> = {
  alabama: "al",
  alaska: "ak",
  arizona: "az",
  arkansas: "ar",
  california: "ca",
  colorado: "co",
  connecticut: "ct",
  delaware: "de",
  "district of columbia": "dc",
  florida: "fl",
  georgia: "ga",
  hawaii: "hi",
  idaho: "id",
  illinois: "il",
  indiana: "in",
  iowa: "ia",
  kansas: "ks",
  kentucky: "ky",
  louisiana: "la",
  maine: "me",
  maryland: "md",
  massachusetts: "ma",
  michigan: "mi",
  minnesota: "mn",
  mississippi: "ms",
  missouri: "mo",
  montana: "mt",
  nebraska: "ne",
  nevada: "nv",
  "new hampshire": "nh",
  "new jersey": "nj",
  "new mexico": "nm",
  "new york": "ny",
  "north carolina": "nc",
  "north dakota": "nd",
  ohio: "oh",
  oklahoma: "ok",
  oregon: "or",
  pennsylvania: "pa",
  "rhode island": "ri",
  "south carolina": "sc",
  "south dakota": "sd",
  tennessee: "tn",
  texas: "tx",
  utah: "ut",
  vermont: "vt",
  virginia: "va",
  washington: "wa",
  "west virginia": "wv",
  wisconsin: "wi",
  wyoming: "wy",
};

/** State names in alphabetical order (display-cased) — the "add a state" picker. */
export const US_STATE_NAMES = Object.keys(US_STATES).map((name) =>
  name
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
    .replace(/\bOf\b/g, "of"), // "District of Columbia", not "District Of Columbia"
);

const STATE_BY_ABBR = new Map(
  Object.entries(US_STATES).map(([name, abbr]) => [abbr, name]),
);
const US_ABBR_TOKENS = new Set(Object.values(US_STATES));

/** Terms that mean "anywhere in the United States". */
const USA_TERMS = new Set([
  "usa",
  "us",
  "u.s.",
  "u.s.a",
  "america",
  "united states",
  "united states of america",
]);

/** A posting locates a US place when it names a state or the country. */
function namesUsPlace(pl: string, tokens: string[]): boolean {
  if (/\busa\b|\bunited states\b|\bamerica\b/.test(pl)) return true;
  if (tokens.some((t) => US_ABBR_TOKENS.has(t))) return true;
  // Full state names without an abbreviation ("Austin, Texas",
  // "Portland, Oregon") — substring check so multi-word states like
  // "new hampshire" match regardless of tokenization.
  return Object.keys(US_STATES).some((name) => pl.includes(name));
}

/** Expand a location term with its US-state counterpart ("texas" ↔ "tx"). */
function stateAliases(term: string): string[] {
  const out = [term];
  const abbr = US_STATES[term];
  if (abbr) out.push(abbr);
  const full = STATE_BY_ABBR.get(term);
  if (full) out.push(full);
  return out;
}

/**
 * A posting passes a (possibly multi-term) location filter when it is
 * work-from-anywhere or names any requested place — any-of, so picking
 * several locations widens the scan instead of narrowing it.
 *
 * US-aware: state names and abbreviations are interchangeable ("Texas"
 * matches "Austin, TX"), short codes must match whole tokens ("ca" never
 * matches inside "Remote"), and a USA term matches any US place — so the
 * USA chip surfaces city/state listings like "Dearborn, MI".
 */
export function matchesLocation(
  postLocation: string,
  terms: string[],
): boolean {
  if (terms.length === 0) return true;
  const pl = postLocation.toLowerCase();
  if (ANYWHERE_RE.test(pl)) return true;
  const tokens = pl.split(/[^a-z0-9]+/).filter(Boolean);
  return terms.some((term) => {
    if (USA_TERMS.has(term)) return namesUsPlace(pl, tokens);
    return stateAliases(term).some((candidate) =>
      candidate.length >= 3
        ? pl.includes(candidate)
        : tokens.includes(candidate),
    );
  });
}
