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
