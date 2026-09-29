import { ClayButton } from "@/components/clay/ClayButton";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Lock } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate, useLocation, useNavigate } from "react-router";

/**
 * Wraps a route that requires a signed-in user.
 *
 * Signed-out visitors see a clay-styled explanation block with the reason
 * they were stopped, and sign-in returns them to the page via `returnTo`.
 * Pass `redirectImmediately` for a route where the bounce really is the
 * better experience.
 */
export function RequireAuth({
  children,
  title = "Sign in to continue",
  description = "This page is only available to signed-in users.",
  redirectImmediately = false,
}: {
  children: ReactNode;
  /** Headline on the blocked screen. */
  title?: string;
  /** Says what the visitor gets by signing in. */
  description?: string;
  /** Skip the explanation and go straight to `/auth`. */
  redirectImmediately?: boolean;
}) {
  const { isLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  if (isLoading) {
    return (
      <main className="clay-bg flex min-h-screen items-center justify-center">
        <Loader2 className="size-7 animate-spin text-primary" />
      </main>
    );
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}`;
    const signInHref = `/auth?returnTo=${encodeURIComponent(returnTo)}`;

    if (redirectImmediately) {
      return <Navigate to={signInHref} replace />;
    }

    return (
      <main className="clay-bg flex min-h-screen items-center justify-center p-6">
        <div className="clay-card w-full max-w-md p-7 text-center">
          <div className="flex justify-center">
            <span className="clay-orb size-14 bg-clay-sky">
              <Lock className="size-6 text-sky-800" />
            </span>
          </div>
          <h1 className="clay-title mt-4 text-xl">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {description}
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            You'll come straight back to this page once you're signed in.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <ClayButton onClick={() => navigate(signInHref)}>
              Sign in
            </ClayButton>
            <ClayButton variant="ghost" onClick={() => navigate("/")}>
              Back to home
            </ClayButton>
          </div>
        </div>
      </main>
    );
  }

  return children;
}
