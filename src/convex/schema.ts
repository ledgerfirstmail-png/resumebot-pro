import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

// Score breakdown categories used by the AI tailoring engine.
export const scoreLabelValidator = v.union(
  v.literal("Skills"),
  v.literal("Experience"),
  v.literal("Education"),
  v.literal("Summary"),
  v.literal("Formatting"),
);
export type ScoreLabel = Infer<typeof scoreLabelValidator>;

// AI operations tracked in the structured run log (see aiUsage.logRun).
export const aiRunKindValidator = v.union(
  v.literal("tailor"),
  v.literal("kit"),
  v.literal("extract"),
);
export type AiRunKind = Infer<typeof aiRunKindValidator>;

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

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // The user's master resume profile — contact info, skills, experience, education.
    // One per signed-in user; upserted by the wizard before tailoring.
    resumeProfiles: defineTable({
      // Owner (absent only on legacy pre-login docs).
      userId: v.optional(v.id("users")),
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
      updatedAt: v.number(),
    }).index("by_user", ["userId"]),

    // A tailored resume generated for one job posting, with its match score
    // and per-category breakdown so the workspace can show progress without
    // re-running the AI.
    tailoredResumes: defineTable({
      // Owner — keeps every saved resume private to its account.
      userId: v.optional(v.id("users")),
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
      breakdown: v.array(
        v.object({
          label: scoreLabelValidator,
          score: v.number(),
          maxScore: v.number(),
          note: v.string(),
        }),
      ),
      createdAt: v.number(),
      // High-value posting terms the tailored resume still doesn't cover —
      // drives the gap checklist and the "boost to 90" re-tailor.
      missingKeywords: v.optional(v.array(v.string())),
      // Copy-ready application material generated for this job, if any.
      applicationKit: v.optional(
        v.object({
          coverLetter: v.string(),
          whyThisRole: v.string(),
          answers: v.array(
            v.object({ question: v.string(), answer: v.string() }),
          ),
        }),
      ),
    })
      .index("by_profile", ["profileId"])
      .index("by_user", ["userId"]),

    // One row per (session, day) counting AI tailoring calls, so the
    // login-free tailorResume action has a hard daily budget.
    aiCalls: defineTable({
      sessionId: v.string(),
      day: v.string(),
      count: v.number(),
      createdAt: v.number(),
    }).index("by_session_day", ["sessionId", "day"]),

    // Structured log of AI runs: outcome, failure reason, token/credit usage,
    // and duration — so failures are visible without digging through client
    // console output (ROADMAP D6).
    aiRuns: defineTable({
      sessionId: v.string(),
      kind: aiRunKindValidator,
      ok: v.boolean(),
      // Failure reason, capped in logRun before insert.
      error: v.optional(v.string()),
      // Tailor runs only: the match score that was produced.
      score: v.optional(v.number()),
      // Token usage + credits billed for the run, when the provider reports it.
      tokensIn: v.optional(v.number()),
      tokensOut: v.optional(v.number()),
      credits: v.optional(v.number()),
      durationMs: v.optional(v.number()),
      createdAt: v.number(),
    }).index("by_kind", ["kind"]),

    // One live job listing found by the Job Radar search, scored against the
    // owner's profile with the deterministic matcher (lib/matchScore).
    jobMatches: defineTable({
      userId: v.id("users"),
      // Which board it came from (remotive | remoteok | arbeitnow).
      source: v.string(),
      // Stable id/slug on that board — dedupe key with userId.
      externalId: v.string(),
      title: v.string(),
      company: v.string(),
      // Plain-text posting, capped before insert.
      description: v.string(),
      url: v.string(),
      location: v.string(),
      postedAt: v.optional(v.number()),
      // Deterministic 0–100 fit vs the profile at search time.
      score: v.number(),
      matchedKeywords: v.array(v.string()),
      missingKeywords: v.array(v.string()),
      // new → tailored (AI reworked the resume for it) → applied.
      status: v.union(
        v.literal("new"),
        v.literal("tailored"),
        v.literal("applied"),
      ),
      // AI score from the tailor pass, when one ran.
      tailoredScore: v.optional(v.number()),
      // Saved resume produced by auto-apply / tailoring for this posting.
      resumeId: v.optional(v.id("tailoredResumes")),
      appliedAt: v.optional(v.number()),
      createdAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_user_score", ["userId", "score"])
      .index("by_user_source_ext", ["userId", "source", "externalId"]),

    // A saved Job Radar search that sweeps for new postings and alerts the
    // owner by email (Resend) and/or Telegram when a fresh match clears the
    // minimum score.
    jobWatches: defineTable({
      userId: v.id("users"),
      query: v.string(),
      location: v.optional(v.string()),
      // Only alert on matches at or above this score.
      minScore: v.number(),
      email: v.optional(v.string()),
      emailEnabled: v.boolean(),
      telegramChatId: v.optional(v.string()),
      telegramEnabled: v.boolean(),
      lastRunAt: v.optional(v.number()),
      // Human-readable outcome of the last sweep (sent/skipped/failed + count).
      lastStatus: v.optional(v.string()),
      createdAt: v.number(),
    }).index("by_user", ["userId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
