import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";

/** Every radar feature requires a signed-in account (same rule as resumes). */
async function requireUserId(ctx: MutationCtx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("You're signed out — sign in to continue.");
  }
  return userId;
}

const keywordList = v.array(v.string());

/** A normalized posting as stored by the search sweep (see jobSearch.ts). */
const postingValidator = v.object({
  source: v.string(),
  externalId: v.string(),
  title: v.string(),
  company: v.string(),
  description: v.string(),
  url: v.string(),
  location: v.string(),
  postedAt: v.optional(v.number()),
  score: v.number(),
  matchedKeywords: keywordList,
  missingKeywords: keywordList,
});

/** The owner's master profile stripped of Convex metadata (prompt/scoring shape). */
export const profileForMatch = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const doc = await ctx.db
      .query("resumeProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .first();
    if (!doc) return null;
    // Mirror of the client's ResumeProfileData without Convex metadata —
    // typed structurally (Convex's typecheck can't resolve src/ aliases).
    const profile = {
      fullName: doc.fullName,
      title: doc.title,
      email: doc.email,
      phone: doc.phone,
      location: doc.location,
      portfolioUrl: doc.portfolioUrl,
      summary: doc.summary,
      skills: doc.skills,
      experience: doc.experience,
      education: doc.education,
    };
    return { profileId: doc._id as Id<"resumeProfiles">, profile };
  },
});

/**
 * Insert or refresh radar matches for one owner. Dedupes on
 * (userId, source, externalId) so re-scans update scores instead of stacking
 * duplicates, never downgrades a tailored/applied status, and prunes stale
 * "new" rows past 150 so the table stays bounded.
 * Returns the freshly inserted postings (for watch alerts).
 */
export const upsertMatches = internalMutation({
  args: {
    userId: v.id("users"),
    items: v.array(postingValidator),
  },
  handler: async (ctx, { userId, items }) => {
    const fresh: Array<{
      jobId: Id<"jobMatches">;
      title: string;
      company: string;
      url: string;
      score: number;
    }> = [];
    let updated = 0;

    for (const item of items) {
      const existing = await ctx.db
        .query("jobMatches")
        .withIndex("by_user_source_ext", (q) =>
          q
            .eq("userId", userId)
            .eq("source", item.source)
            .eq("externalId", item.externalId),
        )
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          title: item.title,
          company: item.company,
          description: item.description,
          url: item.url,
          location: item.location,
          postedAt: item.postedAt,
          score: item.score,
          matchedKeywords: item.matchedKeywords,
          missingKeywords: item.missingKeywords,
        });
        updated += 1;
      } else {
        const jobId = await ctx.db.insert("jobMatches", {
          ...item,
          userId,
          status: "new",
          createdAt: Date.now(),
        });
        fresh.push({
          jobId,
          title: item.title,
          company: item.company,
          url: item.url,
          score: item.score,
        });
      }
    }

    // Prune: keep every tailored/applied row, cap plain "new" rows at 150.
    const all = await ctx.db
      .query("jobMatches")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    let keptNew = 0;
    for (const doc of all) {
      if (doc.status !== "new") continue;
      keptNew += 1;
      if (keptNew > 150) await ctx.db.delete(doc._id);
    }

    return { inserted: fresh.length, updated, fresh };
  },
});

/** The owner's radar matches, best score first (cap for the UI). */
export const listMatches = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    const docs = await ctx.db
      .query("jobMatches")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(200);
    return docs
      .sort((a, b) => b.score - a.score || b._creationTime - a._creationTime)
      .slice(0, 60);
  },
});

/** One radar match, owner-checked — used by auto-apply (ai.ts). */
export const getMatchForUser = internalQuery({
  args: { jobId: v.id("jobMatches"), userId: v.id("users") },
  handler: async (ctx, { jobId, userId }) => {
    const doc = await ctx.db.get(jobId);
    if (!doc || doc.userId !== userId) return null;
    return doc;
  },
});

/** Mark a listing as applied after auto-apply saved its resume. */
export const markApplied = internalMutation({
  args: {
    jobId: v.id("jobMatches"),
    userId: v.id("users"),
    resumeId: v.id("tailoredResumes"),
    tailoredScore: v.number(),
  },
  handler: async (ctx, { jobId, userId, resumeId, tailoredScore }) => {
    const doc = await ctx.db.get(jobId);
    if (!doc || doc.userId !== userId) return;
    await ctx.db.patch(jobId, {
      status: "applied",
      appliedAt: Date.now(),
      resumeId,
      tailoredScore,
    });
  },
});

