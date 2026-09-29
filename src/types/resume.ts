/** Shared types for resume profiles and tailored resumes (mirrors the Convex schema). */

export interface ExperienceEntry {
  company: string;
  title: string;
  startDate: string;
  endDate: string;
  bullets: string[];
}

export interface EducationEntry {
  school: string;
  degree: string;
  gradYear: string;
}

export type ScoreLabel =
  | "Skills"
  | "Experience"
  | "Education"
  | "Summary"
  | "Formatting";

export interface ScoreBreakdownEntry {
  label: ScoreLabel;
  score: number;
  maxScore: number;
  note: string;
}

export interface ResumeProfileData {
  fullName: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  portfolioUrl: string;
  summary: string;
  skills: string[];
  experience: ExperienceEntry[];
  education: EducationEntry[];
}

export const EMPTY_PROFILE: ResumeProfileData = {
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
};
