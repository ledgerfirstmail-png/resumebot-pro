const SESSION_KEY = "tailorly_session_id";

/**
 * Stable anonymous id for this browser, created on first use.
 * Used only as a rate-limit bucket for the login-free AI action —
 * it carries no identity and never leaves localStorage.
 */
export function getSessionId(): string {
  try {
    let id = localStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    // Storage blocked (private mode etc.) — rate limiting degrades gracefully.
    return "anonymous";
  }
}
