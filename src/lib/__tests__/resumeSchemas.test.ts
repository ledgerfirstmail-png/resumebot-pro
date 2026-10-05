import { describe, expect, it } from "vitest";
import type { ResumeProfileData } from "@/types/resume";
import { jobSchema, profileSchema, profileToFormValues } from "../resumeSchemas";

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
