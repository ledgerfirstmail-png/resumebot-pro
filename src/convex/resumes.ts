import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, internalMutation, query, type MutationCtx } from "./_generated/server";
import { scoreLabelValidator, type ScoreLabel } from "./schema";
import { isValidShareSlug, makeShareSlug } from "@/lib/shareLink";
import { normalizeProfileName } from "@/lib/resumeSchemas";

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

/** Normalized profile name arg (empty string → undefined = unnamed). */
const profileNameArg = v.optional(
  v.union(
    v.string(),
    v.null(),
  ),
);

function cleanProfileName(name: string | null | undefined): string | undefined {
  if (typeof name !== "string") return undefined;
  const cleaned = normalizeProfileName(name);
  return cleaned ?? undefined;
}

/** Upsert the caller's master resume profile. */
export const saveProfile = mutation({
  args: {
    profile: profileValidator,
    name: profileNameArg,
    // E12 — target an explicit profile. When absent, upserts the newest.
    profileId: v.optional(v.id("resumeProfiles")),
  },
  handler: async (ctx, { profile, name, profileId }) => {
    const userId = await requireUserId(ctx);
    const existing =
      profileId !== undefined
        ? // Explicit target must belong to the caller.
          await ctx.db.get(profileId).then((p) =>
            p && p.userId === userId
              ? p
              : (() => {
                  throw new Error("Profile not found");
                })(),
          )
        : await ctx.db
            .query("resumeProfiles")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .order("desc")
            .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...profile,
        ...(name !== undefined ? { name: cleanProfileName(name) } : {}),
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    return await ctx.db.insert("resumeProfiles", {
      ...profile,
      userId,
      name: cleanProfileName(name),
      updatedAt: Date.now(),
    });
  },
});

/**
 * E12 — create an additional named profile (never upserts). A user keeps
 * several master profiles ("Engineering", "Management") and tailors each
 * against different jobs. Returns the new profile id.
 */
export const createProfile = mutation({
  args: { profile: profileValidator, name: profileNameArg },
  handler: async (ctx, { profile, name }) => {
    const userId = await requireUserId(ctx);
    return await ctx.db.insert("resumeProfiles", {
      ...profile,
      userId,
      name: cleanProfileName(name),
      updatedAt: Date.now(),
    });
  },
});

/** The caller's master profile, or null if it hasn't been built yet. */
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

/**
 * E12 — every profile the caller owns, oldest first (creation order), so
 * switchers render stable labels. The newest profile remains the dashboard
 * fallback via getProfile.
 */
export const listProfiles = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const all = await ctx.db
      .query("resumeProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return all.sort((a, b) => a._creationTime - b._creationTime);
  },
});

/**
 * E12 — delete an empty profile. Refuses when tailored resumes still point
 * at it (they'd lose their contact block, application context, and share
 * links); the owner deletes or re-points those first.
 */
export const deleteProfile = mutation({
  args: { profileId: v.id("resumeProfiles") },
  handler: async (ctx, { profileId }) => {
    const userId = await requireUserId(ctx);
    const profile = await ctx.db.get(profileId);
    if (!profile || profile.userId !== userId) {
      throw new Error("Profile not found");
    }
    const attached = await ctx.db
      .query("tailoredResumes")
      .withIndex("by_profile", (q) => q.eq("profileId", profileId))
      .first();
    if (attached) {
      throw new Error(
        "This profile still has tailored resumes — delete those first, or keep the profile.",
      );
    }
    await ctx.db.delete(profileId);
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

/**
 * E11 — mint (or return the existing) public share slug for a saved resume.
 * The link is read-only: there is no public mutation path, only the viewer.
 */
export const createShareLink = mutation({
  args: { resumeId: v.id("tailoredResumes") },
  handler: async (ctx, { resumeId }) => {
    const userId = await requireUserId(ctx);
    const resume = await ctx.db.get(resumeId);
    if (!resume || resume.userId !== userId) throw new Error("Resume not found");
    if (resume.shareSlug) return resume.shareSlug;

    // Retry a few times in the (astronomically unlikely) collision case.
    for (let attempt = 0; attempt < 5; attempt++) {
      const slug = makeShareSlug();
      const taken = await ctx.db
        .query("tailoredResumes")
        .withIndex("by_share_slug", (q) => q.eq("shareSlug", slug))
        .first();
      if (taken) continue;
      await ctx.db.patch(resumeId, { shareSlug: slug });
      return slug;
    }
    throw new Error("Couldn't create a share link — try again.");
  },
});

/** Turn the public link off — the slug is cleared and /r/<slug> stops resolving. */
export const revokeShareLink = mutation({
  args: { resumeId: v.id("tailoredResumes") },
  handler: async (ctx, { resumeId }) => {
    const userId = await requireUserId(ctx);
    const resume = await ctx.db.get(resumeId);
    if (!resume || resume.userId !== userId) throw new Error("Resume not found");
    await ctx.db.patch(resumeId, { shareSlug: undefined });
  },
});

/**
 * Public, read-only view of a shared resume. Deliberately sanitized: no
 * owner id, no original job posting, no application kit, no internal gap
 * notes — just the resume itself plus the contact block from the profile.
 */
export const getSharedResume = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const normalized = slug.trim().toLowerCase();
    if (!isValidShareSlug(normalized)) return null;

    const resume = await ctx.db
      .query("tailoredResumes")
      .withIndex("by_share_slug", (q) => q.eq("shareSlug", normalized))
      .unique();
    if (!resume) return null;

    const profile = await ctx.db.get(resume.profileId);
    return {
      jobTitle: resume.jobTitle,
      companyName: resume.companyName,
      score: resume.score,
      breakdown: resume.breakdown,
      summary: resume.summary,
      skills: resume.skills,
      experience: resume.experience,
      education: resume.education,
      keywords: resume.keywords,
      createdAt: resume.createdAt,
      contact: profile
        ? {
            fullName: profile.fullName,
            title: profile.title,
            email: profile.email,
            phone: profile.phone,
            location: profile.location,
            portfolioUrl: profile.portfolioUrl,
          }
        : null,
    };
  },
});
