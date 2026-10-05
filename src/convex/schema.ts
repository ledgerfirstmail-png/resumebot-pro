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
    // One per user; upserted by the wizard before tailoring.
    resumeProfiles: defineTable({
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
    }),

    // A tailored resume generated for one job posting, with its match score
    // and per-category breakdown so the workspace can show progress without
    // re-running the AI.
    tailoredResumes: defineTable({
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
    }).index("by_profile", ["profileId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;
