import { describe, expect, it } from "vitest";
import {
  clampRadius,
  haversineMiles,
  MAX_RADIUS_MILES,
  mentionsPlace,
  MIN_RADIUS_MILES,
  nominatimFirstPlace,
  normalizeGeoKey,
  parseLocationChips,
  parseRadiusLocation,
  RADIUS_RE,
} from "@/lib/geo";

describe("radius token parsing", () => {
  it("parses trailing within-tokens on a chip", () => {
    expect(parseRadiusLocation("Columbus, OH within 35mi")).toEqual({
      location: "Columbus, OH",
      radiusMiles: 35,
    });
    expect(parseRadiusLocation("Gahanna OH within 50 miles")).toEqual({
      location: "Gahanna OH",
      radiusMiles: 50,
    });
    expect(parseRadiusLocation("within 20 mile")).toEqual({
      location: "",
      radiusMiles: 20,
    });
  });

  it("clamps radii into the supported band", () => {
    expect(clampRadius(1)).toBe(MIN_RADIUS_MILES);
    expect(clampRadius(999)).toBe(MAX_RADIUS_MILES);
    expect(clampRadius(35.4)).toBe(35);
    expect(parseRadiusLocation("Austin within 2mi").radiusMiles).toBe(
      MIN_RADIUS_MILES,
    );
  });

  it("chips without a radius keep their full text", () => {
    expect(parseRadiusLocation("Remote")).toEqual({ location: "Remote" });
    expect(parseRadiusLocation("  New  York  ")).toEqual({
      location: "New York",
    });
  });
});

describe("comma-joined chip list parsing", () => {
  it("reassembles places split across commas", () => {
    expect(parseLocationChips("Columbus, OH within 35mi, Remote")).toEqual([
      { location: "Columbus, OH", radiusMiles: 35 },
      { location: "Remote" },
    ]);
  });

  it("supports semicolon and pipe separators", () => {
    expect(parseLocationChips("Austin within 15mi; Berlin")).toEqual([
      { location: "Austin", radiusMiles: 15 },
      { location: "Berlin" },
    ]);
    expect(parseLocationChips("Gahanna, OH within 35mi | Delaware, OH within 20mi")).toEqual([
      { location: "Gahanna, OH", radiusMiles: 35 },
      { location: "Delaware, OH", radiusMiles: 20 },
    ]);
  });

  it("drops a radius fragment with no place in front", () => {
    expect(parseLocationChips("within 35mi")).toEqual([]);
  });
});

describe("geo key", () => {
  it("normalizes case and whitespace for the cache key", () => {
    expect(normalizeGeoKey("  Columbus,   OH ")).toBe("columbus, oh");
    expect(normalizeGeoKey("X".repeat(200))).toHaveLength(120);
  });
});

describe("haversine", () => {
  it("measures known city distances", () => {
    const dist = haversineMiles(39.96118, -82.99879, 41.4995, -81.6954);
    expect(dist).toBeGreaterThan(120);
    expect(dist).toBeLessThan(135);
  });

  it("is zero for identical points", () => {
    expect(haversineMiles(39.96, -82.99, 39.96, -82.99)).toBe(0);
  });
});

describe("nominatim parsing", () => {
  const row = {
    display_name: "Columbus, Franklin County, Ohio, United States",
    lat: "39.9622601",
    lon: "-83.0007065",
  };

  it("reads the first row", () => {
    expect(nominatimFirstPlace([row])).toEqual({
      displayName: "Columbus, Franklin County, Ohio, United States",
      lat: 39.9622601,
      lon: -83.0007065,
    });
  });

  it("rejects junk payloads", () => {
    expect(nominatimFirstPlace(null)).toBeNull();
    expect(nominatimFirstPlace([])).toBeNull();
    expect(nominatimFirstPlace([{}])).toBeNull();
    expect(
      nominatimFirstPlace([{ lat: "x", lon: "1", display_name: "y" }]),
    ).toBeNull();
    expect(nominatimFirstPlace([{ lat: "1", lon: "1" }])).toBeNull();
  });
});

describe("fallback place matching", () => {
  it("requires every token of the place to appear", () => {
    expect(mentionsPlace("Gahanna, OH", "Gahanna, OH")).toBe(true);
    expect(mentionsPlace("43215", "43215")).toBe(true);
    expect(mentionsPlace("Columbus, OH 43215", "43215")).toBe(true);
    expect(mentionsPlace("Remote", "Gahanna, OH")).toBe(false);
    expect(mentionsPlace("Columbus, GA", "Columbus, OH")).toBe(false);
    expect(mentionsPlace("", "Columbus")).toBe(false);
    expect(mentionsPlace("Columbus", "")).toBe(false);
  });
});

it("radius regex is case-insensitive", () => {
  expect(RADIUS_RE.test("Austin WITHIN 35MI")).toBe(true);
});
