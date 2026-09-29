import logo from "@/assets/logo.svg";
import { useAuth } from "@/hooks/use-auth";
import { LogOut, Sparkles } from "lucide-react";
import { useNavigate } from "react-router";
import { ClayButton } from "./ClayButton";

/** Clay-styled app header with sign-out, used on the authenticated dashboard. */
export function AppHeader() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

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
          <span className="hidden items-center gap-1.5 rounded-full bg-white/60 px-3 py-1.5 text-xs font-semibold text-clay-ink/80 sm:inline-flex">
            <Sparkles className="size-3.5 text-clay-ink/60" />
            {user?.name ?? user?.email ?? "Your studio"}
          </span>
          <ClayButton variant="ghost" onClick={handleSignOut}>
            <LogOut />
            <span className="hidden sm:inline">Sign out</span>
          </ClayButton>
        </div>
      </div>
    </header>
  );
}
