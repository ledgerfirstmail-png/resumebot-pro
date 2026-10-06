import { describe, expect, it } from "vitest";
import type { ResumeProfileData } from "@/types/resume";
import { buildResumePdf, pdfFilename, toPdfText } from "../resumePdf";

const sample: ResumeProfileData = {
  fullName: "Jane Doe",
  title: "Senior React Engineer",
  email: "jane@example.com",
  phone: "+1 555 0100",
  location: "Berlin, Germany",
  portfolioUrl: "https://jane.dev",
  summary: "Frontend engineer — shipping “smart” dashboards.",
  skills: ["React", "TypeScript"],
  experience: [
    {
      company: "ACME",
      title: "Engineer",
      startDate: "2020",
      endDate: "Present",
      bullets: ["Built the design system", "Led the migration"],
    },
  ],
  education: [{ school: "TU Berlin", degree: "BSc", gradYear: "2019" }],
};

/** A resume long enough to force real pagination. */
const longResume: ResumeProfileData = {
  ...sample,
  experience: Array.from({ length: 12 }, (_, i) => ({
    company: `Company ${i}`,
    title: "Senior Engineer",
    startDate: "2015",
    endDate: "2024",
    bullets: [
      "Owned the platform migration end-to-end across three teams and five services",
      "Led design reviews and mentored four engineers through the transition",
      "Cut incident volume by 40 percent with better alerts and runbooks",
      "Shipped the new billing flow with zero downtime during cutover",
      "Wrote the RFC process that every team now follows",
    ],
  })),
};

describe("toPdfText", () => {
  it("folds typographic punctuation into ASCII equivalents", () => {
    expect(toPdfText("“a” — b…")).toBe('"a" - b...');
    expect(toPdfText("it’s ‘fine’")).toBe("it's 'fine'");
    expect(toPdfText("• item")).toBe("\u00B7 item");
    expect(toPdfText("non\u00A0breaking")).toBe("non breaking");
  });

  it("keeps Latin-1 characters (WinAnsi-safe bytes)", () => {
    expect(toPdfText("Café Müller")).toBe("Café Müller");
  });

  it("drops characters outside Latin-1 and stray control codes", () => {
    expect(toPdfText("東京 lab")).toBe(" lab");
    expect(toPdfText("a\u0000b\u0007c")).toBe("abc");
  });

  it("preserves newlines for wrapped layout", () => {
    expect(toPdfText("line1\nline2")).toBe("line1\nline2");
  });
});

describe("pdfFilename", () => {
  it("builds Resume_<Company>.pdf from a company/role label", () => {
    expect(pdfFilename("ACME")).toBe("Resume_ACME.pdf");
    expect(pdfFilename("ACME, Inc.")).toBe("Resume_ACME_Inc.pdf");
    expect(pdfFilename("Data “Ops” Team")).toBe("Resume_Data_Ops_Team.pdf");
  });

  it("produces a filesystem-safe ASCII name for any input", () => {
    expect(pdfFilename("Ünïcode Café")).toBe("Resume_Unicode_Cafe.pdf");
    const long = pdfFilename("A very long company name that keeps going ".repeat(4));
    expect(long).toMatch(/^[A-Za-z0-9._-]+\.pdf$/);
    expect(long.length).toBeLessThanOrEqual(71);
    expect(pdfFilename("")).toBe("Resume.pdf");
    expect(pdfFilename("...")).toBe("Resume.pdf");
  });
});

describe("buildResumePdf", () => {
  it("emits a valid one-page PDF containing the resume's text", () => {
    const doc = buildResumePdf(sample);
    const out = doc.output() as string;
    expect(out.startsWith("%PDF-")).toBe(true);
    expect(doc.getNumberOfPages()).toBe(1);
    expect(out).toContain("Jane Doe");
    expect(out).toContain("Senior React Engineer");
    expect(out).toContain("TU Berlin");
    // No un-folded typographic bytes can leak into the stream.
    expect(out).not.toContain("\u201C");
    expect(out).not.toContain("\u2014");
    expect(out).not.toContain("\u2022");
  });

  it("paginates long resumes instead of clipping them", () => {
    const doc = buildResumePdf(longResume);
    const pages = doc.getNumberOfPages();
    expect(pages).toBeGreaterThanOrEqual(2);
    const out = doc.output() as string;
    // The last job's content still made it into the document.
    expect(out).toContain("Company 11");
    // Page footers only appear when the resume actually spilled.
    expect(out).toContain(`1 / ${pages}`);
  });

  it("handles an empty resume without throwing", () => {
    const doc = buildResumePdf({
      fullName: "",
      title: "",
      email: "",
      phone: "",
      location: "",
      portfolioUrl: "",
      summary: "",
      skills: [],
      experience: [],
      education: [],
    });
    expect(doc.getNumberOfPages()).toBe(1);
    expect(doc.output() as string).toContain("Your Name");
  });
});
