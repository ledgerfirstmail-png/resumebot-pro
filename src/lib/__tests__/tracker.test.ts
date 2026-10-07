import { describe, expect, it } from "vitest";
import {
  filterTrackerItems,
  sortTrackerItems,
  TRACKER_STATUSES,
  TRACKER_TABS,
  trackerActivityAt,
  trackerCounts,
  type TrackerItem,
} from "@/lib/tracker";

function item(overrides: Partial<TrackerItem> = {}): TrackerItem {
  return {
    id: "j1",
    title: "Cashier",
    company: "WinCo",
    location: "Columbus, OH",
    url: "https://example.com/1",
    score: 70,
    status: "new",
    firstSeenAt: 1_000,
    ...overrides,
  };
}

describe("tracker activity", () => {
  it("uses the applied date when set, first-seen otherwise", () => {
    expect(trackerActivityAt(item({ appliedAt: 9_000 }))).toBe(9_000);
    expect(trackerActivityAt(item())).toBe(1_000);
  });
});

describe("tracker sorting", () => {
  it("puts the most recent activity first", () => {
    const sorted = sortTrackerItems([
      item({ id: "old", firstSeenAt: 1_000 }),
      item({ id: "applied", status: "applied", appliedAt: 5_000 }),
      item({ id: "fresh", firstSeenAt: 8_000 }),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["fresh", "applied", "old"]);
  });

  it("breaks ties by score, then title", () => {
    const sorted = sortTrackerItems([
      item({ id: "b", score: 60, firstSeenAt: 1_000 }),
      item({ id: "z", score: 60, firstSeenAt: 1_000, title: "Zebra role" }),
      item({ id: "a", score: 90, firstSeenAt: 1_000 }),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(["a", "b", "z"]);
  });

  it("does not mutate the input array", () => {
    const input = [item({ id: "x", firstSeenAt: 5_000 }), item()];
    const copy = [...input];
    sortTrackerItems(input);
    expect(input).toEqual(copy);
  });
});

describe("tracker filtering and counts", () => {
  const items = [
    item({ id: "1", status: "new" }),
    item({ id: "2", status: "applied", appliedAt: 3_000 }),
    item({ id: "3", status: "applied", appliedAt: 4_000 }),
    item({ id: "4", status: "interview" }),
    item({ id: "5", status: "rejected" }),
    item({ id: "6", status: "tailored" }),
  ];

  it("keeps every row on the all tab and splits by status otherwise", () => {
    expect(filterTrackerItems(items, "all")).toHaveLength(6);
    expect(filterTrackerItems(items, "applied").map((i) => i.id)).toEqual([
      "2",
      "3",
    ]);
    expect(filterTrackerItems(items, "interview").map((i) => i.id)).toEqual([
      "4",
    ]);
    expect(filterTrackerItems(items, "new")).toHaveLength(1);
  });

  it("counts every tab including all", () => {
    const counts = trackerCounts(items);
    expect(counts.all).toBe(6);
    expect(counts.applied).toBe(2);
    expect(counts.interview).toBe(1);
    expect(counts.rejected).toBe(1);
    expect(counts.tailored).toBe(1);
    expect(counts.new).toBe(1);
  });

  it("returns zeros for an empty pipeline", () => {
    const counts = trackerCounts([]);
    expect(counts.all).toBe(0);
    for (const status of TRACKER_STATUSES) expect(counts[status]).toBe(0);
  });
});

describe("tracker tabs", () => {
  it("leads with the owned pipeline and covers every status", () => {
    expect(TRACKER_TABS.map((t) => t.key)).toEqual([
      "all",
      "applied",
      "interview",
      "rejected",
      "tailored",
      "new",
    ]);
    const keys = TRACKER_TABS.filter((t) => t.key !== "all").map((t) => t.key);
    for (const status of TRACKER_STATUSES) expect(keys).toContain(status);
  });
});
