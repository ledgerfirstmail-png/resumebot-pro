import { useConvexAuth } from "convex/react";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

/**
 * Guards signed-in routes: unauthenticated visitors are sent to /auth with
 * the full intended path preserved in `returnTo`, and the auth page sends
 * them straight back there after signing in.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <main className="clay-bg flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" aria-label="Checking your session" />
      </main>
    );
  }

  if (!isAuthenticated) {
    const returnTo = `${location.pathname}${location.search}`;
    return (
      <Navigate to={`/auth?returnTo=${encodeURIComponent(returnTo)}`} replace />
    );
  }

  return <>{children}</>;
}
