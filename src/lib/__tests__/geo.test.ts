import { describe, expect, it } from "vitest";
import {
  clampRadius,
  haversineMiles,
  MAX_RADIUS_MILES,
  placeFallbackAllowed,
  passesRadiusChips,
  RADIUS_FALLBACK_MAX_MILES,
  MIN_RADIUS_MILES,
  nominatimFirstPlace,
  normalizeGeoKey,
  parseLocationChips,
  parseRadiusLocation,
  RADIUS_RE,
  usStateInText,
  type GeoPlace,
  type RadiusChip,
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

describe("state detection", () => {
  it("reads unambiguous state spellings", () => {
    expect(usStateInText("Columbus, OH")).toBe("oh");
    expect(usStateInText("Portland OR 97201")).toBe("or");
    expect(usStateInText("Austin, Texas")).toBe("tx");
    expect(usStateInText("Remote")).toBeNull();
  });

  it("never mistakes bare words like 'in' or 'or' for states", () => {
    expect(usStateInText("Work in Columbus")).toBeNull();
    expect(usStateInText("Portland or Cleveland")).toBeNull();
  });
});

describe("fallback place matching", () => {
  it("accepts postings that name the place without conflicting states", () => {
    expect(placeFallbackAllowed("Gahanna, OH", "Gahanna, OH")).toBe(true);
    expect(placeFallbackAllowed("43215", "43215")).toBe(true);
    expect(placeFallbackAllowed("Columbus, OH 43215", "43215")).toBe(true);
    expect(placeFallbackAllowed("Columbus", "Columbus, OH")).toBe(true);
    expect(placeFallbackAllowed("Work in Columbus", "Columbus, OH")).toBe(
      true,
    );
  });

  it("rejects postings that name a different place or state", () => {
    expect(placeFallbackAllowed("Remote", "Gahanna, OH")).toBe(false);
    expect(placeFallbackAllowed("Columbus, GA", "Columbus, OH")).toBe(false);
    expect(placeFallbackAllowed("Columbus, IN", "Columbus")).toBe(false);
    expect(placeFallbackAllowed("Columbus, OH", "Columbus")).toBe(false);
    expect(placeFallbackAllowed("Romeoville", "Rome, GA")).toBe(false);
  });

  it("rejects empty inputs", () => {
    expect(placeFallbackAllowed("", "Columbus")).toBe(false);
    expect(placeFallbackAllowed("Columbus", "")).toBe(false);
    expect(placeFallbackAllowed("NY", "New York, NY")).toBe(false); // token <3 chars
  });
});

describe("radius decision", () => {
  const origin: GeoPlace = {
    displayName: "Columbus, Franklin County, Ohio, United States",
    lat: 39.96118,
    lon: -82.99879,
  };
  const gahanna: GeoPlace = {
    displayName: "Gahanna, Franklin County, Ohio, United States",
    lat: 39.9985,
    lon: -82.8687,
  };
  const cleveland: GeoPlace = {
    displayName: "Cleveland, Cuyahoga County, Ohio, United States",
    lat: 41.4995,
    lon: -81.6954,
  };
  const columbusGa: GeoPlace = {
    displayName: "Columbus, Muscogee County, Georgia, United States",
    lat: 32.4609,
    lon: -84.9877,
  };
  const chip35: RadiusChip = { location: "Columbus, OH", radiusMiles: 35 };

  const decide = (
    postLocation: string,
    places: Record<string, GeoPlace | null>,
    chips: RadiusChip[] = [chip35],
    origins: Record<string, GeoPlace | null> = { "Columbus, OH": origin },
  ) =>
    passesRadiusChips({
      postLocation,
      chips,
      origins: new Map(Object.entries(origins)),
      places: new Map(
        Object.entries(places).map(([k, v]) => [normalizeGeoKey(k), v]),
      ),
    });

  it("keeps postings measuring inside the radius", () => {
    expect(decide("Gahanna, OH", { "Gahanna, OH": gahanna })).toBe(true);
    // ZIP-only locations match through their city part too.
    expect(decide("Gahanna, OH 43230", { Gahanna: gahanna })).toBe(true);
    expect(
      decide("Gahanna, OH 43230", { "Gahanna, OH 43230": gahanna }),
    ).toBe(true);
  });

  it("drops postings measuring outside the radius even when named", () => {
    expect(decide("Cleveland, OH", { "Cleveland, OH": cleveland })).toBe(
      false,
    );
    expect(
      decide("Cleveland, OH", { "Cleveland, OH": cleveland }, [
        { location: "Columbus, OH", radiusMiles: MAX_RADIUS_MILES },
      ]),
    ).toBe(false);
  });

  it("trusts the name only for unmeasured postings at commute radii", () => {
    expect(decide("Columbus, OH 43215", {})).toBe(true);
    expect(
      decide("Columbus, OH 43215", {}, [
        { location: "Columbus, OH", radiusMiles: RADIUS_FALLBACK_MAX_MILES + 15 },
      ]),
    ).toBe(false);
  });

  it("lets real measurements override the name fallback", () => {
    expect(decide("Columbus, GA", { "Columbus, GA": columbusGa })).toBe(
      false,
    );
  });

  it("never auto-passes remote postings in a strict scan", () => {
    expect(decide("Remote", {})).toBe(false);
    expect(decide("Remote (US only)", {})).toBe(false);
  });

  it("degrades to name matching when the geocoder failed", () => {
    const down = { "Columbus, OH": null };
    expect(decide("Columbus, OH", {}, [chip35], down)).toBe(true);
    expect(decide("Remote", {}, [chip35], down)).toBe(false);
    expect(decide("Cleveland, OH", {}, [chip35], down)).toBe(false);
  });
});

it("radius regex is case-insensitive", () => {
  expect(RADIUS_RE.test("Austin WITHIN 35MI")).toBe(true);
});
