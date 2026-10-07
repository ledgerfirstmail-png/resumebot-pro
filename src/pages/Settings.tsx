import { useAuthActions } from "@convex-dev/auth/react";
import { api } from "@/convex/_generated/api";
import type { IntegrationStatus } from "@/convex/integrations";
import { AppHeader } from "@/components/clay/AppHeader";
import { ClayButton } from "@/components/clay/ClayButton";
import { ClayCard } from "@/components/clay/ClayCard";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  Bot,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  PlugZap,
  RefreshCw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

const FIELD_INPUT =
  "clay-inset h-11 w-full rounded-2xl px-4 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:ring-4 focus-visible:ring-ring/30";

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

function PasswordInput({
  value,
  onChange,
  label,
  error,
  autoComplete,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  error?: string;
  autoComplete: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label} error={error}>
      <div className="relative">
        <input
          className={FIELD_INPUT + " pr-11"}
          type={visible ? "text" : "password"}
          value={value}
          autoComplete={autoComplete}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </Field>
  );
}

/** One row of the connections card: name, live status dot, detail, test button. */
function ConnectionRow({
  icon,
  name,
  connected,
  detail,
  testLabel,
  onTest,
  testing,
  lastResult,
}: {
  icon: React.ReactNode;
  name: string;
  connected: boolean;
  detail: string;
  testLabel: string;
  onTest: () => void;
  testing: boolean;
  lastResult: { ok: boolean; text: string } | null;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-card/70 p-4 ring-1 ring-border/60 sm:flex-row sm:items-start sm:gap-3">
      <div className="flex items-center gap-2 sm:mt-0.5">
        {icon}
        <span className="font-bold">{name}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide">
          {connected ? (
            <>
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Check className="size-3.5" /> Connected
              </span>
            </>
          ) : (
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <X className="size-3.5" /> Not connected
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
        {lastResult && (
          <p
            className={`mt-1 text-xs font-semibold ${
              lastResult.ok
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {lastResult.ok ? "✓ " : "✗ "}
            {lastResult.text}
          </p>
        )}
      </div>
      <ClayButton
        variant="soft"
        size="sm"
        onClick={onTest}
        disabled={testing}
        className="shrink-0"
      >
        {testing ? <Loader2 className="animate-spin" /> : <PlugZap />}
        {testLabel}
      </ClayButton>
    </div>
  );
}

/**
 * Connections card (/settings, ROADMAP P20): shows which integrations are
 * live and one-click tests them — a real LLM completion, a real Resend
 * delivery, and the Telegram token check. Keys are managed in the platform
 * Keys tab; this card reads status and proves it, it doesn't hold secrets.
 */
function ConnectionsCard() {
  const checkStatus = useAction(api.integrations.status);
  const testAi = useAction(api.integrations.testAi);
  const testEmail = useAction(api.integrations.testEmail);
  const checkTelegram = useAction(api.notify.resolveTelegramChat);
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [testingAi, setTestingAi] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [testAddress, setTestAddress] = useState("");
  const [aiResult, setAiResult] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const [emailResult, setEmailResult] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [telegramResult, setTelegramResult] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      setStatus(await checkStatus({}));
    } catch {
      toast.error("Couldn't read integration status — try again.");
    } finally {
      setIsLoading(false);
    }
  }, [checkStatus]);

  // Initial status load: state changes live in promise callbacks (never in
  // the effect body) so a slow call can't cascade renders on mount.
  useEffect(() => {
    let cancelled = false;
    checkStatus({})
      .then((out) => {
        if (!cancelled) setStatus(out);
      })
      .catch(() => {
        if (!cancelled)
          toast.error("Couldn't read integration status — try again.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [checkStatus]);

  const handleManualRefresh = () => {
    setIsLoading(true);
    void refresh();
  };

  const handleTestAi = async () => {
    setTestingAi(true);
    setAiResult(null);
    try {
      const out = await testAi({});
      setAiResult(
        out.ok
          ? { ok: true, text: `Model answered: “${out.reply}”` }
          : { ok: false, text: out.error },
      );
    } catch (err) {
      setAiResult({
        ok: false,
        text: err instanceof Error ? err.message : "Test failed — try again.",
      });
    } finally {
      setTestingAi(false);
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    setEmailResult(null);
    try {
      const out = await testEmail({ to: testAddress });
      setEmailResult({ ok: out.ok, text: out.detail });
    } catch (err) {
      setEmailResult({
        ok: false,
        text: err instanceof Error ? err.message : "Test failed — try again.",
      });
    } finally {
      setTestingEmail(false);
    }
  };

  const handleTestTelegram = async () => {
    setTestingTelegram(true);
    setTelegramResult(null);
    try {
      const out = await checkTelegram({});
      setTelegramResult(
        out.ok
          ? {
              ok: true,
              text: `Token works — bot chat with ${out.name} found (id …${out.chatId.slice(-4)}).`,
            }
          : { ok: false, text: out.error },
      );
    } catch (err) {
      setTelegramResult({
        ok: false,
        text: err instanceof Error ? err.message : "Check failed — try again.",
      });
    } finally {
      setTestingTelegram(false);
    }
  };

  return (
    <ClayCard>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PlugZap className="size-4 text-primary" />
          <h2 className="clay-title text-lg">Connections</h2>
        </div>
        <ClayButton
          variant="ghost"
          size="sm"
          onClick={handleManualRefresh}
          disabled={isLoading}
          title="Re-read integration status"
        >
          {isLoading ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Refresh
        </ClayButton>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        API keys live in the platform's Keys tab, never in this page — the
        tests below run a real check against each service.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <ConnectionRow
          icon={<Bot className="size-4 text-primary" />}
          name="LLM (AI tailoring)"
          connected={status?.ai.connected ?? false}
          detail={status?.ai.detail ?? "Reading status…"}
          testLabel="Test LLM"
          onTest={handleTestAi}
          testing={testingAi}
          lastResult={aiResult}
        />

        <div className="flex flex-col gap-2 rounded-2xl bg-card/70 p-4 ring-1 ring-border/60">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
            <div className="flex items-center gap-2 sm:mt-0.5">
              <Send className="size-4 text-primary" />
              <span className="font-bold">Email (Resend)</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide">
                {status?.email.connected ? (
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <Check className="size-3.5" /> Connected
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <X className="size-3.5" /> Not connected
                  </span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {status?.email.detail ?? "Reading status…"}
              </p>
              {emailResult && (
                <p
                  className={`mt-1 text-xs font-semibold ${
                    emailResult.ok
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  }`}
                >
                  {emailResult.ok ? "✓ " : "✗ "}
                  {emailResult.text}
                </p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <input
                value={testAddress}
                onChange={(e) => setTestAddress(e.target.value)}
                type="email"
                placeholder="you@example.com"
                className="clay-inset h-9 w-full rounded-xl px-3 text-sm outline-none sm:w-44"
                aria-label="Email address for the test message"
              />
              <ClayButton
                variant="soft"
                size="sm"
                onClick={handleTestEmail}
                disabled={testingEmail || testAddress.trim().length < 5}
              >
                {testingEmail ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <PlugZap />
                )}
                Send test
              </ClayButton>
            </div>
          </div>
        </div>

        <ConnectionRow
          icon={<Send className="size-4 text-primary" />}
          name="Telegram alerts"
          connected={status?.telegram.connected ?? false}
          detail={status?.telegram.detail ?? "Reading status…"}
          testLabel="Check token"
          onTest={handleTestTelegram}
          testing={testingTelegram}
          lastResult={telegramResult}
        />
      </div>
    </ClayCard>
  );
}

/**
 * Account settings (/settings) — connections (LLM/email/Telegram) and the
 * signed-in user's own password. Other sessions are signed out on change;
 * this one stays signed in.
 */
/** Danger zone: type-to-confirm, then wipe every owned row + auth rows. */
function DangerZoneCard() {
  const deleteAccount = useMutation(api.accountDeletion.deleteAccount);
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteAccount({});
      toast.success("Account deleted — all of your data was removed.");
      // The session rows are already gone server-side; signOut just clears
      // the local token and may be a no-op or throw — never block navigation.
      try {
        await signOut();
      } catch {
        // Session already invalidated by the deletion.
      }
      navigate("/");
    } catch (err) {
      setDeleting(false);
      toast.error(
        err instanceof Error
          ? err.message
          : "Couldn't delete the account — try again.",
      );
    }
  };

  return (
    <ClayCard>
      <div className="flex items-center gap-2">
        <Trash2 className="size-4 text-rose-600" />
        <h2 className="clay-title text-lg">Delete account</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Permanently removes your profiles, tailored resumes, saved jobs, and
        radar watches, then this sign-in itself. There is no undo and no
        export afterward — download any resume PDF you still want first.
      </p>
      <label className="mt-4 flex flex-col gap-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Type DELETE to confirm
        </span>
        <input
          value={confirmText}
          onChange={(e) => setConfirmText(e.target.value)}
          disabled={deleting}
          aria-label="Type DELETE to confirm account deletion"
          placeholder="DELETE"
          autoComplete="off"
          className="clay-inset h-11 rounded-2xl px-4 text-sm font-bold tracking-wider outline-none placeholder:text-muted-foreground/50 focus-visible:ring-4 focus-visible:ring-ring/30"
        />
      </label>
      <ClayButton
        variant="soft"
        className="mt-3 bg-rose-100 text-rose-700 hover:bg-rose-200"
        disabled={deleting || confirmText.trim().toUpperCase() !== "DELETE"}
        onClick={() => void handleDelete()}
      >
        {deleting ? <Loader2 className="animate-spin" /> : <Trash2 />}
        {deleting ? "Deleting…" : "Delete my account"}
      </ClayButton>
    </ClayCard>
  );
}

export default function Settings() {
  const user = useQuery(api.users.currentUser);
  const changePassword = useAction(api.accounts.changePassword);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setDone(false);

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("The two new passwords don't match.");
      return;
    }

    setBusy(true);
    try {
      await changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setDone(true);
      toast.success(
        "Password changed — any other signed-in sessions were signed out.",
      );
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Couldn't change the password — try again.";
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <AppHeader />
      <main className="clay-bg min-h-[calc(100vh-4.5rem)] px-4 pb-16 pt-6 sm:px-6">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          <div>
            <h1 className="clay-title text-3xl sm:text-4xl">Settings</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Your Tailorly account. Resume data lives in the studio — nothing
              here touches your profiles or saved resumes.
            </p>
          </div>

          <ClayCard>
            <h2 className="clay-title text-lg">Account</h2>
            <dl className="mt-3 flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="font-semibold text-muted-foreground">
                  User name
                </dt>
                <dd className="font-bold">{user?.name ?? "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="font-semibold text-muted-foreground">Email</dt>
                <dd className="truncate font-bold">{user?.email ?? "—"}</dd>
              </div>
            </dl>
          </ClayCard>

          <ConnectionsCard />

          <ClayCard>
            <div className="flex items-center gap-2">
              <KeyRound className="size-4 text-primary" />
              <h2 className="clay-title text-lg">Change password</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Picking a new password signs out every other device — this one
              stays signed in.
            </p>
            <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-4">
              <PasswordInput
                label="Current password"
                value={currentPassword}
                onChange={setCurrentPassword}
                autoComplete="current-password"
              />
              <PasswordInput
                label="New password"
                value={newPassword}
                onChange={setNewPassword}
                autoComplete="new-password"
                error={
                  newPassword.length > 0 && newPassword.length < 8
                    ? "At least 8 characters."
                    : undefined
                }
              />
              <PasswordInput
                label="Confirm new password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                autoComplete="new-password"
                error={
                  confirmPassword.length > 0 && confirmPassword !== newPassword
                    ? "Doesn't match the new password yet."
                    : undefined
                }
              />
              {error && (
                <p className="text-xs font-semibold text-rose-600">{error}</p>
              )}
              {done && (
                <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                  <Check className="size-4" /> Password updated.
                </p>
              )}
              <ClayButton
                type="submit"
                disabled={
                  busy ||
                  !currentPassword ||
                  !newPassword ||
                  !confirmPassword
                }
              >
                {busy ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <KeyRound />
                )}
                {busy ? "Updating…" : "Update password"}
              </ClayButton>
            </form>
          </ClayCard>

          <DangerZoneCard />
        </div>
      </main>
    </div>
  );
}
