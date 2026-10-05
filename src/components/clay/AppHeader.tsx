import logo from "@/assets/logo.svg";
import { api } from "@/convex/_generated/api";
import { useTheme } from "@/hooks/use-theme";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { Home, LogOut, Moon, Sun } from "lucide-react";
import { useNavigate } from "react-router";
import { ClayButton } from "./ClayButton";

/** Clay-styled app header used on the resume workspace. */
export function AppHeader() {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const user = useQuery(api.users.currentUser);
  const { signOut } = useAuthActions();

  return (
    <header className="sticky top-0 z-40 bg-background/70 backdrop-blur-md">
      <div className="mx-auto flex h-18 w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => navigate("/dashboard")}
          className="flex items-center gap-3 rounded-2xl outline-none focus-visible:ring-4 focus-visible:ring-ring/40"
        >
          <span className="clay-orb size-11 bg-white p-2">
            <img src={logo} alt="Tailorly logo" className="size-full" />
          </span>
          <span className="clay-title text-xl">Tailorly</span>
        </button>

        <div className="flex items-center gap-2 sm:gap-3">
          {user && (
            <span
              className="hidden max-w-[12rem] items-center gap-1.5 truncate rounded-full bg-card/80 px-3 py-1.5 text-xs font-semibold text-foreground/75 sm:inline-flex"
              title={user.email ?? undefined}
            >
              {user.name ?? user.email ?? "Signed in"}
            </span>
          )}
          <ClayButton
            variant="ghost"
            onClick={toggle}
            aria-label={
              theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
            }
            title={theme === "dark" ? "Light theme" : "Dark theme"}
          >
            {theme === "dark" ? <Sun /> : <Moon />}
          </ClayButton>
          <ClayButton
            variant="ghost"
            onClick={async () => {
              await signOut();
              navigate("/");
            }}
          >
            <LogOut />
            <span className="hidden sm:inline">Sign out</span>
          </ClayButton>
          <ClayButton variant="ghost" onClick={() => navigate("/")}>
            <Home />
            <span className="hidden sm:inline">Home</span>
          </ClayButton>
        </div>
      </div>
    </header>
  );
}
