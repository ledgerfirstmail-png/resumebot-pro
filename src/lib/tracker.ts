/**
 * Applications tracker (pass 22): pure grouping/sorting for the pipeline
 * view. The Job Radar discovers listings; the tracker follows them through
 * new → tailored → applied → interview → rejected. Dependency-free so
 * vitest covers every branch — the page just maps Convex docs onto
 * TrackerItem and renders the output.
 */

export type TrackerStatus =
  | "new"
  | "tailored"
  | "applied"
  | "interview"
  | "rejected";

/** The order listings flow through the pipeline. */
export const TRACKER_STATUSES: TrackerStatus[] = [
  "new",
  "tailored",
  "applied",
  "interview",
  "rejected",
];

/** One pipeline row — the fields the tracker view needs, nothing more. */
export interface TrackerItem {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  /** Board match score 0–100 at search time. */
  score: number;
  status: TrackerStatus;
  /** AI-tailor score, when the resume was reworked for this posting. */
  tailoredScore?: number;
  /** When the listing was marked applied (manual or auto-apply). */
  appliedAt?: number;
  /** When the radar first surfaced the listing (doc creation time). */
  firstSeenAt: number;
}

/** Tabs newest-pipeline-first; discovery stages trail the owned pipeline. */
export const TRACKER_TABS: Array<{
  key: TrackerStatus | "all";
  label: string;
}> = [
  { key: "all", label: "All" },
  { key: "applied", label: "Applied" },
  { key: "interview", label: "Interview" },
  { key: "rejected", label: "Rejected" },
  { key: "tailored", label: "Tailored" },
  { key: "new", label: "New" },
];

/** When the row last *moved*: applications use their applied date. */
export function trackerActivityAt(item: TrackerItem): number {
  return item.appliedAt ?? item.firstSeenAt;
}

/**
 * Newest pipeline activity first, with stable tiebreaks (score, then title)
 * so re-renders never reshuffle rows arbitrarily.
 */
export function sortTrackerItems(items: TrackerItem[]): TrackerItem[] {
  return [...items].sort(
    (a, b) =>
      trackerActivityAt(b) - trackerActivityAt(a) ||
      b.score - a.score ||
      a.title.localeCompare(b.title),
  );
}

/** Rows for one tab — "all" passes everything through. */
export function filterTrackerItems(
  items: TrackerItem[],
  tab: TrackerStatus | "all",
): TrackerItem[] {
  return tab === "all"
    ? items
    : items.filter((item) => item.status === tab);
}

/** Row count per tab, including "all". */
export function trackerCounts(
  items: TrackerItem[],
): Record<TrackerStatus | "all", number> {
  const counts = { all: items.length } as Record<TrackerStatus | "all", number>;
  for (const status of TRACKER_STATUSES) counts[status] = 0;
  for (const item of items) counts[item.status] += 1;
  return counts;
}
