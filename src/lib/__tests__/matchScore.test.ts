import { describe, expect, it } from "vitest";
import {
  matchProfileToPosting,
  tokenize,
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