/** Record a manual tailor pass from the radar (feature: raise the score). */
export const markTailored = mutation({
  args: { jobId: v.id("jobMatches"), score: v.number() },
  handler: async (ctx, { jobId, score }) => {
    const userId = await requireUserId(ctx);
    const doc = await ctx.db.get(jobId);
    if (!doc || doc.userId !== userId) {
      throw new Error("Listing not found.");
    }
    await ctx.db.patch(jobId, {
      tailoredScore: Math.max(0, Math.min(100, Math.round(score))),
      ...(doc.status === "new" ? { status: "tailored" as const } : {}),
    });
  },
});

const watchValidator = {
  query: v.string(),
  location: v.optional(v.string()),
  minScore: v.number(),
  email: v.optional(v.string()),
  emailEnabled: v.boolean(),
  telegramChatId: v.optional(v.string()),
  telegramEnabled: v.boolean(),
};

/** Create or update a watch (saved search with alerts). */
export const saveWatch = mutation({
  args: { id: v.optional(v.id("jobWatches")), ...watchValidator },
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const trimmedQuery = args.query.trim();
    if (trimmedQuery.length < 2) {
      throw new Error("Give the watch a search term to look for.");
    }
    if (args.emailEnabled && !(args.email ?? "").trim()) {
      throw new Error("Add an email address to receive email alerts.");
    }
    if (args.telegramEnabled && !(args.telegramChatId ?? "").trim()) {
      throw new Error("Find your Telegram chat ID first to receive alerts.");
    }
    const fields = {
      query: trimmedQuery.slice(0, 120),
      location: args.location?.trim().slice(0, 80) || undefined,
      minScore: Math.max(0, Math.min(95, Math.round(args.minScore))),
      email: args.email?.trim().slice(0, 200) || undefined,
      emailEnabled: args.emailEnabled,
      telegramChatId: args.telegramChatId?.trim().slice(0, 40) || undefined,
      telegramEnabled: args.telegramEnabled,
    };

    if (args.id) {
      const existing = await ctx.db.get(args.id);
      if (!existing || existing.userId !== userId) {
        throw new Error("Watch not found.");
      }
      await ctx.db.patch(args.id, fields);
      return args.id;
    }

    const mine = await ctx.db
      .query("jobWatches")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    if (mine.length >= 10) {
      throw new Error("You already have 10 watches — delete one to add more.");
    }
    return await ctx.db.insert("jobWatches", {
      ...fields,
      userId,
      createdAt: Date.now(),
    });
  },
});

export const deleteWatch = mutation({
  args: { watchId: v.id("jobWatches") },
  handler: async (ctx, { watchId }) => {
    const userId = await requireUserId(ctx);
    const doc = await ctx.db.get(watchId);
    if (!doc || doc.userId !== userId) throw new Error("Watch not found.");
    await ctx.db.delete(watchId);
  },
});

export const listWatches = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return [];
    return await ctx.db
      .query("jobWatches")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20);
  },
});

/** One specific watch, owner-checked (for the client's "Run now"). */
export const getWatch = internalQuery({
  args: { watchId: v.id("jobWatches"), userId: v.optional(v.id("users")) },
  handler: async (ctx, { watchId, userId }) => {
    const doc = await ctx.db.get(watchId);
    if (!doc) return null;
    if (userId && doc.userId !== userId) return null;
    return doc;
  },
});

/** Watches due for a sweep (cron path: no user, oldest first, max 20). */
export const dueWatches = internalQuery({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 50 * 60_000; // hourly cron, 50min debounce
    // Small table — scan and filter in JS so watches that have never run
    // (lastRunAt unset) are definitely included.
    const all = await ctx.db.query("jobWatches").take(200);
    return all
      .filter((w) => (w.lastRunAt ?? 0) < cutoff)
      .sort((a, b) => (a.lastRunAt ?? 0) - (b.lastRunAt ?? 0))
      .slice(0, 20);
  },
});

/** Store the human-readable outcome of a watch sweep. */
export const recordWatchRun = internalMutation({
  args: {
    watchId: v.id("jobWatches"),
    lastRunAt: v.number(),
    lastStatus: v.string(),
  },
  handler: async (ctx, { watchId, lastRunAt, lastStatus }) => {
    await ctx.db.patch(watchId, { lastRunAt, lastStatus });
  },
});
