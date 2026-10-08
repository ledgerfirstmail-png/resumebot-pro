/**
 * Pure parsers for key-free job-board feeds (currently We Work Remotely's
 * RSS). Dependency-free apart from htmlToText so vitest covers them without
 * network access — the network wiring lives in src/convex/jobSearch.ts.
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
