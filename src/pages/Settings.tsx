import { api } from "@/convex/_generated/api";
import { AppHeader } from "@/components/clay/AppHeader";
import { ClayButton } from "@/components/clay/ClayButton";
import { ClayCard } from "@/components/clay/ClayCard";
import { useAction, useQuery } from "convex/react";
import { Check, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
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

/**
 * Account settings (/settings) — change the signed-in user's own password.
 * Other sessions are signed out; this one stays signed in.
 */
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
        </div>
      </main>
    </div>
  );
}
