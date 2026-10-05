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
