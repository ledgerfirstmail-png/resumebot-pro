/**
 * Local retail & food employers for the Job Radar (feature: "scan all local
 * listings in the area — Walmart, Home Depot, Taco Bell, WinCo …").
 *
 * Everything here is pure and dependency-free: the registry, the query↔brand
 * helpers the radar chips use, the Workday searchText builder, and the HTML/JSON
 * parsers for the two employers that expose listing pages instead of a JSON
 * API (Taco Bell's WordPress/JSON-LD feed, WinCo's iCims view). Network wiring
 * lives in `src/convex/jobSearch.ts`.
 */
import { US_STATES } from "./matchScore";
import { htmlToText } from "./aiParse";

/** US state abbreviations — used to strip the state suffix off job slugs. */
const STATE_ABBRS = new Set(Object.values(US_STATES));

export interface WorkdaySource {
  /** myworkdayjobs tenant host (verified live). */
  host: string;
  /** cxs company segment. */
  company: string;
  /** career-site path segment (cxs + UI path must match). */
  site: string;
}

export interface LocalEmployer {
  /** Display name — also the `company` on every posting we persist. */
  name: string;
  /** Query token the chip inserts/removes (lowercase, no punctuation). */
  token: string;
  /** Lowercase forms that identify this brand inside a free-text query. */
  aliases: string[];
  /** Present only when the employer exposes the key-free Workday CXS API. */
  workday?: WorkdaySource;
}

/**
 * Local employers the radar scans directly (Workday feeds verified live) or
 * offers as query chips (boards search these brands full-text). Order drives
 * the quick-pick row: user-requested chains first.
 */
export const LOCAL_EMPLOYERS: LocalEmployer[] = [
  {
    name: "Walmart",
    token: "walmart",
    aliases: ["walmart", "wal-mart", "wal mart"],
    workday: {
      host: "walmart.wd504.myworkdayjobs.com",
      company: "walmart",
      site: "WalmartExternal",
    },
  },
  {
    name: "Big Lots",
    token: "big lots",
    aliases: ["big lots", "biglots"],
  },
  {
    name: "Home Depot",
    token: "home depot",
    aliases: ["home depot", "homedepot"],
    workday: {
      host: "homedepot.wd5.myworkdayjobs.com",
      company: "homedepot",
      site: "CareerDepot",
    },
  },
  {
    name: "Lowe's",
    token: "lowes",
    aliases: ["lowe's", "lowes", "lows", "lowe"],
    workday: {
      host: "lowes.wd5.myworkdayjobs.com",
      company: "lowes",
      site: "LWS_External_CS",
    },
  },
  {
    name: "Taco Bell",
    token: "taco bell",
    aliases: ["taco bell", "tacobell"],
  },
  {
    name: "WinCo Foods",
    token: "winco",
    aliases: ["winco foods", "wincofoods", "winco"],
  },
  {
    name: "Starbucks",
    token: "starbucks",
    aliases: ["starbucks", "star bucks"],
  },
  {
    name: "Target",
    token: "target",
    aliases: ["target"],
    workday: {
      host: "target.wd5.myworkdayjobs.com",
      company: "target",
      site: "targetcareers",
    },
  },
  {
    name: "Chipotle",
    token: "chipotle",
    aliases: ["chipotle"],
    workday: {
      host: "chipotle.wd5.myworkdayjobs.com",
      company: "chipotle",
      site: "ChipotleCareers",
    },
  },
  {
    name: "Dollar Tree",
    token: "dollar tree",
    aliases: ["dollar tree", "dollartree"],
    workday: {
      host: "dollartree.wd5.myworkdayjobs.com",
      company: "dollartree",
      site: "dollartreeus",
    },
  },
  {
    name: "Meijer",
    token: "meijer",
    aliases: ["meijer"],
    workday: {
      host: "meijer.wd5.myworkdayjobs.com",
      company: "meijer",
      site: "Meijer",
    },
  },
];

/** Employer names in registry order — the radar's "Employers" chip row. */
export const EMPLOYER_CHIP_NAMES: string[] = LOCAL_EMPLOYERS.map((e) => e.name);

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Regex matching an alias only as whole words ("lows" never hits "allows"). */
function aliasPattern(alias: string): RegExp {
  return new RegExp(`\\b${escapeRegex(alias)}\\b`, "i");
}

