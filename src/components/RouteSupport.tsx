/**
 * Route-level helpers used by the entrypoint — extracted from main.tsx so the
 * entry file stays pure bootstrap (and react-refresh stops warning about
 * components defined in a file with no exports, ROADMAP D4).
 */
import { useEffect } from "react";
import { useLocation } from "react-router";

/** Simple loading fallback for route transitions. */
export function RouteLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-pulse text-muted-foreground">Loading...</div>
    </div>
  );
}

/**
 * Keeps the preview parent frame in sync with the current path and handles
 * back/forward navigation messages from the hosting shell.
 */
export function RouteSyncer() {
  const location = useLocation();
  useEffect(() => {
    window.parent.postMessage(
      { type: "iframe-route-change", path: location.pathname },
      "*",
    );
  }, [location.pathname]);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "navigate") {
        if (event.data.direction === "back") window.history.back();
        if (event.data.direction === "forward") window.history.forward();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  return null;
}
