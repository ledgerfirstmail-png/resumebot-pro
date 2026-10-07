import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { aiRunKindValidator } from "./schema";

/**
 * Daily budget of AI tailoring runs per browser session. Login was removed,
 * so this is the only thing standing between an open deployment URL and the
 * integration credits.
 */
export const MAX_AI_CALLS_PER_DAY = 25;

/** How many tailoring runs this session has used today. */
export const getUsage = internalQuery({
  args: { sessionId: v.string(), day: v.string() },
  handler: async (ctx, { sessionId, day }) => {
    const record = await ctx.db
      .query("aiCalls")
      .withIndex("by_session_day", (q) =>
        q.eq("sessionId", sessionId).eq("day", day),
      )
      .unique();
    return record?.count ?? 0;
  },
});

/** Count one attempted tailoring run (called before the AI call). */
export const recordCall = internalMutation({
  args: { sessionId: v.string(), day: v.string() },
  handler: async (ctx, { sessionId, day }) => {
    const record = await ctx.db
      .query("aiCalls")
      .withIndex("by_session_day", (q) =>
        q.eq("sessionId", sessionId).eq("day", day),
      )
      .unique();
    if (record) {
      await ctx.db.patch(record._id, { count: record.count + 1 });
    } else {
      await ctx.db.insert("aiCalls", {
        sessionId,
        day,
        count: 1,
        createdAt: Date.now(),
      });
    }
  },
});

/**
 * Record one AI run (success or failure) for observability. Fields are capped
 * defensively so a hostile/erroring provider response can't bloat the table.
 * Callers never fail the user-facing action if this insert fails.
 */
export const logRun = internalMutation({
  args: {
    sessionId: v.string(),
    kind: aiRunKindValidator,
    ok: v.boolean(),
    error: v.optional(v.string()),
    score: v.optional(v.number()),
    tokensIn: v.optional(v.number()),
    tokensOut: v.optional(v.number()),
    credits: v.optional(v.number()),
    durationMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const finite = (n: number | undefined) =>
      typeof n === "number" && Number.isFinite(n) ? n : undefined;
    await ctx.db.insert("aiRuns", {
      ...args,
      error: args.error ? args.error.slice(0, 400) : undefined,
      score:
        typeof args.score === "number" && Number.isFinite(args.score)
          ? Math.max(0, Math.min(100, Math.round(args.score)))
          : undefined,
      tokensIn: finite(args.tokensIn),
      tokensOut: finite(args.tokensOut),
      credits: finite(args.credits),
      durationMs: (() => {
        const d = finite(args.durationMs);
        return d !== undefined && d >= 0 ? Math.round(d) : undefined;
      })(),
      createdAt: Date.now(),
    });
  },
});

/** Recent AI runs, for `convex run` inspection of failures/usage. */
export const recentRuns = internalQuery({
  args: {},
  handler: async (ctx) => {
    const runs = await ctx.db.query("aiRuns").order("desc").take(50);
    return runs.map((r) => ({
      _id: r._id,
      createdAt: r.createdAt,
      sessionId: r.sessionId,
      kind: r.kind,
      ok: r.ok,
      error: r.error,
      score: r.score,
      tokensIn: r.tokensIn,
      tokensOut: r.tokensOut,
      credits: r.credits,
      durationMs: r.durationMs,
    }));
  },
});

/**
 * Today's AI usage for the signed-in account — surfaced in the dashboard so
 * the daily budget is visible instead of a surprise (E7 remainder): calls
 * used vs. the limit, run counts/failures, and token/credit spend over the
 * last 24 hours from the structured run log. Keyed by the account's budget
 * key (server-derived), so one browser can't read another's spend.
 */
export const usageSummary = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) {
      return {
        usedToday: 0,
        limit: MAX_AI_CALLS_PER_DAY,
        runsToday: 0,
        failuresToday: 0,
        tokensIn: 0,
        tokensOut: 0,
        credits: 0,
      };
    }
    const sessionId = `user:${userId}`;
    const day = new Date().toISOString().slice(0, 10);
    const record = await ctx.db
      .query("aiCalls")
      .withIndex("by_session_day", (q) =>
        q.eq("sessionId", sessionId).eq("day", day),
      )
      .unique();

    const since = Date.now() - 24 * 3_600_000;
    const runs = await ctx.db
      .query("aiRuns")
      .withIndex("by_session_time", (q) =>
        q.eq("sessionId", sessionId).gte("createdAt", since),
      )
      .order("desc")
      .take(100);

    let tokensIn = 0;
    let tokensOut = 0;
    let credits = 0;
    let failures = 0;
    for (const run of runs) {
      tokensIn += run.tokensIn ?? 0;
      tokensOut += run.tokensOut ?? 0;
      credits += run.credits ?? 0;
      if (!run.ok) failures += 1;
    }

    return {
      usedToday: record?.count ?? 0,
      limit: MAX_AI_CALLS_PER_DAY,
      runsToday: runs.length,
      failuresToday: failures,
      tokensIn,
      tokensOut,
      credits: credits > 0 ? credits : 0,
    };
  },
});
