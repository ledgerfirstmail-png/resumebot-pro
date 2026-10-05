/** Zod schemas and form mapping for the resume wizard — exported for tests (D1). */
import { z } from "zod";
import type { ResumeProfileData } from "@/types/resume";

export const experienceSchema = z.object({
  company: z.string().min(1, "Company is required"),
  title: z.string().min(1, "Job title is required"),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  bulletsText: z.string().min(1, "Add at least one bullet"),
});

export const profileSchema = z.object({
  fullName: z.string().min(1, "Name is required"),
  title: z.string().min(1, "Professional title is required"),
  email: z.string().email("Enter a valid email"),
  phone: z.string().min(7, "Enter a valid phone number"),
  location: z.string().min(1, "Location is required"),
  portfolioUrl: z.string().optional().or(z.literal("")),
  summary: z.string().min(1, "Write a short professional summary"),
  skills: z.array(z.string()).min(1, "Add at least one skill"),
  experience: z.array(experienceSchema).min(1, "Add at least one role"),
  education: z
    .array(
      z.object({
        school: z.string().min(1, "School is required"),
        degree: z.string().min(1, "Degree is required"),
        gradYear: z.string().min(1, "Graduation year is required"),
      }),
    )
    .min(1, "Add at least one school"),
});

export const jobSchema = z.object({
  jobTitle: z.string().min(2, "Job title is required"),
  companyName: z.string().min(1, "Company name is required"),
  jobDescription: z
    .string()
    .min(120, "Paste the full job description (at least 120 characters)")
    .max(
      20_000,
      "That posting is huge — trim it to under 20,000 characters",
    ),
});

export type ProfileFormValues = z.infer<typeof profileSchema>;
export type JobFormValues = z.infer<typeof jobSchema>;

/** --- B5: normalize an AI-parsed resume into the wizard's form shape --- */

const str = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/** Trim, cap, drop empties, and de-duplicate a string list. */
function strArray(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const s = str(item, maxLen);
    if (!s) continue;
    if (out.some((x) => x.toLowerCase() === s.toLowerCase())) continue;
    out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

/**
 * Coerce the AI's parsed JSON into the exact wizard form shape: strings
 * trimmed/capped, skills de-duplicated, experience entries requiring at
 * least a company or title, bullets accepted as an array or a pre-joined
 * `bulletsText` string. Returns `null` when the payload carries no usable
 * resume content at all (so the caller can show a friendly error).
 */
export function normalizeParsedResume(raw: unknown): ProfileFormValues | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;

  const experience: ProfileFormValues["experience"] = [];
  if (Array.isArray(r.experience)) {
    for (const item of r.experience) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const bulletsText =
        str(row.bulletsText, 6_000) ||
        (Array.isArray(row.bullets)
          ? strArray(row.bullets, 12, 500).join("\n")
          : "");
      const entry = {
        company: str(row.company, 160),
        title: str(row.title, 160),
        startDate: str(row.startDate, 40),
        endDate: str(row.endDate, 40),
        bulletsText,
      };
      if (!entry.company && !entry.title) continue;
      experience.push(entry);
      if (experience.length >= 12) break;
    }
  }

  const education: ProfileFormValues["education"] = [];
  if (Array.isArray(r.education)) {
    for (const item of r.education) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const entry = {
        school: str(row.school, 200),
        degree: str(row.degree, 200),
        gradYear: str(row.gradYear, 20),
      };
      if (!entry.school && !entry.degree) continue;
      education.push(entry);
      if (education.length >= 8) break;
    }
  }

  const out: ProfileFormValues = {
    fullName: str(r.fullName, 120),
    title: str(r.title, 160),
    email: str(r.email, 200),
    phone: str(r.phone, 60),
    location: str(r.location, 160),
    portfolioUrl: str(r.portfolioUrl, 300),
    summary: str(r.summary, 1_500),
    skills: strArray(r.skills, 30, 80),
    experience,
    education,
  };

  const hasContent = Boolean(
    out.fullName ||
      out.summary ||
      out.skills.length ||
      out.experience.length ||
      out.education.length,
  );
  return hasContent ? out : null;
}

/**
 * Merge an imported resume into the current form without clobbering
 * anything the user already typed: filled scalar fields, a non-empty skill
 * list, or a populated experience/education list always win; the import
 * only fills what's still empty.
 */
export function mergeFormValues(
  current: ProfileFormValues,
  incoming: ProfileFormValues,
): ProfileFormValues {
  const filled = (s: string) => s.trim().length > 0;
  const pick = (cur: string | undefined, next: string | undefined): string =>
    filled(cur ?? "") ? (cur ?? "") : (next ?? "");

  const currentHasExperience = current.experience.some(
    (e) => filled(e.company) || filled(e.title) || filled(e.bulletsText),
  );
  const currentHasEducation = current.education.some(
    (e) => filled(e.school) || filled(e.degree),
  );

  return {
    fullName: pick(current.fullName, incoming.fullName),
    title: pick(current.title, incoming.title),
    email: pick(current.email, incoming.email),
    phone: pick(current.phone, incoming.phone),
    location: pick(current.location, incoming.location),
    portfolioUrl: pick(current.portfolioUrl, incoming.portfolioUrl),
    summary: pick(current.summary, incoming.summary),
    skills: current.skills.length > 0 ? current.skills : incoming.skills,
    experience:
      currentHasExperience || incoming.experience.length === 0
        ? current.experience
        : incoming.experience,
    education:
      currentHasEducation || incoming.education.length === 0
        ? current.education
        : incoming.education,
  };
}

/** Map a stored resume profile into the wizard's step-1 form shape. */
export function profileToFormValues(
  profile: ResumeProfileData,
): ProfileFormValues {
  return {
    fullName: profile.fullName,
    title: profile.title,
    email: profile.email,
    phone: profile.phone,
    location: profile.location,
    portfolioUrl: profile.portfolioUrl,
    summary: profile.summary,
    skills: profile.skills,
    experience: profile.experience.map((e) => ({
      company: e.company,
      title: e.title,
      startDate: e.startDate,
      endDate: e.endDate,
      bulletsText: e.bullets.join("\n"),
    })),
    education: profile.education,
  };
}
