/**
 * Quality tiers for the radar's results board (pass 29): listings sorted by
 * one deterministic score are grouped into three labeled bands so the board
 * reads at a glance instead of one long flat grid.
 * Pure and dependency-free so vitest covers it without network access.
 */

export interface TieredItem {
  score: number;
}

export interface ResultTier<T extends TieredItem> {
  /** 2 = strong, 1 = good, 0 = worth a look. */
  level: 2 | 1 | 0;
  label: string;
  /** Tailwind class fragments owning the tier's accent. */
  dotClass: string;
  items: T[];
}

export const TIER_LABELS: Record<2 | 1 | 0, string> = {
  2: "Strong match",
  1: "Good match",
  0: "Worth a look",
};

export const TIER_DOTS: Record<2 | 1 | 0, string> = {
  2: "bg-emerald-500",
  1: "bg-sky-500",
  0: "bg-amber-500",
};

const STRONG_MIN = 75;
const GOOD_MIN = 55;

/** Which tier a score lands in (2 strong / 1 good / 0 worth a look). */
export function tierLevel(score: number): 2 | 1 | 0 {
  if (score >= STRONG_MIN) return 2;
  if (score >= GOOD_MIN) return 1;
  return 0;
}

/**
 * Group items into the three tiers, sorted by score descending inside each
 * band; tiers with no items are omitted. Input order is irrelevant — the
 * output is fully deterministic.
 */
export function groupIntoTiers<T extends TieredItem>(
  items: readonly T[],
): Array<ResultTier<T>> {
  const buckets: Record<2 | 1 | 0, T[]> = { 2: [], 1: [], 0: [] };
  for (const item of items) buckets[tierLevel(item.score)].push(item);
  for (const list of Object.values(buckets)) {
    list.sort((a, b) => b.score - a.score);
  }
  return ([2, 1, 0] as const)
    .filter((level) => buckets[level].length > 0)
    .map((level) => ({
      level,
      label: TIER_LABELS[level],
      dotClass: TIER_DOTS[level],
      items: buckets[level],
    }));
}
