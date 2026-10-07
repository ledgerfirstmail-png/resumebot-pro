import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation } from "./_generated/server";

/**
 * Permanently delete the caller's account (Settings → danger zone). Removes
 * every owned row — profiles, tailored resumes, radar matches, watches — then
 * the auth cascade (sessions + refresh tokens + verifiers, verification
 * codes, accounts) and finally the user itself. Shared state (geoCache) and
 * the anonymous AI budget rows (aiCalls/aiRuns, keyed by client session id,
 * not account) are deliberately left alone. Irreversible; the client signs
 * out after it returns.
 */
export const deleteAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("You're signed out.");

    // Owned app data. tailoredResumes first is not required (no FK), but the
    // order keeps the dashboard's reads consistent mid-delete.
    for (const row of await ctx.db
      .query("tailoredResumes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()) {
      await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db
      .query("resumeProfiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()) {
      await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db
      .query("jobMatches")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()) {
      await ctx.db.delete(row._id);
    }
    for (const row of await ctx.db
      .query("jobWatches")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect()) {
      await ctx.db.delete(row._id);
    }

    // Auth cascade: sessions own refresh tokens and PKCE verifiers.
    for (const session of await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .collect()) {
      for (const token of await ctx.db
        .query("authRefreshTokens")
        .withIndex("sessionId", (q) => q.eq("sessionId", session._id))
        .collect()) {
        await ctx.db.delete(token._id);
      }
      for (const verifier of await ctx.db
        .query("authVerifiers")
        .filter((q) => q.eq(q.field("sessionId"), session._id))
        .collect()) {
        await ctx.db.delete(verifier._id);
      }
      await ctx.db.delete(session._id);
    }

    // Accounts own verification codes (OTP/magic-link tokens).
    for (const account of await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) => q.eq("userId", userId))
      .collect()) {
      for (const code of await ctx.db
        .query("authVerificationCodes")
        .withIndex("accountId", (q) => q.eq("accountId", account._id))
        .collect()) {
        await ctx.db.delete(code._id);
      }
      await ctx.db.delete(account._id);
    }

    await ctx.db.delete(userId);
    return { deleted: true };
  },
});
