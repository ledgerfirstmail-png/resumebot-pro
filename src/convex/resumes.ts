import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { scoreLabelValidator } from "./schema";

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

/** Upsert the (single) master resume profile. */
export const saveProfile = mutation({
  args: { profile: profileValidator },
  handler: async (ctx, { profile }) => {
    const existing = await ctx.db
      .query("resumeProfiles")
      .order("desc")
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { ...profile, updatedAt: Date.now() });
      return existing._id;
    }

    return await ctx.db.insert("resumeProfiles", {
      ...profile,
      updatedAt: Date.now(),
    });
  },
});

/** The master resume profile, or null if it hasn't been built yet. */
export const getProfile = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("resumeProfiles").order("desc").first();
  },
});

/** All tailored resumes, newest first. */
export const listResumes = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("tailoredResumes").order("desc").collect();
  },
});

export const deleteResume = mutation({
  args: { resumeId: v.id("tailoredResumes") },
  handler: async (ctx, { resumeId }) => {
    const resume = await ctx.db.get(resumeId);
    if (!resume) throw new Error("Resume not found");
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
    breakdown: breakdownValidator,
  },
  handler: async (ctx, args) => {
    const profile = await ctx.db.get(args.profileId);
    if (!profile) throw new Error("Profile not found");
    return await ctx.db.insert("tailoredResumes", {
      ...args,
      createdAt: Date.now(),
    });
  },
});
