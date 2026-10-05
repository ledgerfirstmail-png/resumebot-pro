import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { Email } from "@convex-dev/auth/providers/Email";
import {
  createAccount,
  invalidateSessions,
  modifyAccountCredentials,
  retrieveAccount,
  signInViaProvider,
} from "@convex-dev/auth/server";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";
import { Scrypt } from "lucia";
import { internal } from "../_generated/api";
import { emailOtp } from "./emailOtp";

/**
 * Tailorly's username + password provider (Convex Auth's ConvexCredentials —
 * the sanctioned way to handle a username-based credentials login).
 *
 * Flows (mirrors the Password provider, keyed by user name instead of email):
 * - "signUp":             create an account (unique user name + email).
 * - "signIn":             sign in with user name + password.
 * - "reset":              email a 6-digit reset code to the account's email.
 * - "reset-verification": verify the code, set the new password, sign in.
 *
 * The account id is the normalized user name; the real email lives on the
 * `users` document and is only used for password resets (never returned
 * to the client), so usernames can't be used to harvest emails.
 */

export const PROVIDER_ID = "tailorly";

/**
 * Password-reset code sender. Reuses the template's email transport, but
 * skips the Email provider's default `account.providerAccountId === email`
 * check: our accounts are keyed by user name, and the single-use, hashed,
 * 15-minute code is the actual secret (the documented `authorize: undefined`
 * override). Registered only as an extra provider of this credentials
 * provider — the template's own email-otp sign-in keeps its stricter check.
 */
const resetEmail = Email({
  id: "password-reset",
  maxAge: 60 * 15,
  authorize: undefined,
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    return generateRandomString(random, "0123456789", 6);
  },
  sendVerificationRequest: emailOtp.sendVerificationRequest,
});

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,31}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeUsername(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

function validatePassword(password: string): void {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  if (password.length > 200) {
    throw new Error("Password must be under 200 characters.");
  }
}

/** Same failure message for unknown user name and wrong password. */
function friendlyCredentialError(err: unknown): Error {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === "TooManyFailedAttempts") {
    return new Error(
      "Too many sign-in attempts — wait a few minutes, or reset your password.",
    );
  }
  return new Error("Incorrect user name or password.");
}

export const usernamePassword = ConvexCredentials({
  id: PROVIDER_ID,
  extraProviders: [resetEmail],
  crypto: {
    // Pure-JS scrypt from lucia — same hashing the Password provider uses,
    // and safe in Convex's default runtime (no node builtins).
    hashSecret: async (secret: string) => await new Scrypt().hash(secret),
    verifySecret: async (secret: string, hash: string) =>
      await new Scrypt().verify(hash, secret),
  },
  authorize: async (params, ctx) => {
    const flow = typeof params.flow === "string" ? params.flow : "";
    const email = normalizeEmail(params.email);
    const password = typeof params.password === "string" ? params.password : "";

    if (flow === "signUp") {
      const username = normalizeUsername(params.username);
      if (!USERNAME_RE.test(username)) {
        throw new Error(
          "User name must be 3–32 characters: lowercase letters, numbers, dot, dash, or underscore.",
        );
      }
      if (!EMAIL_RE.test(email)) {
        throw new Error("Enter a valid email address.");
      }
      validatePassword(password);
      const [nameTaken, mailTaken] = await Promise.all([
        ctx.runQuery(internal.accounts.usernameTaken, { username }),
        ctx.runQuery(internal.accounts.emailTaken, { email }),
      ]);
      if (nameTaken) {
        throw new Error("That user name is taken — pick another.");
      }
      if (mailTaken) {
        throw new Error(
          "An account with that email already exists — sign in instead.",
        );
      }
      try {
        const { user } = await createAccount(ctx, {
          provider: PROVIDER_ID,
          account: { id: username, secret: password },
          profile: {
            name:
              typeof params.username === "string"
                ? params.username.trim().slice(0, 64)
                : username,
            email,
          },
        });
        return { userId: user._id };
      } catch (err) {
        if (String(err).includes("already exists")) {
          throw new Error("That user name is taken — pick another.");
        }
        throw err;
      }
    }

    if (flow === "signIn") {
      const username = normalizeUsername(params.username);
      if (!username || !password) {
        throw new Error("Enter your user name and password.");
      }
      let retrieved;
      try {
        retrieved = await retrieveAccount(ctx, {
          provider: PROVIDER_ID,
          account: { id: username, secret: password },
        });
      } catch (err) {
        throw friendlyCredentialError(err);
      }
      if (retrieved === null) {
        throw new Error("Incorrect user name or password.");
      }
      return { userId: retrieved.user._id };
    }

    if (flow === "reset") {
      if (!EMAIL_RE.test(email)) {
        throw new Error("Enter a valid email address.");
      }
      const target = await ctx.runQuery(internal.accounts.resetTarget, {
        email,
      });
      if (target === null) {
        // Same response as success — don't reveal which emails exist.
        return null;
      }
      try {
        await signInViaProvider(ctx, resetEmail, {
          accountId: target.accountId,
          params: { email },
        });
      } catch (err) {
        // Never surface the mailer's raw error — but keep it server-side.
        console.error("[auth] reset email failed:", err);
        throw new Error(
          "We couldn't send the reset email right now — wait a minute and try again.",
        );
      }
      // "started": the code is emailed; the client stays signed out.
      return null;
    }

    if (flow === "reset-verification") {
      const newPassword =
        typeof params.newPassword === "string" ? params.newPassword : "";
      validatePassword(newPassword);
      const code = typeof params.code === "string" ? params.code.trim() : "";
      if (!code) {
        throw new Error("Enter the 6-digit code from your email.");
      }
      const invalidCode = new Error(
        "That code is incorrect or expired — request a new one.",
      );
      const target = await ctx.runQuery(internal.accounts.resetTarget, {
        email,
      });
      if (target === null) throw invalidCode;
      let verified: Awaited<ReturnType<typeof signInViaProvider>>;
      try {
        verified = await signInViaProvider(ctx, resetEmail, {
          params: { email, code },
        });
      } catch {
        throw invalidCode;
      }
      if (verified === null) throw invalidCode;
      await modifyAccountCredentials(ctx, {
        provider: PROVIDER_ID,
        account: { id: target.username, secret: newPassword },
      });
      await invalidateSessions(ctx, {
        userId: verified.userId,
        except: [verified.sessionId],
      });
      return { userId: verified.userId, sessionId: verified.sessionId };
    }

    throw new Error("Unknown sign-in flow.");
  },
});
