import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { PROVIDER_ID } from "./auth/usernamePassword";

/**
 * Internal lookups backing the username/password provider. Kept out of the
 * provider file so queries stay in the default Convex runtime.
 */

/** Does this user name already have an account? */
export const usernameTaken = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", PROVIDER_ID).eq("providerAccountId", username),
      )
      .unique();
    return account !== null;
  },
});

/** Is this email already registered? */
export const emailTaken = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .order("desc")
      .first();
    return user !== null;
  },
});

/**
 * Resolve an email to its password-reset target: the auth account id
 * (for sending the code) and the username (for updating the password).
 * Returns null when nothing matches — callers stay silent to avoid
 * revealing which emails are registered.
 */
export const resetTarget = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    const user = await ctx.db
      .query("users")
      .withIndex("email", (q) => q.eq("email", email))
      .order("desc")
      .first();
    const username = user?.name?.trim().toLowerCase() ?? null;
    if (!user || !username) return null;
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("providerAndAccountId", (q) =>
        q.eq("provider", PROVIDER_ID).eq("providerAccountId", username),
      )
      .unique();
    if (account === null) return null;
    return { accountId: account._id, username };
  },
});
