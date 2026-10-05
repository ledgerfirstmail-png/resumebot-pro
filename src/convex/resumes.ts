import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, internalMutation, query, type MutationCtx } from "./_generated/server";
import { scoreLabelValidator, type ScoreLabel } from "./schema";

/** Every resume feature requires a signed-in account. */
async function requireUserId(ctx: MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("You're signed out — sign in to continue.");
  }
  return userId;
}

const experienceValidator = v.object({
  company: v.string(),
  title: v.string(),
  startDate: v.string(),
  endDate: v.string(),
  bullets: v.array(v.string()),
});

const educationValidator = v.object({
  school: v.string(),
  degree: v.string(),
  gradYear: v.string(),
});

const profileValidator = v.object({
  fullName: v.string(),
  title: v.string(),
  email: v.string(),
  phone: v.string(),
  location: v.string(),
  portfolioUrl: v.string(),
  summary: v.string(),
  skills: v.array(v.string()),
  experience: v.array(experienceValidator),
  education: v.array(educationValidator),
});

/** Upsert the caller's master resume profile. */
export const saveProfile = mutation({
  args: { profile: profileValidator },
  handler: async (ctx, { profile }) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("resumeProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { ...profile, updatedAt: Date.now() });
      return existing._id;
    }

    return await ctx.db.insert("resumeProfiles", {
      ...profile,
      userId,
      updatedAt: Date.now(),
    });
  },
});

/** The caller's master resume profile, or null if it hasn't been built yet. */
export const getProfile = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;
    return await ctx.db
      .query("resumeProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
  },
});

/** The caller's tailored resumes, newest first. */
export const listResumes = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("tailoredResumes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const deleteResume = mutation({
  args: { resumeId: v.id("tailoredResumes") },
  handler: async (ctx, { resumeId }) => {
    const userId = await requireUserId(ctx);
    const resume = await ctx.db.get(resumeId);
    if (!resume) throw new Error("Resume not found");
    if (resume.userId !== userId) throw new Error("Resume not found");
    await ctx.db.delete(resumeId);
  },
});

const breakdownValidator = v.array(
  v.object({
    label: scoreLabelValidator,
    score: v.number(),
    maxScore: v.number(),
    note: v.string(),
  }),
);

const applicationKitValidator = v.object({
  coverLetter: v.string(),
  whyThisRole: v.string(),
  answers: v.array(v.object({ question: v.string(), answer: v.string() })),
});

/** Persist a freshly tailored resume into the saved collection. */
export const saveResume = mutation({
  args: {
    profileId: v.id("resumeProfiles"),
    companyName: v.string(),
    jobTitle: v.string(),
    jobDescription: v.string(),
    score: v.number(),
    summary: v.string(),
    skills: v.array(v.string()),
    experience: v.array(experienceValidator),
    education: v.array(educationValidator),
    keywords: v.array(v.string()),
    missingKeywords: v.optional(v.array(v.string())),
    applicationKit: v.optional(applicationKitValidator),
    breakdown: breakdownValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    return await persistResume(ctx, userId, args);
  },
});

/**
 * Auto-apply path: the action has already verified the caller, so this
 * internal mutation takes the owner explicitly. Same de-duplication rules as
 * saveResume (re-applying to a job replaces its previous copy).
 */
export const insertResume = internalMutation({
  args: {
    userId: v.id("users"),
    profileId: v.id("resumeProfiles"),
    companyName: v.string(),
    jobTitle: v.string(),
    jobDescription: v.string(),
    score: v.number(),
    summary: v.string(),
    skills: v.array(v.string()),
    experience: v.array(experienceValidator),
    education: v.array(educationValidator),
    keywords: v.array(v.string()),
    missingKeywords: v.optional(v.array(v.string())),
    applicationKit: v.optional(applicationKitValidator),
    breakdown: breakdownValidator,
  },
  handler: async (ctx, { userId, ...args }) => {
    return await persistResume(ctx, userId, args);
  },
});

interface ResumeArgs {
  profileId: Id<"resumeProfiles">;
  companyName: string;
  jobTitle: string;
  jobDescription: string;
  score: number;
  summary: string;
  skills: string[];
  experience: Array<{
    company: string;
    title: string;
    startDate: string;
    endDate: string;
    bullets: string[];
  }>;
  education: Array<{ school: string; degree: string; gradYear: string }>;
  keywords: string[];
  missingKeywords?: string[];
  applicationKit?: {
    coverLetter: string;
    whyThisRole: string;
    answers: Array<{ question: string; answer: string }>;
  };
  breakdown: Array<{
    label: ScoreLabel;
    score: number;
    maxScore: number;
    note: string;
  }>;
}

/** Shared insert/replace logic for both save paths. */
async function persistResume(
  ctx: MutationCtx,
  userId: Id<"users">,
  args: ResumeArgs,
): Promise<Id<"tailoredResumes">> {
  const profile = await ctx.db.get(args.profileId);
  if (!profile || profile.userId !== userId) {
    throw new Error("Profile not found");
  }

  const { missingKeywords, applicationKit, ...rest } = args;
  const doc = {
    ...rest,
    userId,
    missingKeywords: missingKeywords ?? [],
    ...(applicationKit ? { applicationKit } : {}),
  };

  // De-duplicate: re-saving the same job replaces the previous version
  // instead of stacking near-identical cards.
  const existing = await ctx.db
    .query("tailoredResumes")
    .withIndex("by_profile", (q) => q.eq("profileId", args.profileId))
    .collect();
  const duplicate = existing.find(
    (r) =>
      r.jobTitle.trim().toLowerCase() ===
        args.jobTitle.trim().toLowerCase() &&
      r.companyName.trim().toLowerCase() === args.companyName.trim().toLowerCase(),
  );
  if (duplicate) {
    await ctx.db.patch(duplicate._id, { ...doc, createdAt: Date.now() });
    return duplicate._id;
  }

  return await ctx.db.insert("tailoredResumes", {
    ...doc,
    createdAt: Date.now(),
  });
}
