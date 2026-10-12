/**
 * Pure parsers for key-free job-board feeds (We Work Remotely's RSS, The
 * Muse's public JSON, and Greenhouse board JSON). Dependency-free apart from
 * htmlToText so vitest covers them without network access — the network
 * wiring lives in src/convex/jobSearch.ts.
 *
 * WWR's feed puts company and role in one title ("BlueGeko: IT Infrastructure
 * Engineer") and the geography in <region>/<country>/<state> tags, e.g.
 * region "USA Only", or region "Anywhere in the World" with a <state> where
 * the employer is based.
 */
import { htmlToText } from "./aiParse";

export interface ParsedFeedListing {
  externalId: string;
  title: string;
  company: string;
  description: string;
  url: string;
  location: string;
  postedAt?: number;
  tags: string[];
}

/** Decode the entities XML escapes in text nodes (order matters for "&"). */
export function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function tagValue(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!m) return "";
  let text = decodeXmlEntities(m[1]).trim();
  // Some items wrap values in CDATA — strip the wrapper.
  if (text.startsWith("<![CDATA[") && text.endsWith("]]>")) {
    text = text.slice(9, -3).trim();
  }
  return text;
}

function parseRfc822Date(text: string): number | undefined {
  if (!text) return undefined;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : undefined;
}

export function parseWeWorkRemotelyRss(xml: string): ParsedFeedListing[] {
  const out: ParsedFeedListing[] = [];
  for (const item of xml.split(/<item[\s>]/).slice(1)) {
    const block = item.split("</item>")[0];
    const rawTitle = tagValue(block, "title");
    const link = tagValue(block, "link");
    if (!rawTitle || !link) continue;
    // "Company: Role" — split on the first ": " separator.
    const sep = rawTitle.indexOf(": ");
    const company = sep > 0 ? rawTitle.slice(0, sep).trim() : "";
    const title = (sep > 0 ? rawTitle.slice(sep + 2) : rawTitle).trim();
    if (!title) continue;
    const region = tagValue(block, "region");
    const country = tagValue(block, "country");
    const state = tagValue(block, "state");
    const category = tagValue(block, "category");
    const type = tagValue(block, "type");
    const where = [country, state].filter(Boolean).join(", ");
    out.push({
      externalId: link,
      title,
      company,
      description: htmlToText(tagValue(block, "description")).slice(0, 4000),
      url: link,
      location: where || region || "Remote",
      postedAt: parseRfc822Date(tagValue(block, "pubDate")),
      tags: [category, type].filter(Boolean),
    });
  }
  return out;
}

/**
 * The Muse's public JSON (key-free) — rows under `results` with locations
 * under a `locations` array. Kept here so the fetch layer stays thin and the
 * shape-parsing edge cases are testable without network.
 */
export interface MuseListing {
  externalId: string;
  title: string;
  company: string;
  description: string;
  url: string;
  location: string;
  postedAt?: number;
  tags: string[];
}

export function parseMuseJobs(payload: unknown): MuseListing[] {
  const results =
    payload instanceof Object && Array.isArray((payload as { results?: unknown[] }).results)
      ? ((payload as { results: unknown[] }).results as unknown[])
      : [];
  return results.flatMap((entry) => {
    const j = (entry ?? {}) as Record<string, unknown>;
    const title = typeof j.name === "string" ? j.name.trim() : "";
    const refs = (j.refs ?? null) instanceof Object
      ? ((j.refs as Record<string, unknown>) ?? {})
      : {};
    const url = typeof refs.landing_page === "string" ? refs.landing_page : "";
    if (!title || !url) return [];
    const locations = Array.isArray(j.locations)
      ? (j.locations as unknown[])
          .map((l) =>
            typeof (l as Record<string, unknown> | null)?.name === "string"
              ? ((l as Record<string, unknown>).name as string)
              : "",
          )
          .filter(Boolean)
      : [];
    const categories = Array.isArray(j.categories)
      ? (j.categories as unknown[])
          .map((c) =>
            typeof (c as Record<string, unknown> | null)?.name === "string"
              ? ((c as Record<string, unknown>).name as string)
              : "",
          )
          .filter(Boolean)
      : [];
    const company = (j.company ?? null) as Record<string, unknown> | null;
    return [
      {
        externalId:
          j.id === undefined || j.id === null ? url : String(j.id),
        title,
        company:
          typeof company?.name === "string" && company.name.trim()
            ? company.name.trim()
            : "Unknown company",
        description: htmlToText(
          typeof j.contents === "string" ? j.contents : "",
        ).slice(0, 4000),
        url,
        location: locations.join("; ") || "Unspecified",
        postedAt: parseRfc822Date(
          typeof j.publication_date === "string" ? j.publication_date : "",
        ),
        tags: categories,
      },
    ];
  });
}

/**
 * Greenhouse board JSON (key-free per employer, board token from the
 * careers URL). Rows carry title, location.name and company on the board
 * listing (content=true adds descriptions, but doubles the payload — the
 * list shape is enough for the radar's text-match scoring once the row's
 * real description is in the detail call).
 */
export function parseGreenhouseJobs(payload: unknown, board: string): MuseListing[] {
  const jobs = payload instanceof Object && Array.isArray((payload as { jobs?: unknown[] }).jobs)
    ? ((payload as { jobs: unknown[] }).jobs as unknown[])
    : [];
  return jobs.flatMap((entry) => {
    const j = (entry ?? {}) as Record<string, unknown>;
    const title = typeof j.title === "string" ? j.title.trim() : "";
    const url = typeof j.absolute_url === "string" ? j.absolute_url : "";
    if (!title || !url) return [];
    const company =
      typeof j.company_name === "string" && j.company_name.trim()
        ? j.company_name.trim()
        : board;
    const loc = (j.location ?? null) as Record<string, unknown> | null;
    return [
      {
        externalId:
          j.id === undefined || j.id === null ? url : String(j.id),
        title,
        company,
        description: "",
        url,
        location:
          typeof loc?.name === "string" && loc.name.trim()
            ? loc.name.trim()
            : "Unspecified",
        postedAt: parseRfc822Date(
          typeof j.updated_at === "string"
            ? j.updated_at
            : typeof j.first_published === "string"
              ? j.first_published
              : "",
        ),
        tags: ["greenhouse"],
      },
    ];
  });
}
