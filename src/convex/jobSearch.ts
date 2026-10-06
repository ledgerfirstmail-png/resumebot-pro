"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { htmlToText } from "../lib/aiParse";
import {
  buildWorkdaySearchText,
  LOCAL_EMPLOYERS,
  parsePostedOn,
  parseTacoBellListings,
  parseWincoDetail,
  parseWincoListings,
  stripBrandTerms,
  type LocalEmployer,
  type WincoListing,
} from "../lib/localEmployers";
import {
  locationTerms,
  matchProfileToPosting,
  matchesLocation,
  STOPWORDS,
  tokenize,
  type MatchProfile,
} from "../lib/matchScore";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Job Radar search (feature: "find employers that are hiring and score the
 * resume for a match"). Aggregates five key-free job boards plus the local
 * retail/food employer feeds — Workday career sites (Walmart, Home Depot,
 * Lowe's, Target, Chipotle, Dollar Tree), Taco Bell's WordPress/JSON-LD list,
 * and WinCo's iCims view — then filters to the query and locations and scores
 * every listing against the owner's profile with the pure deterministic
 * matcher — no AI credits spent on search. The hourly watch sweep reuses the
 * same pipeline and pushes new matches out by email and Telegram (see
 * notify.ts).
 */

const FETCH_TIMEOUT_MS = 10_000;
/** Postings persisted per search (the table self-prunes past 150 "new"). */
const MAX_POSTINGS = 40;
const MAX_DESCRIPTION_CHARS = 4_000;

interface RawPosting {
  source: string;
  externalId: string;
  title: string;
  company: string;
  description: string;
  url: string;
  location: string;
  postedAt?: number;
  tags: string[];
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Normalize board date fields (ISO string or unix seconds/ms) to ms. */
function parseDate(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === "string" && value) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return asNumber > 1e12 ? asNumber : asNumber * 1000;
    }
  }
  return undefined;
}

async function fetchJson(url: string, headers?: Record<string, string>) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "TailorlyJobRadar/1.0 (resume match scoring)",
      Accept: "application/json",
      ...headers,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as unknown;
}

/** POST JSON to a key-free employer API (Workday's list endpoint is POST). */
async function postJson(
  url: string,
  body: unknown,
  headers?: Record<string, string>,
) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": "TailorlyJobRadar/1.0 (resume match scoring)",
      Accept: "application/json",
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as unknown;
}

/** Fetch a server-rendered listing/detail page as text. */
async function fetchText(url: string, headers?: Record<string, string>) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "TailorlyJobRadar/1.0 (resume match scoring)",
      Accept: "text/html,application/xhtml+xml",
      ...headers,
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  const text = await res.text();
  return { text, setCookie };
}

