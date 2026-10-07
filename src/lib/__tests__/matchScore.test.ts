import { describe, expect, it } from "vitest";
import {
  isUsFocusedPosting,
  locationTerms,
  matchProfileToPosting,
  matchesLocation,
  tokenize,
  US_STATE_NAMES,
  type MatchProfile,
  type MatchPosting,
} from "../matchScore";

const engineer: MatchProfile = {
  title: "Senior React Engineer",
  skills: ["TypeScript", "React", "Node.js", "GraphQL", "CSS"],
  summary:
    "Frontend engineer shipping React dashboards in TypeScript and Node.js.",
  experience: [
    {
      title: "React Developer",
      bullets: [
        "Built component libraries with React and TypeScript",
        "Designed GraphQL APIs with Node.js",
      ],
    },
  ],
};

const reactPosting: MatchPosting = {
  title: "Senior React Engineer",
  description: `
    We're hiring a Senior React Engineer to build dashboards in React and
    TypeScript on a Node.js backend with GraphQL. You'll own CSS styling,
    component architecture, testing, and performance. Five years of React
    experience required. Benefits: health, 401k, remote stipend.
  `,
};

const nursePosting: MatchPosting = {
  title: "Registered Nurse — Med Surg",
  description: `
    Licensed RN needed for a 32-bed medical surgical unit. Administer
    medication, monitor vitals, coordinate with physicians, and document
    patient charts in Epic. BSN required, ACLS certification preferred.
    Twelve-hour rotating shifts with weekend coverage.
  `,
};

describe("tokenize", () => {
  it("lowercases and keeps tech tokens", () => {
    expect(tokenize("C++ & C# developer for Node.js")).toEqual([
      "c++",
      "c#",
      "developer",
      "for",
      "node.js",
    ]);
  });

  it("drops single-character and punctuation-only fragments", () => {
    expect(tokenize("a, b; -- !!! ok")).toEqual(["ok"]);
  });
});

