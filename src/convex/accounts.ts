import {
  getAuthSessionId,
  getAuthUserId,
  invalidateSessions,
  modifyAccountCredentials,
} from "@convex-dev/auth/server";
import { Scrypt } from "lucia";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalQuery } from "./_generated/server";
import { PROVIDER_ID, validatePassword } from "./auth/usernamePassword";

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

/**
 * Change the signed-in user's own password (pass-6 follow-up: session
 * management). Verifies the current password, hashes the new one with the
 * same lucia-Scrypt scheme the credentials provider uses, and signs out
 * every OTHER session, keeping the current one.
 *
 * Verifying with Scrypt directly (rather than the provider's
 * `retrieveAccount`) intentionally skips the sign-in failed-attempt rate
 * limiter: this only runs for an authenticated user changing their own
 * password, and they can always reset it via email anyway.
 */
/**
 * The signed-in user's password account: provider account id + the stored
 * scrypt hash. null when the account has no password (anonymous/email).
 */
export const passwordAccount = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const account = await ctx.db
      .query("authAccounts")
      .withIndex("userIdAndProvider", (q) =>
        q.eq("userId", userId).eq("provider", PROVIDER_ID),
      )
      .unique();
    if (!account?.secret) return null;
    return {
      providerAccountId: account.providerAccountId,
      secret: account.secret,
    };
  },
});

export const changePassword = action({
  args: { currentPassword: v.string(), newPassword: v.string() },
  handler: async (ctx, { currentPassword, newPassword }) => {
    const userId = await getAuthUserId(ctx);
    const session = await getAuthSessionId(ctx);
    if (userId === null || session === null) {
      throw new Error("You're signed out — sign in to change your password.");
    }
    validatePassword(newPassword);
    if (currentPassword === newPassword) {
      throw new Error("That's already your password — pick a new one.");
    }

    const account = await ctx.runQuery(internal.accounts.passwordAccount, {
      userId,
    });
    if (!account) {
      throw new Error(
        "This account doesn't use a password — sign in with your user name.",
      );
    }

    const currentOk = await new Scrypt().verify(
      account.secret,
      currentPassword,
    );
    if (!currentOk) {
      throw new Error("Your current password is incorrect.");
    }

    await modifyAccountCredentials(ctx, {
      provider: PROVIDER_ID,
      account: { id: account.providerAccountId, secret: newPassword },
    });
    await invalidateSessions(ctx, { userId, except: [session] });
    return { ok: true };
  },
});
