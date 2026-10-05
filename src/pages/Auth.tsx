import logo from "@/assets/logo.svg";
import { ClayButton } from "@/components/clay/ClayButton";
import { ClayCard } from "@/components/clay/ClayCard";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import { Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";

type Mode = "signin" | "signup" | "reset" | "reset-code";

const FIELD_INPUT =
  "clay-inset h-11 w-full rounded-2xl px-4 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:ring-4 focus-visible:ring-ring/30";
const FIELD_PASSWORD =
  FIELD_INPUT + " pr-11";
const USERNAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,31}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Keep post-auth navigation inside the app (no open redirects). */
function safeReturnTo(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//")
    ? raw
    : "/dashboard";
}

/** Convex wraps uncaught server errors — keep only the readable message. */
function readableError(err: unknown, fallback: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  const match = raw.match(/Uncaught (?:Convex )?Error: ([^\n]+)/);
  const msg = (match?.[1] ?? raw).trim();
  return msg.length > 0 && msg.length <= 220 ? msg : fallback;
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {children}
      {error && (
        <span className="text-xs font-semibold text-rose-600">{error}</span>
      )}
    </label>
  );
}

/**
 * Sign in / create account / reset password. Login is user name + password;
 * account creation captures the email used for the emailed reset code.
 */
export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const returnTo = safeReturnTo(searchParams.get("returnTo"));

  const [mode, setMode] = useState<Mode>("signin");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  // Flips after a successful sign-in; we navigate once the client confirms.
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    // Fires for already-signed-in visits and once any successful flow
    // (sign in, sign up, reset-verification) confirms the session.
    if (isAuthenticated) {
      navigate(returnTo, { replace: true });
    }
  }, [isAuthenticated, navigate, returnTo]);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError("");
    setInfo("");
  };

  const run = async (action: () => Promise<{ signingIn: boolean }>) => {
    setBusy(true);
    setError("");
    try {
      const result = await action();
      if (result.signingIn) setSignedIn(true);
      return result;
    } catch (err) {
      setError(
        readableError(err, "Something went wrong — check your details and try again."),
      );
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (mode === "signin") {
      if (!username.trim() || !password) {
        setError("Enter your user name and password.");
        return;
      }
      await run(() =>
        signIn("tailorly", {
          username: username.trim(),
          password,
          flow: "signIn",
        }),
      );
      return;
    }

    if (mode === "signup") {
      if (!USERNAME_RE.test(username.trim())) {
        setError(
          "User name must be 3–32 characters: letters, numbers, dot, dash, or underscore.",
        );
        return;
      }
      if (!EMAIL_RE.test(email.trim())) {
        setError("Enter a valid email address.");
        return;
      }
      if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
      }
      await run(() =>
        signIn("tailorly", {
          username: username.trim(),
          email: email.trim(),
          password,
          flow: "signUp",
        }),
      );
      return;
    }

    if (mode === "reset") {
      if (!EMAIL_RE.test(email.trim())) {
        setError("Enter a valid email address.");
        return;
      }
      const result = await run(() =>
        signIn("tailorly", { email: email.trim(), flow: "reset" }),
      );
      if (result && !result.signingIn) {
        setMode("reset-code");
        setInfo(
          "If that email has an account, a 6-digit code is on its way. It expires in 15 minutes.",
        );
      }
      return;
    }

    // reset-code
    if (!/^\d{6}$/.test(code.trim())) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    await run(() =>
      signIn("tailorly", {
        email: email.trim(),
        code: code.trim(),
        newPassword,
        flow: "reset-verification",
      }),
    );
  };

  const titles: Record<Mode, { title: string; subtitle: string }> = {
    signin: {
      title: "Welcome back",
      subtitle: "Sign in with your user name and password.",
    },
    signup: {
      title: "Create your account",
      subtitle:
        "Pick a user name, add your email for password recovery, and set a password (8+ characters).",
    },
    reset: {
      title: "Reset your password",
      subtitle: "Enter the email on your account and we'll email you a code.",
    },
    "reset-code": {
      title: "Check your email",
      subtitle:
        "Enter the 6-digit code we sent you, then choose a new password.",
    },
  };

  return (
    <main className="clay-bg flex min-h-screen flex-col items-center justify-center gap-6 px-4 py-10">
      {/* Brand */}
      <button
        type="button"
        onClick={() => navigate("/")}
        className="flex items-center gap-3 rounded-2xl outline-none focus-visible:ring-4 focus-visible:ring-ring/40"
      >
        <span className="clay-orb size-12 bg-white p-2.5">
          <img src={logo} alt="Tailorly logo" className="size-full" />
        </span>
        <span className="clay-title text-2xl">Tailorly</span>
      </button>

      <ClayCard className="w-full max-w-md p-6 sm:p-8">
        <span className="clay-chip mb-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-widest">
          <LockKeyhole className="size-3.5" />
          {mode === "signup" ? "Sign up" : mode === "signin" ? "Sign in" : "Password reset"}
        </span>
        <h1 className="clay-title text-2xl">{titles[mode].title}</h1>
        <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
          {titles[mode].subtitle}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-4">
          {(mode === "signin" || mode === "signup") && (
            <Field label="User name">
              <input
                className={FIELD_INPUT}
                autoComplete="username"
                placeholder="e.g. ada.lovelace"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </Field>
          )}

          {(mode === "signup" || mode === "reset" || mode === "reset-code") && (
            <Field label="Email">
              <input
                className={FIELD_INPUT}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={mode === "reset-code"}
              />
            </Field>
          )}

          {mode === "signin" && (
            <Field label="Password">
              <span className="relative block">
                <input
                  className={FIELD_PASSWORD}
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </span>
            </Field>
          )}

          {mode === "signup" && (
            <Field label="Password">
              <span className="relative block">
                <input
                  className={FIELD_PASSWORD}
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </span>
            </Field>
          )}

          {mode === "reset-code" && (
            <>
              <Field label="Verification code">
                <input
                  className={FIELD_INPUT + " text-center text-lg font-bold tracking-[0.4em]"}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                />
              </Field>
              <Field label="New password">
                <input
                  className={FIELD_INPUT}
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </Field>
            </>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-2xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700"
            >
              {error}
            </p>
          )}
          {info && (
            <p className="rounded-2xl bg-clay-mint/60 px-4 py-3 text-sm font-semibold text-clay-ink">
              {info}
            </p>
          )}

          <ClayButton type="submit" size="lg" disabled={busy} className="justify-center">
            {busy ? (
              <Loader2 className="animate-spin" />
            ) : mode === "signin" ? (
              "Sign in"
            ) : mode === "signup" ? (
              "Create account"
            ) : mode === "reset" ? (
              "Send reset code"
            ) : (
              "Verify & set password"
            )}
          </ClayButton>
        </form>

        {/* Mode switchers */}
        <div className="mt-5 flex flex-col items-center gap-2 border-t border-border/60 pt-5 text-center text-sm text-muted-foreground">
          {mode === "signin" && (
            <>
              <button
                type="button"
                onClick={() => switchMode("reset")}
                className="font-semibold text-primary hover:underline"
              >
                Forgot your password?
              </button>
              <p>
                New to Tailorly?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("signup")}
                  className="font-semibold text-primary hover:underline"
                >
                  Create an account
                </button>
              </p>
            </>
          )}
          {mode === "signup" && (
            <p>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => switchMode("signin")}
                className="font-semibold text-primary hover:underline"
              >
                Sign in
              </button>
            </p>
          )}
          {(mode === "reset" || mode === "reset-code") && (
            <button
              type="button"
              onClick={() => switchMode("signin")}
              className="font-semibold text-primary hover:underline"
            >
              Back to sign in
            </button>
          )}
        </div>
      </ClayCard>

      <p className="max-w-md text-center text-xs text-muted-foreground">
        Your resumes stay private to your account.
      </p>
      {signedIn && !isAuthenticated && (
        <p className="text-sm text-muted-foreground">Signing you in…</p>
      )}
    </main>
  );
}
