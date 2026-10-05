import { describe, expect, it } from "vitest";
import type { ResumeProfileData } from "@/types/resume";
import {
  jobSchema,
  mergeFormValues,
  normalizeParsedResume,
  profileSchema,
  profileToFormValues,
  type ProfileFormValues,
} from "../resumeSchemas";

const validProfile: ResumeProfileData = {
  fullName: "Ada Lovelace",
  title: "Engineer",
  email: "ada@example.com",
  phone: "5551234567",
  location: "London",
  portfolioUrl: "https://ada.dev",
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
  ],
  education: [{ school: "MIT", degree: "BSc", gradYear: "2018" }],
};

describe("jobSchema", () => {
  const base = {
    jobTitle: "Frontend Engineer",
    companyName: "Acme",
    jobDescription: "x".repeat(150),
  };

  it("accepts a realistic posting", () => {
    expect(jobSchema.safeParse(base).success).toBe(true);
  });

  it("requires at least 120 characters of job description", () => {
    const out = jobSchema.safeParse({ ...base, jobDescription: "too short" });
    expect(out.success).toBe(false);
    if (out.success) throw new Error("expected jobSchema to reject a short description");
    expect(out.error.issues[0].message).toMatch(/at least 120/);
  });

  it("caps the job description at 20,000 characters", () => {
    const out = jobSchema.safeParse({
      ...base,
      jobDescription: "x".repeat(20_001),
    });
    expect(out.success).toBe(false);
    if (out.success) throw new Error("expected jobSchema to reject an oversized description");
    expect(out.error.issues[0].message).toMatch(/20,000/);
  });

  it("requires title and company", () => {
    expect(jobSchema.safeParse({ ...base, jobTitle: "" }).success).toBe(false);
    expect(jobSchema.safeParse({ ...base, companyName: "" }).success).toBe(false);
  });
});

describe("profileSchema", () => {
  const formValues = profileToFormValues(validProfile);

  it("accepts a complete profile", () => {
    expect(profileSchema.safeParse(formValues).success).toBe(true);
  });

  it("rejects missing required fields", () => {
    expect(profileSchema.safeParse({ ...formValues, fullName: "" }).success).toBe(
      false,
    );
    expect(profileSchema.safeParse({ ...formValues, email: "nope" }).success).toBe(
      false,
    );
    expect(profileSchema.safeParse({ ...formValues, skills: [] }).success).toBe(
      false,
    );
    expect(
      profileSchema.safeParse({ ...formValues, experience: [] }).success,
    ).toBe(false);
    expect(
      profileSchema.safeParse({ ...formValues, education: [] }).success,
    ).toBe(false);
  });

  it("requires every experience entry to have bullets", () => {
    const broken = {
      ...formValues,
      experience: [{ ...formValues.experience[0], bulletsText: "" }],
    };
    expect(profileSchema.safeParse(broken).success).toBe(false);
  });
});

describe("profileToFormValues", () => {
  it("joins experience bullets into bulletsText", () => {
    const out = profileToFormValues(validProfile);
    expect(out.experience[0].bulletsText).toBe("Did a thing\nKept constant");
  });

  it("keeps scalar fields and lists intact", () => {
    const out = profileToFormValues(validProfile);
    expect(out.fullName).toBe("Ada Lovelace");
    expect(out.skills).toEqual(["TypeScript", "Writing"]);
    expect(out.education).toEqual(validProfile.education);
    expect(out.portfolioUrl).toBe("https://ada.dev");
  });
});

describe("normalizeParsedResume", () => {
  it("returns null for unusable payloads", () => {
    expect(normalizeParsedResume(null)).toBeNull();
    expect(normalizeParsedResume("plain text")).toBeNull();
    expect(normalizeParsedResume([1, 2])).toBeNull();
    expect(normalizeParsedResume({})).toBeNull();
    expect(normalizeParsedResume({ fullName: "", skills: [] })).toBeNull();
  });

  it("trims and caps strings and de-duplicates skills", () => {
    const out = normalizeParsedResume({
      fullName: "  Ada Lovelace  ",
      summary: "s".repeat(5_000),
      skills: ["TypeScript", "typescript", "", " Rust ", "TypeScript"],
    });
    expect(out).not.toBeNull();
    expect(out!.fullName).toBe("Ada Lovelace");
    expect(out!.summary).toHaveLength(1_500);
    expect(out!.skills).toEqual(["TypeScript", "Rust"]);
  });

  it("joins bullet arrays and drops content-free experience rows", () => {
    const out = normalizeParsedResume({
      experience: [
        {
          company: "Acme",
          title: "Dev",
          startDate: "2020",
          endDate: "2024",
          bullets: ["Did a thing", "Also this"],
        },
        { company: "", title: "", bulletsText: "" },
        { title: "Solo role", bulletsText: "Shipped it" },
      ],
    });
    expect(out).not.toBeNull();
    expect(out!.experience).toHaveLength(2);
    expect(out!.experience[0].bulletsText).toBe("Did a thing\nAlso this");
    expect(out!.experience[1].company).toBe("");
    expect(out!.experience[1].title).toBe("Solo role");
  });

  it("keeps pre-joined bulletsText as-is and normalizes education", () => {
    const out = normalizeParsedResume({
      experience: [
        { company: "A", title: "B", bulletsText: "line one\nline two" },
      ],
      education: [
        { school: "MIT", degree: "BSc", gradYear: "2018" },
        { school: "", degree: "", gradYear: "" },
      ],
    });
    expect(out!.experience[0].bulletsText).toBe("line one\nline two");
    expect(out!.education).toHaveLength(1);
    expect(out!.education[0].school).toBe("MIT");
  });
});

describe("mergeFormValues", () => {
  const empty = {
    fullName: "",
    title: "",
    email: "",
    phone: "",
    location: "",
    portfolioUrl: "",
    summary: "",
    skills: [] as string[],
    experience: [] as ProfileFormValues["experience"],
    education: [] as ProfileFormValues["education"],
  };
  const imported: ProfileFormValues = {
    ...empty,
    fullName: "Ada",
    skills: ["TS"],
    experience: [
      {
        company: "Acme",
        title: "Dev",
        startDate: "2020",
        endDate: "2024",
        bulletsText: "A\nB",
      },
    ],
    education: [{ school: "MIT", degree: "BSc", gradYear: "2018" }],
  };

  it("fills an empty form completely", () => {
    expect(mergeFormValues(empty, imported)).toEqual(imported);
  });

  it("keeps user-typed fields and fills only the gaps", () => {
    const current: ProfileFormValues = {
      ...empty,
      fullName: "Grace Hopper",
      summary: "Typed summary",
    };
    const out = mergeFormValues(current, imported);
    expect(out.fullName).toBe("Grace Hopper");
    expect(out.summary).toBe("Typed summary");
    expect(out.skills).toEqual(["TS"]);
    expect(out.experience).toEqual(imported.experience);
  });

  it("never replaces a populated experience/education list", () => {
    const mine: ProfileFormValues["experience"] = [
      {
        company: "Mine",
        title: "Role",
        startDate: "1",
        endDate: "2",
        bulletsText: "X",
      },
    ];
    const out = mergeFormValues({ ...empty, experience: mine }, imported);
    expect(out.experience).toEqual(mine);
    expect(out.education).toEqual(imported.education);
  });

  it("treats whitespace-only rows as empty", () => {
    const current: ProfileFormValues = {
      ...empty,
      experience: [
        { company: "  ", title: "", startDate: "", endDate: "", bulletsText: " " },
      ],
    };
    expect(mergeFormValues(current, imported).experience).toEqual(
      imported.experience,
    );
  });
});