/** Employers whose brand appears anywhere in the query. */
export function findEmployers(query: string): LocalEmployer[] {
  if (!query.trim()) return [];
  return LOCAL_EMPLOYERS.filter((emp) =>
    emp.aliases.some((alias) => aliasPattern(alias).test(query)),
  );
}

/** Is this employer's chip currently active in the query? */
export function isEmployerSelected(query: string, name: string): boolean {
  return findEmployers(query).some((emp) => emp.name === name);
}

function employerByName(name: string): LocalEmployer | undefined {
  return LOCAL_EMPLOYERS.find((emp) => emp.name === name);
}

/** Append the brand's query token (unless it's already there). */
export function addEmployerToQuery(query: string, name: string): string {
  const emp = employerByName(name);
  if (!emp) return query;
  if (isEmployerSelected(query, name)) return query;
  const base = query.trim();
  return base ? `${base} ${emp.token}` : emp.token;
}

/** Remove this brand's aliases from the query, keeping the user's own words. */
export function removeEmployerFromQuery(query: string, name: string): string {
  const emp = employerByName(name);
  if (!emp) return query;
  let out = query;
  // Longest aliases first so "home depot" is removed before any fragment.
  for (const alias of [...emp.aliases].sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(aliasPattern(alias).source, "gi"), " ");
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Strip every brand alias from a query — the employer APIs (Workday/iCims)
 * search their own jobs, so "walmart cashier" must become just "cashier"
 * ("taco bell" alone becomes "" → their newest local postings).
 */
export function stripBrandTerms(query: string): string {
  let out = query;
  const aliases = LOCAL_EMPLOYERS.flatMap((e) => e.aliases).sort(
    (a, b) => b.length - a.length,
  );
  for (const alias of aliases) {
    out = out.replace(new RegExp(aliasPattern(alias).source, "gi"), " ");
  }
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Workday searchText for one employer fetch: locations win (their search
 * matches location text — "austin texas" returns 59 Walmart jobs there), so a
 * city-scoped scan lands on local stores; otherwise the brand-stripped query;
 * "" returns the employer's newest postings.
 */
export function buildWorkdaySearchText(
  query: string,
  locationTerms: string[],
): string {
  if (locationTerms.length > 0) return locationTerms.join(" ").trim();
  return stripBrandTerms(query);
}

/**
 * Parse Workday's relative list dates ("Posted Today", "Posted 5 Days Ago",
 * "Posted 30+ Days Ago", "Posted 2 Weeks Ago", "Posted 3 Months Ago") to ms.
 * Unrecognized formats return undefined rather than guessing.
 */
export function parsePostedOn(text: string | null | undefined): number | undefined {
  const t = (text ?? "").toLowerCase();
  if (!t) return undefined;
  const now = Date.now();
  const DAY = 86_400_000;
  if (/\btoday\b|\bnow\b|\bjust\b/.test(t)) return now;
  if (/\btomorrow\b/.test(t)) return now;
  let m = t.match(/(\d+)\s*\+\s*days?/);
  if (m) return now - (Number(m[1]) + 1) * DAY;
  m = t.match(/(\d+)\s*days?/);
  if (m) return now - Number(m[1]) * DAY;
  m = t.match(/(\d+)\s*weeks?/);
  if (m) return now - Number(m[1]) * 7 * DAY;
  m = t.match(/(\d+)\s*months?/);
  if (m) return now - Number(m[1]) * 30 * DAY;
  m = t.match(/(\d+)\s*hours?/);
  if (m) return now - Number(m[1]) * 3_600_000;
  return undefined;
}

/** Title-case a slug: "the-dalles" → "The Dalles". */
function titleCaseSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export interface ParsedListing {
  externalId: string;
  title: string;
  location: string;
  url: string;
}

/**
 * Taco Bell's `/jobs` page embeds a JSON-LD ItemList of job URLs whose slugs
 * carry both fields: `/job/manager-in-training-or/the-dalles-or/955703939/`
 * → title "Manager In Training", location "The Dalles, OR".
 */
export function parseTacoBellListings(html: string): ParsedListing[] {
  // The same URLs appear JSON-escaped in some blocks — normalize first.
  const src = html.replace(/\\\//g, "/");
  const re =
    /https?:\/\/jobs\.tacobell\.com\/job\/([a-z0-9-]+)\/([a-z0-9-]+)\/(\d+)\/?/gi;
  const out: ParsedListing[] = [];
  const seen = new Set<string>();
  for (const m of src.matchAll(re)) {
    const [, titleSlug, placeSlug, id] = m;
    if (!titleSlug || !placeSlug || !id || seen.has(id)) continue;
    seen.add(id);

    // Trailing "-xx" on the title slug is the state code, not part of the role.
    let titleSlugClean = titleSlug;
    const stateMatch = titleSlug.match(/^(.*)-([a-z]{2})$/);
    let state = "";
    if (stateMatch && STATE_ABBRS.has(stateMatch[2])) {
      titleSlugClean = stateMatch[1];
      state = stateMatch[2].toUpperCase();
    }

    // Place slug: "the-dalles-or" → "The Dalles, OR".
    let place = placeSlug;
    const placeMatch = placeSlug.match(/^(.*)-([a-z]{2})$/);
    if (placeMatch && STATE_ABBRS.has(placeMatch[2])) {
      place = placeMatch[1];
      state = stateMatch ? state : placeMatch[2].toUpperCase();
    }
    const location = state
      ? `${titleCaseSlug(place)}, ${state}`
      : titleCaseSlug(place);

    out.push({
      externalId: id,
      title: titleCaseSlug(titleSlugClean),
      location,
      url: `https://jobs.tacobell.com/job/${titleSlug}/${placeSlug}/${id}/`,
    });
  }
  return out;
}

export interface WincoListing extends ParsedListing {
  /** Snippet from the list row — the detail fetch replaces it when it wins. */
  description: string;
}

const WC_ROW_RE =
  /<a href="(https:\/\/careers-winco\.icims\.com\/jobs\/(\d+)\/[a-z0-9-]+\/job\?in_iframe=1)"[^>]*>[\s\S]*?<h3[^>]*>\s*([^<]+?)\s*<\/h3>/gi;
const WC_DESC_RE = /col-xs-12 description">\s*([\s\S]{0,1200}?)\s*<\/div>/i;

/** Parse WinCo's server-rendered iCims list (cookies required server-side). */
export function parseWincoListings(html: string): WincoListing[] {
  const out: WincoListing[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(WC_ROW_RE)) {
    const [, url, id, title] = m;
    if (!url || !id || !title || seen.has(id)) continue;
    seen.add(id);
    const after = html.slice(m.index ?? 0, (m.index ?? 0) + m[0].length + 1400);
    const desc = after.match(WC_DESC_RE);
    out.push({
      externalId: id,
      title,
      location: "", // the list row carries no location — the detail page does
      url,
      description: desc ? htmlToText(desc[1]).slice(0, 1200) : "",
    });
  }
  return out;
}

export interface WincoDetail {
  location?: string;
  postedAt?: number;
  description?: string;
}

/** Pull location/posted date/description out of an iCims job detail page. */
export function parseWincoDetail(html: string): WincoDetail {
  const out: WincoDetail = {};
  const loc = html.match(/"location"\s*:\s*"([^"]{2,160})"/);
  if (loc) out.location = loc[1];
  const posted =
    html.match(/"Posted"\s*:\s*"([^"]+)"/) ||
    html.match(/"datePosted"\s*:\s*"([^"]+)"/);
  if (posted) {
    const ms = Date.parse(posted[1]);
    if (Number.isFinite(ms)) out.postedAt = ms;
  }
  const desc = html.match(/"description"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (desc) {
    try {
      const raw = JSON.parse(`"${desc[1]}"`) as string;
      const text = htmlToText(raw).trim();
      if (text) out.description = text.slice(0, 4000);
    } catch {
      // Malformed escape — fall back to no description rather than failing.
    }
  }
  return out;
}