/** Reduce a Set-Cookie header to the "a=b; c=d" request header. */
function cookieHeader(setCookie: string): string {
  return setCookie
    .split(/,(?=[^;,]+=)/)
    .map((pair) => pair.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

/** Remotive — remote jobs, supports server-side `search`. */
async function fetchRemotive(query: string): Promise<RawPosting[]> {
  const url = `https://remotive.com/api/remote-jobs?limit=60${
    query ? `&search=${encodeURIComponent(query)}` : ""
  }`;
  const data = (await fetchJson(url)) as { jobs?: unknown[] };
  return (data.jobs ?? []).flatMap((entry) => {
    const j = (entry ?? {}) as Record<string, unknown>;
    const url = str(j.url);
    const title = str(j.title);
    if (!title || !url) return [];
    return [
      {
        source: "remotive",
        externalId: str(j.id) || url,
        title,
        company: str(j.company_name) || "Unknown company",
        description: htmlToText(str(j.description)).slice(
          0,
          MAX_DESCRIPTION_CHARS,
        ),
        url,
        location: str(j.candidate_required_location) || "Remote",
        postedAt: parseDate(j.publication_date),
        tags: Array.isArray(j.tags)
          ? j.tags.filter((t): t is string => typeof t === "string")
          : [],
      },
    ];
  });
}

/** RemoteOK — public feed; requires a User-Agent, first row is a legal note. */
async function fetchRemoteOk(): Promise<RawPosting[]> {
  const data = await fetchJson("https://remoteok.com/api");
  if (!Array.isArray(data)) return [];
  return data.flatMap((entry) => {
    const j = (entry ?? {}) as Record<string, unknown>;
    const title = str(j.position);
    const id = str(j.id) || str(j.slug);
    if (!title || !id) return []; // also skips the legal notice row
    return [
      {
        source: "remoteok",
        externalId: id,
        title,
        company: str(j.company) || "Unknown company",
        description: htmlToText(str(j.description)).slice(
          0,
          MAX_DESCRIPTION_CHARS,
        ),
        url:
          str(j.apply_url) ||
          str(j.url) ||
          `https://remoteok.com/remote-jobs/${id}`,
        location: str(j.location) || "Remote",
        postedAt: parseDate(j.date),
        tags: Array.isArray(j.tags)
          ? j.tags.filter((t): t is string => typeof t === "string")
          : [],
      },
    ];
  });
}

/**
 * The Muse — US-heavy local hiring (on-site city/state duty locations like
 * "Dearborn, MI"), key-free. This is what makes the radar list businesses by
 * city, state, or town instead of only remote-friendly regions.
 */
async function fetchTheMuse(): Promise<RawPosting[]> {
  const data = (await fetchJson(
    "https://www.themuse.com/api/public/jobs?page=1",
  )) as { results?: unknown[] };
  return (data.results ?? []).flatMap((entry) => {
    const j = (entry ?? {}) as Record<string, unknown>;
    const title = str(j.name);
    const url = str(
      (j.refs ?? null) instanceof Object
        ? ((j.refs as Record<string, unknown>) ?? {}).landing_page
        : undefined,
    );
    const id = j.id === undefined || j.id === null ? "" : String(j.id);
    if (!title || !url) return [];
    const locations = Array.isArray(j.locations)
      ? (j.locations as unknown[])
          .map((l) => str((l as Record<string, unknown> | null)?.name))
          .filter(Boolean)
      : [];
    const categories = Array.isArray(j.categories)
      ? (j.categories as unknown[])
          .map((c) => str((c as Record<string, unknown> | null)?.name))
          .filter(Boolean)
      : [];
    const company = (j.company ?? null) as Record<string, unknown> | null;
    return [
      {
        source: "muse",
        externalId: id || url,
        title,
        company: str(company?.name) || "Unknown company",
        description: htmlToText(str(j.contents)).slice(
          0,
          MAX_DESCRIPTION_CHARS,
        ),
        url,
        location: locations.join(", ") || "Unspecified",
        postedAt: parseDate(j.publication_date),
        tags: categories,
      },
    ];
  });
}

/** Jobicy — remote feed with country-level geo ("USA", "Worldwide", …). */
async function fetchJobicy(): Promise<RawPosting[]> {
  const data = (await fetchJson(
    "https://jobicy.com/api/v2/remote-jobs?count=40",
  )) as { jobs?: unknown[]; success?: boolean };
  if (data.success === false) return [];
  return (data.jobs ?? []).flatMap((entry) => {
    const j = (entry ?? {}) as Record<string, unknown>;
    const title = str(j.jobTitle);
    const url = str(j.url);
    const id = j.id === undefined || j.id === null ? "" : String(j.id);
    if (!title || !url) return [];
    const jobType = str(j.jobType);
    return [
      {
        source: "jobicy",
        externalId: id || url,
        title,
        company:
          str(j.companyName) || str(j.company) || "Unknown company",
        description: htmlToText(str(j.jobDescription)).slice(
          0,
          MAX_DESCRIPTION_CHARS,
        ),
        url,
        location: str(j.jobGeo) || "Remote",
        postedAt: parseDate(j.pubDate),
        tags: jobType ? [jobType] : [],
      },
    ];
  });
}

/** Arbeitnow — general job board feed, filtered locally by query. */
async function fetchArbeitnow(): Promise<RawPosting[]> {
  const data = (await fetchJson(
    "https://www.arbeitnow.com/api/job-board-api?page=1",
  )) as { data?: unknown[] };
  return (data.data ?? []).flatMap((entry) => {
    const j = (entry ?? {}) as Record<string, unknown>;
    const title = str(j.title);
    const slug = str(j.slug);
    const directUrl = str(j.url);
    if (!title || (!slug && !directUrl)) return [];
    return [
      {
        source: "arbeitnow",
        externalId: slug || directUrl,
        title,
        company: str(j.company_name) || "Unknown company",
        description: htmlToText(str(j.description)).slice(
          0,
          MAX_DESCRIPTION_CHARS,
        ),
        url:
          directUrl || `https://www.arbeitnow.com/jobs/${slug.replace(/_/g, "-")}`,
        location: j.remote === true ? "Remote" : str(j.location) || "Unspecified",
        postedAt: parseDate(j.posted_at ?? j.created_at),
        tags: Array.isArray(j.tags)
          ? j.tags.filter((t): t is string => typeof t === "string")
          : [],
      },
    ];
  });
}

/**
 * One Workday-hosted employer (Walmart, Home Depot, Lowe's, Target, Chipotle,
 * Dollar Tree): list call → detail the top rows for the real location,
 * description, and start date. `searchText` is location-first so a city-scoped
 * scan lands on that employer's local stores.
 */
async function fetchWorkdayEmployer(
  emp: LocalEmployer,
  searchText: string,
): Promise<RawPosting[]> {
  const wd = emp.workday;
  if (!wd) return [];
  const base = `https://${wd.host}/wday/cxs/${wd.company}/${wd.site}`;
  const data = (await postJson(`${base}/jobs`, {
    appliedFacets: {},
    limit: 5,
    offset: 0,
    searchText,
  })) as { jobPostings?: unknown[] };
  const rows = (data.jobPostings ?? []).flatMap((entry) => {
    const j = (entry ?? {}) as Record<string, unknown>;
    const title = str(j.title);
    const path = str(j.externalPath);
    if (!title || !path) return [];
    return [
      {
        title,
        path,
        locationsText: str(j.locationsText),
        postedOn: str(j.postedOn),
      },
    ];
  });
  if (rows.length === 0) return [];

  // The list view has no description and often only a vague location
  // ("2 Locations") — the detail call carries the real data.
  const details = await Promise.allSettled(
    rows.map((row) => {
      const slug = row.path.split("/").filter(Boolean).pop() ?? "";
      return fetchJson(`${base}/job/${encodeURIComponent(slug)}`);
    }),
  );

  return rows.map((row, i) => {
    const settled = details[i];
    const info =
      settled.status === "fulfilled"
        ? ((settled.value as { jobPostingInfo?: Record<string, unknown> })
            ?.jobPostingInfo ?? undefined)
        : undefined;
    const description = info ? htmlToText(str(info.jobDescription)) : "";
    const startDate = info ? str(info.startDate) : "";
    return {
      source: "workday",
      externalId: row.path,
      title: row.title,
      company: emp.name,
      description: description.slice(0, MAX_DESCRIPTION_CHARS),
      url: `https://${wd.host}${row.path}`,
      location:
        str(info?.location) || row.locationsText || "Unspecified",
      postedAt:
        (startDate ? parseDate(startDate) : undefined) ??
        parsePostedOn(row.postedOn),
      tags: [emp.name],
    };
  });
}

/**
 * Taco Bell — WordPress site with a server-rendered JSON-LD ItemList of the
 * 25 newest openings (job slugs carry title + city + state). No server-side
 * search or pagination: the boards' full-text search and the local
 * query/location filters narrow it from there.
 */
async function fetchTacoBell(): Promise<RawPosting[]> {
  const { text } = await fetchText("https://jobs.tacobell.com/jobs");
  return parseTacoBellListings(text).slice(0, 15).map((job) => ({
    source: "tacobell",
    externalId: job.externalId,
    title: job.title,
    company: "Taco Bell",
    description: "",
    url: job.url,
    location: job.location,
    tags: ["Taco Bell"],
  }));
}

/**
 * WinCo Foods — iCims careers search rendered server-side (cookie-gated):
 * list rows carry title + snippet, detail pages carry the actual location and
 * posted date, so the top rows are detailed before local filtering.
 */
async function fetchWinco(query: string): Promise<RawPosting[]> {
  const base = "https://careers-winco.icims.com/jobs/search";
  const seed = await fetchText(`${base}?in_iframe=1`);
  const cookie = cookieHeader(seed.setCookie);
  const keyword = stripBrandTerms(query);
  const url = `${base}?${
    keyword ? `searchKeyword=${encodeURIComponent(keyword)}&` : ""
  }in_iframe=1`;
  const { text } = await fetchText(url, cookie ? { Cookie: cookie } : {});
  const rows = parseWincoListings(text).slice(0, 6);
  if (rows.length === 0) return [];

  const details = await Promise.allSettled(
    rows.map((row) => fetchText(row.url, cookie ? { Cookie: cookie } : {})),
  );

  return rows.map((row: WincoListing, i) => {
    const info =
      details[i].status === "fulfilled"
        ? parseWincoDetail(details[i].value.text)
        : {};
    return {
      source: "winco",
      externalId: row.externalId,
      title: row.title,
      company: "WinCo Foods",
      description: (info.description || row.description).slice(
        0,
        MAX_DESCRIPTION_CHARS,
      ),
      url: row.url,
      location: info.location || "Unspecified",
      postedAt: info.postedAt,
      tags: ["WinCo Foods"],
    };
  });
}

/** Fetch every board independently — one outage must not kill the search. */
async function gatherPostings(
  query: string,
  location?: string,
): Promise<{ postings: RawPosting[]; errors: string[] }> {
  const locTerms = locationTerms(location);
  const wdSearchText = buildWorkdaySearchText(query, locTerms);
  const workdayEmployers = LOCAL_EMPLOYERS.filter((e) => e.workday);

  const tasks: Array<{ name: string; run: () => Promise<RawPosting[]> }> = [
    { name: "remotive", run: () => fetchRemotive(query) },
    { name: "remoteok", run: () => fetchRemoteOk() },
    { name: "arbeitnow", run: () => fetchArbeitnow() },
    { name: "muse", run: () => fetchTheMuse() },
    { name: "jobicy", run: () => fetchJobicy() },
    ...workdayEmployers.map((emp) => ({
      name: emp.name.toLowerCase().replace(/[^a-z]/g, ""),
      run: () => fetchWorkdayEmployer(emp, wdSearchText),
    })),
    { name: "tacobell", run: () => fetchTacoBell() },
    { name: "winco", run: () => fetchWinco(query) },
  ];

  const settled = await Promise.allSettled(tasks.map((t) => t.run()));
  const errors: string[] = [];
  const raw: RawPosting[] = [];
  settled.forEach((result, i) => {
    if (result.status === "fulfilled") raw.push(...result.value);
    else
      errors.push(
        `${tasks[i].name}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
      );
  });

  // Dedupe by board id and by title+company across boards.
  const seenIds = new Set<string>();
  const seenRole = new Set<string>();
  let postings = raw.filter((p) => {
    const idKey = `${p.source}|${p.externalId}`;
    const roleKey = `${p.title.toLowerCase()}|${p.company.toLowerCase()}`;
    if (seenIds.has(idKey) || seenRole.has(roleKey)) return false;
    seenIds.add(idKey);
    seenRole.add(roleKey);
    return p.title.length > 1 && p.company.length > 1;
  });

  // Keep listings matching a meaningful share of the query's terms.
  const qTokens = tokenize(query).filter((t) => !STOPWORDS.has(t));
  if (qTokens.length > 0) {
    const needed = Math.max(1, Math.ceil(qTokens.length * 0.6));
    postings = postings.filter((p) => {
      const hay = `${p.title} ${p.company} ${p.tags.join(" ")} ${p.description}`.toLowerCase();
      const hits = qTokens.filter((t) => hay.includes(t)).length;
      return hits >= needed;
    });
  }

  // Locations: the user may pick several at once — a listing passes when it
  // is open to the whole world or mentions ANY requested term.
  if (locTerms.length > 0) {
    postings = postings.filter((p) => matchesLocation(p.location, locTerms));
  }

  return { postings, errors };
}

type PostingItem = {
  source: string;
  externalId: string;
  title: string;
  company: string;
  description: string;
  url: string;
  location: string;
  postedAt?: number;
  score: number;
  matchedKeywords: string[];
  missingKeywords: string[];
};

type UpsertResult = {
  inserted: number;
  updated: number;
  fresh: Array<{
    jobId: Id<"jobMatches">;
    title: string;
    company: string;
    url: string;
    score: number;
  }>;
};

export interface SearchJobsResult {
  total: number;
  fresh: number;
  searched: number;
  errors: string[];
}

/**
 * Search live job boards and store the results scored against the caller's
 * profile (feature 1). Returns counts + any board errors; the client reads
 * the persisted rows back through the reactive jobs.listMatches query.
 */
export const searchJobs = action({
  args: {
    query: v.string(),
    location: v.optional(v.string()),
  },
  handler: async (
    ctx,
    { query, location },
  ): Promise<SearchJobsResult> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("You're signed out — sign in to continue.");
    }
    const profileData = await ctx.runQuery(internal.jobs.profileForMatch, {
      userId,
    });
    if (!profileData) {
      throw new Error(
        "Build your master profile first — the radar scores every opening against it.",
      );
    }

    const { postings, errors } = await gatherPostings(query, location);

    const scored: PostingItem[] = postings
      .map((p) => {
        const match = matchProfileToPosting(profileData.profile, {
          title: p.title,
          description: p.description,
        });
        return {
          source: p.source,
          externalId: p.externalId,
          title: p.title,
          company: p.company,
          description: p.description,
          url: p.url,
          location: p.location,
          postedAt: p.postedAt,
          score: match.score,
          matchedKeywords: match.matchedKeywords,
          missingKeywords: match.missingKeywords,
        };
      })
      .sort(
        (a, b) =>
          b.score - a.score || (b.postedAt ?? 0) - (a.postedAt ?? 0),
      )
      .slice(0, MAX_POSTINGS);

    const saved: UpsertResult = await ctx.runMutation(internal.jobs.upsertMatches, {
      userId,
      items: scored,
    });

    return {
      total: saved.inserted + saved.updated,
      fresh: saved.inserted,
      searched: postings.length,
      errors,
    };
  },
});

/** Run one watch immediately (client "Run now") — owner-checked. */
export const runWatchNow = action({
  args: { watchId: v.id("jobWatches") },
  handler: async (ctx, { watchId }): Promise<string> => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      throw new Error("You're signed out — sign in to continue.");
    }
    const watch = await ctx.runQuery(internal.jobs.getWatch, {
      watchId,
      userId,
    });
    if (!watch) throw new Error("Watch not found.");
    const status = await sweepWatch(ctx, watch);
    await ctx.runMutation(internal.jobs.recordWatchRun, {
      watchId: watch._id,
      lastRunAt: Date.now(),
      lastStatus: status.slice(0, 240),
    });
    return status;
  },
});

/**
 * Cron entry point: sweep every watch that hasn't run in the last 50 minutes.
 * Runs unauthenticated on a schedule, so it processes all due watches; the
 * client-facing path goes through runWatchNow with an owner check instead.
 */
export const sweepDueWatches = internalAction({
  args: {},
  handler: async (ctx): Promise<{ swept: number }> => {
    const due = await ctx.runQuery(internal.jobs.dueWatches, {});
    let swept = 0;
    for (const watch of due) {
      let status: string;
      try {
        status = await sweepWatch(ctx, watch);
      } catch (err) {
        status = `Failed: ${err instanceof Error ? err.message : String(err)}`;
      }
      await ctx.runMutation(internal.jobs.recordWatchRun, {
        watchId: watch._id,
        lastRunAt: Date.now(),
        lastStatus: status.slice(0, 240),
      });
      swept += 1;
    }
    return { swept };
  },
});

/** One watch: search → score → persist new matches → alert on fresh hits. */
async function sweepWatch(
  ctx: ActionCtx,
  watch: Doc<"jobWatches">,
): Promise<string> {
  const profileData = await ctx.runQuery(internal.jobs.profileForMatch, {
    userId: watch.userId,
  });
  if (!profileData) return "Skipped: no resume profile on this account yet.";

  const { postings, errors } = await gatherPostings(
    watch.query,
    watch.location,
  );
  const qualified = postings
    .map((p) => {
      const match = matchProfileToPosting(profileData.profile as MatchProfile, {
        title: p.title,
        description: p.description,
      });
      return { p, match };
    })
    .filter(({ match }) => match.score >= watch.minScore)
    .sort((a, b) => b.match.score - a.match.score)
    .slice(0, 30)
    .map(({ p, match }) => ({
      source: p.source,
      externalId: p.externalId,
      title: p.title,
      company: p.company,
      description: p.description,
      url: p.url,
      location: p.location,
      postedAt: p.postedAt,
      score: match.score,
      matchedKeywords: match.matchedKeywords,
      missingKeywords: match.missingKeywords,
    }));

  const saved: UpsertResult = await ctx.runMutation(internal.jobs.upsertMatches, {
    userId: watch.userId,
    items: qualified,
  });

  const freshTop = saved.fresh
    .filter((f) => f.score >= watch.minScore)
    .slice(0, 5);
  if (freshTop.length === 0) {
    return errors.length > 0
      ? `Checked — no new matches ≥ ${watch.minScore}% (boards unreachable: ${errors.length})`
      : `Checked — no new matches ≥ ${watch.minScore}%`;
  }

  const alert = await ctx.runAction(internal.notify.sendWatchAlert, {
    emailEnabled: watch.emailEnabled,
    email: watch.email,
    telegramEnabled: watch.telegramEnabled,
    telegramChatId: watch.telegramChatId,
    subject: `${freshTop.length} new job match${freshTop.length === 1 ? "" : "es"} for "${watch.query}" on Tailorly`,
    jobs: freshTop.map((f) => ({
      title: f.title,
      company: f.company,
      url: f.url,
      score: f.score,
    })),
  });

  const parts = [`${freshTop.length} new match${freshTop.length === 1 ? "" : "es"}`];
  if (watch.emailEnabled) parts.push(`email: ${alert.email}`);
  if (watch.telegramEnabled) parts.push(`telegram: ${alert.telegram}`);
  return parts.join(" · ");
}
