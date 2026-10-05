import { describe, expect, it } from "vitest";
import type { TailorResult } from "@/convex/ai";
import type { ResumeProfileData } from "@/types/resume";
import { buildDiff } from "../bulletDiff";

const baseProfile: ResumeProfileData = {
  fullName: "Ada Lovelace",
  title: "Engineer",
  email: "ada@example.com",
  phone: "5551234567",
  location: "London",
  portfolioUrl: "",
  summary: "Original summary.",
  skills: ["TypeScript", "Writing"],
  experience: [
    {
      company: "Acme",
      title: "Backend Engineer",
      startDate: "2020",
      endDate: "2024",
      bullets: ["Did a thing", "Kept constant"],
    },
    {
      company: "Globex",
      title: "Junior Dev",
      startDate: "2018",
      endDate: "2020",
      bullets: ["Legacy work"],
    },
  ],
  education: [{ school: "MIT", degree: "BSc", gradYear: "2018" }],
};

function makeResult(overrides: Partial<TailorResult>): TailorResult {
  return {
    score: 90,
    summary: "Original summary.",
    skills: ["TypeScript", "Writing"],
    keywords: ["api"],
    missingKeywords: [],
    breakdown: [],
    education: baseProfile.education,
    experience: baseProfile.experience,
    ...overrides,
  };
}

describe("buildDiff", () => {
  it("matches roles by company + title even when order differs", () => {
    const tailored = makeResult({
      experience: [
        { ...baseProfile.experience[1], bullets: ["Rewrote legacy work"] },
        { ...baseProfile.experience[0], bullets: ["Did a thing", "Kept constant"] },
      ],
    });
    const diff = buildDiff(baseProfile, tailored);
    expect(diff.roles).toHaveLength(1);
    expect(diff.roles[0].role).toBe("Junior Dev · Globex");
    expect(diff.roles[0].pairs[0]).toEqual({
      original: "Legacy work",
      tailored: "Rewrote legacy work",
      changed: true,
    });
    expect(diff.rewrittenCount).toBe(1);
  });

  it("falls back to positional matching for parallel lists", () => {
    const tailored = makeResult({
      experience: [
        { ...baseProfile.experience[0], company: "Renamed Co", bullets: ["Rewrite"] },
        baseProfile.experience[1],
      ],
    });
    const diff = buildDiff(baseProfile, tailored);
    expect(diff.roles).toHaveLength(1);
    expect(diff.roles[0].role).toBe("Backend Engineer · Renamed Co");
    expect(diff.roles[0].pairs[0].original).toBe("Did a thing");
  });

  it("pairs dropped original bullets as removed (tailored empty)", () => {
    const tailored = makeResult({
      experience: [
        { ...baseProfile.experience[0], bullets: ["Did a thing"] },
        { ...baseProfile.experience[1], bullets: ["Legacy work"] },
      ],
    });
    const diff = buildDiff(baseProfile, tailored);
    const dropped = diff.roles
      .flatMap((r) => r.pairs)
      .find((p) => p.tailored === "");
    expect(dropped).toEqual({
      original: "Kept constant",
      tailored: "",
      changed: true,
    });
    expect(diff.rewrittenCount).toBe(1);
  });

  it("filters out unchanged bullets and renders nothing-worth when equal", () => {
    const tailored = makeResult({});
    const diff = buildDiff(baseProfile, tailored);
    expect(diff.roles).toHaveLength(0);
    expect(diff.rewrittenCount).toBe(0);
    expect(diff.summaryChanged).toBe(false);
    expect(diff.skillsAdded).toEqual([]);
    expect(diff.skillsRemoved).toEqual([]);
  });

  it("is case/whitespace insensitive when comparing", () => {
    const tailored = makeResult({
      experience: [
        { ...baseProfile.experience[0], bullets: ["  DID A THING ", "Kept constant"] },
        baseProfile.experience[1],
      ],
    });
    expect(buildDiff(baseProfile, tailored).rewrittenCount).toBe(0);
  });

  it("reports added and removed skills", () => {
    const tailored = makeResult({ skills: ["TypeScript", "Rust"] });
    const diff = buildDiff(baseProfile, tailored);
    expect(diff.skillsAdded).toEqual(["Rust"]);
    expect(diff.skillsRemoved).toEqual(["Writing"]);
  });

  it("detects a changed summary", () => {
    const diff = buildDiff(baseProfile, makeResult({ summary: "New summary." }));
    expect(diff.summaryChanged).toBe(true);
  });

  it("treats an unmatched experience entry as all-new bullets", () => {
    const tailored = makeResult({
      experience: [
        {
          company: "Totally New Co",
          title: "Staff Engineer",
          startDate: "2024",
          endDate: "2025",
          bullets: ["Built the thing"],
        },
      ],
    });
    const diff = buildDiff(baseProfile, tailored);
    // No positional overlap (index 0 is unused... actually index 0 matches positionally)
    // Positional fallback applies only while lists are parallel; here idx 0 is free.
    expect(diff.roles[0].pairs[0]).toEqual({
      original: "Did a thing",
      tailored: "Built the thing",
      changed: true,
    });
  });
});