describe("matchProfileToPosting", () => {
  it("scores a strong fit highly", () => {
    const result = matchProfileToPosting(engineer, reactPosting);
    expect(result.score).toBeGreaterThanOrEqual(65);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("scores an unrelated posting low", () => {
    const result = matchProfileToPosting(engineer, nursePosting);
    expect(result.score).toBeLessThanOrEqual(30);
  });

  it("ranks the matching posting above the unrelated one", () => {
    const strong = matchProfileToPosting(engineer, reactPosting).score;
    const weak = matchProfileToPosting(engineer, nursePosting).score;
    expect(strong).toBeGreaterThan(weak);
  });

  it("reports the posting terms the profile already covers", () => {
    const result = matchProfileToPosting(engineer, reactPosting);
    expect(result.matchedKeywords).toContain("react");
    expect(result.matchedKeywords).toContain("typescript");
    // Present in the posting, absent from the profile.
    expect(result.missingKeywords).toContain("testing");
    expect(result.missingKeywords).not.toContain("react");
  });

  it("grows when the profile's skills appear in the posting", () => {
    const bare: MatchProfile = {
      title: "Engineer",
      skills: [],
      summary: "",
      experience: [],
    };
    const before = matchProfileToPosting(bare, reactPosting).score;
    const after = matchProfileToPosting(engineer, reactPosting).score;
    expect(after).toBeGreaterThan(before);
  });

  it("does not credit short skills hidden inside other words", () => {
    const golfer: MatchProfile = {
      title: "Developer",
      skills: ["Go"],
      summary: "",
      experience: [],
    };
    // "go" appears only inside "algorithms" — not a real mention.
    const result = matchProfileToPosting(golfer, {
      title: "Developer",
      description: "algorithms and throughput optimization",
    });
    expect(result.score).toBeLessThanOrEqual(35);
  });

  it("handles empty inputs without NaN and stays within 0–100", () => {
    const empty: MatchProfile = {
      title: "",
      skills: [],
      summary: "",
      experience: [],
    };
    expect(matchProfileToPosting(empty, reactPosting).score).toBeGreaterThanOrEqual(0);
    expect(matchProfileToPosting(engineer, { title: "", description: "" }).score).toBe(0);
    expect(matchProfileToPosting(empty, nursePosting).score).toBeLessThanOrEqual(100);
  });

  it("caps the keyword lists it returns", () => {
    const longPosting: MatchPosting = {
      title: "Engineer",
      description: Array.from({ length: 80 }, (_, i) => `term${i} filler`).join(" "),
    };
    const result = matchProfileToPosting(engineer, longPosting);
    expect(result.matchedKeywords.length).toBeLessThanOrEqual(10);
    expect(result.missingKeywords.length).toBeLessThanOrEqual(12);
  });
});

describe("locationTerms", () => {
  it("splits a multi-location string into normalized terms", () => {
    expect(locationTerms("Remote, Berlin")).toEqual(["remote", "berlin"]);
    expect(locationTerms(" New  York ; USA | London ")).toEqual([
      "new york",
      "usa",
      "london",
    ]);
  });

  it("trims, lowercases, and de-duplicates case-insensitively", () => {
    expect(locationTerms("Berlin, berlin, BERLIN")).toEqual(["berlin"]);
  });

  it("drops empty and single-character fragments", () => {
    expect(locationTerms(" , ; a ,, b ")).toEqual([]);
    expect(locationTerms(undefined)).toEqual([]);
    expect(locationTerms("")).toEqual([]);
  });
});

describe("matchesLocation", () => {
  it("passes everything when no locations are requested", () => {
    expect(matchesLocation("Berlin, Germany", [])).toBe(true);
    expect(matchesLocation("Unspecified", locationTerms(undefined))).toBe(
      true,
    );
  });

  it("matches any requested term (widens with more locations)", () => {
    const terms = locationTerms("Berlin, London");
    expect(matchesLocation("Berlin, Germany", terms)).toBe(true);
    expect(matchesLocation("London, UK", terms)).toBe(true);
    expect(matchesLocation("Austin, TX", terms)).toBe(false);
  });

  it("lets work-from-anywhere listings pass any location filter", () => {
    const terms = locationTerms("Germany");
    expect(matchesLocation("Remote", terms)).toBe(true);
    expect(matchesLocation("Worldwide", terms)).toBe(true);
    expect(matchesLocation("Anywhere on earth", terms)).toBe(true);
    expect(matchesLocation("Global (UTC±3)", terms)).toBe(true);
  });

  it("is case-insensitive on both sides", () => {
    expect(matchesLocation("BERLIN", locationTerms("berlin"))).toBe(true);
    expect(matchesLocation("remote", locationTerms("Berlin"))).toBe(true);
  });
});

describe("matchesLocation (US states & cities)", () => {
  it("matches a state name against city, ST listings", () => {
    expect(matchesLocation("Austin, TX", locationTerms("Texas"))).toBe(true);
    expect(matchesLocation("Dearborn, MI", locationTerms("Michigan"))).toBe(
      true,
    );
    expect(matchesLocation("Austin, TX", locationTerms("California"))).toBe(
      false,
    );
  });

  it("matches a state abbreviation as a whole token, never inside words", () => {
    expect(matchesLocation("Austin, TX", locationTerms("TX"))).toBe(true);
    // Whole-token only: "me" inside "Melbourne" never counts as Maine.
    expect(matchesLocation("Melbourne", locationTerms("ME"))).toBe(false);
    expect(matchesLocation("Games, CA", locationTerms("ME"))).toBe(false);
    expect(matchesLocation("London, UK", locationTerms("UK"))).toBe(true);
  });

  it("a USA term matches any US place but not foreign ones", () => {
    expect(matchesLocation("Dearborn, MI", locationTerms("USA"))).toBe(true);
    expect(matchesLocation("Austin, TX", locationTerms("United States"))).toBe(
      true,
    );
    // Full state names, no abbreviation required.
    expect(matchesLocation("Austin, Texas", locationTerms("USA"))).toBe(true);
    expect(matchesLocation("Portland, Oregon", locationTerms("USA"))).toBe(
      true,
    );
    expect(matchesLocation("Berlin, Germany", locationTerms("USA"))).toBe(
      false,
    );
    expect(matchesLocation("Manchester, England", locationTerms("USA"))).toBe(
      false,
    );
  });

  it("still lets work-from-anywhere listings through", () => {
    expect(matchesLocation("Remote", locationTerms("Texas"))).toBe(true);
    expect(matchesLocation("Worldwide", locationTerms("Texas"))).toBe(true);
  });

  it("exports all 51 picker names (50 states + DC)", () => {
    expect(US_STATE_NAMES).toHaveLength(51);
    expect(US_STATE_NAMES).toContain("Texas");
    expect(US_STATE_NAMES).toContain("District of Columbia");
    expect(US_STATE_NAMES[0]).toBe("Alabama");
  });
});

describe("US-focus filter", () => {
  it("keeps postings with clear US evidence", () => {
    expect(isUsFocusedPosting("Columbus, OH")).toBe(true);
    expect(isUsFocusedPosting("Austin, Texas")).toBe(true);
    expect(isUsFocusedPosting("43215")).toBe(true);
    expect(isUsFocusedPosting("Boulder CO 80301-1234")).toBe(true);
    expect(isUsFocusedPosting("Remote — US only")).toBe(true);
    expect(isUsFocusedPosting("New York, United States")).toBe(true);
  });

  it("keeps ambiguous labels rather than guessing wrong", () => {
    expect(isUsFocusedPosting("Unspecified")).toBe(true);
    expect(isUsFocusedPosting("Hybrid")).toBe(true);
    expect(isUsFocusedPosting("Perth")).toBe(true); // could be Perth Amboy, NJ
    expect(isUsFocusedPosting("Paris")).toBe(true); // could be Paris, TX
  });

  it("drops postings named outside the US", () => {
    expect(isUsFocusedPosting("London, UK")).toBe(false);
    expect(isUsFocusedPosting("Berlin, Germany")).toBe(false);
    expect(isUsFocusedPosting("Toronto, Ontario, Canada")).toBe(false);
    expect(isUsFocusedPosting("Vancouver, British Columbia")).toBe(false);
    expect(isUsFocusedPosting("Dublin, Ireland")).toBe(false);
    expect(isUsFocusedPosting("Amsterdam, Netherlands (EU only)")).toBe(false);
    expect(isUsFocusedPosting("Remote — Europe")).toBe(false);
    expect(isUsFocusedPosting("Sydney, Australia")).toBe(false);
  });

  it("lets US evidence win over a shared city name", () => {
    expect(isUsFocusedPosting("Paris, TX")).toBe(true);
    expect(isUsFocusedPosting("Perth Amboy, NJ")).toBe(true);
  });

  it("always keeps rows sourced from US-only employers", () => {
    for (const source of ["tacobell", "winco", "workday"]) {
      expect(isUsFocusedPosting("London, UK", source)).toBe(true);
    }
  });
});
