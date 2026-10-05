import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

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
