import { describe, expect, it } from "vitest";
import {
  groupIntoTiers,
  tierLevel,
  TIER_LABELS,
} from "@/lib/resultTiers";

describe("tierLevel", () => {
  it("strong at 75 and above", () => {
    expect(tierLevel(75)).toBe(2);
    expect(tierLevel(100)).toBe(2);
  });

  it("good at 55 through 74", () => {
    expect(tierLevel(55)).toBe(1);
    expect(tierLevel(74)).toBe(1);
  });

  it("worth-a-look below 55", () => {
    expect(tierLevel(54)).toBe(0);
    expect(tierLevel(0)).toBe(0);
  });
});

describe("groupIntoTiers", () => {
  it("buckets items by score into descending tiers", () => {
    const tiers = groupIntoTiers([
      { score: 90, id: "a" },
      { score: 60, id: "b" },
      { score: 30, id: "c" },
    ]);
    expect(tiers.map((t) => t.level)).toEqual([2, 1, 0]);
    expect(tiers[0].items[0].id).toBe("a");
    expect(tiers[1].items[0].id).toBe("b");
    expect(tiers[2].items[0].id).toBe("c");
  });

  it("sorts inside each tier by score descending regardless of input order", () => {
    const tiers = groupIntoTiers([
      { score: 80, id: "late" },
      { score: 95, id: "early" },
    ]);
    expect(tiers).toHaveLength(1);
    expect(tiers[0].items.map((i) => i.id)).toEqual(["early", "late"]);
  });

  it("omits tiers with no items, in order", () => {
    const tiers = groupIntoTiers([{ score: 10, id: "x" }]);
    expect(tiers).toHaveLength(1);
    expect(tiers[0].level).toBe(0);
    expect(tiers[0].label).toBe(TIER_LABELS[0]);
  });

  it("returns an empty list for empty input", () => {
    expect(groupIntoTiers([])).toEqual([]);
  });

  it("is deterministic across repeated runs", () => {
    const input = [
      { score: 40, id: "1" },
      { score: 88, id: "2" },
      { score: 57, id: "3" },
    ];
    const first = groupIntoTiers(input);
    const second = groupIntoTiers(input);
    expect(first).toEqual(second);
  });
});
