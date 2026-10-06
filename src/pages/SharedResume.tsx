import logo from "@/assets/logo.svg";
import { api } from "@/convex/_generated/api";
import { ScoreGauge } from "@/components/clay/ScoreGauge";
import { ResumeDocument } from "@/components/clay/ResumeDocument";
import { ClayButton } from "@/components/clay/ClayButton";
import { ClayCard } from "@/components/clay/ClayCard";
import { useTheme } from "@/hooks/use-theme";
import { downloadResumePdf } from "@/lib/resumePdf";
import type { ResumeProfileData } from "@/types/resume";
import { useQuery } from "convex/react";
import { Download, Link2Off, Loader2, Moon, Printer, Share2, Sun } from "lucide-react";
import { useNavigate, useParams } from "react-router";
import { toast } from "sonner";

/** Shape returned by the public resumes:getSharedResume query (sanitized). */
interface SharedResumePayload {
  jobTitle: string;
  companyName: string;
  score: number;
  summary: string;
  skills: string[];
  experience: ResumeProfileData["experience"];
  education: ResumeProfileData["education"];
  contact: {
    fullName: string;
    title: string;
    email: string;
    phone: string;
    location: string;
    portfolioUrl: string;
  } | null;
}

/** Rebuild the ResumeDocument input from the sanitized public payload. */
function buildResume(shared: SharedResumePayload): ResumeProfileData {
  return {
    fullName: shared.contact?.fullName ?? "",
    title: shared.contact?.title ?? "",
    email: shared.contact?.email ?? "",
    phone: shared.contact?.phone ?? "",
    location: shared.contact?.location ?? "",
    portfolioUrl: shared.contact?.portfolioUrl ?? "",
    summary: shared.summary,
    skills: shared.skills,
    experience: shared.experience,
    education: shared.education,
  };
}

/**
 * Public read-only view of a shared resume (/r/:slug) — ROADMAP E11.
 * Renders no edit affordances: printing and PDF download only, plus a CTA
 * into the product. Unknown or revoked slugs get a friendly dead-end.
 */
export default function SharedResume() {
  const { slug } = useParams<{ slug: string }>();
  const shared = useQuery(
    api.resumes.getSharedResume,
    slug ? { slug } : "skip",
  );
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();

  const handlePrint = () => window.print();

  const handleDownloadPdf = () => {
    if (!shared) return;
    try {
      const resume = buildResume(shared);
      const filename = downloadResumePdf(
        resume,
        shared.companyName || shared.jobTitle,
      );
      toast.success(`${filename} downloaded — print-ready and ATS-friendly.`);
    } catch (error) {
      console.error("PDF export failed", error);
      toast.error("Couldn't build the PDF — try Print / PDF instead.");
    }
  };

  return (
    <div className="clay-bg min-h-screen">
      {/* Minimal public header — no account controls, theme toggle kept. */}
      <header className="sticky top-0 z-40 bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex h-18 w-full max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-3 rounded-2xl outline-none focus-visible:ring-4 focus-visible:ring-ring/40"
          >
            <span className="clay-orb size-11 bg-white p-2">
              <img src={logo} alt="Tailorly logo" className="size-full" />
            </span>              <span className="clay-title text-xl">Tailorly</span>
            </button>
          <div className="flex items-center gap-2">
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
            <ClayButton onClick={() => navigate("/dashboard")}>
              <Share2 />
              <span className="hidden sm:inline">Tailor your own</span>
              <span className="sm:hidden">Make yours</span>
            </ClayButton>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 pb-16 pt-6 sm:px-6">
        {shared === undefined && (
          <div className="flex min-h-[50vh] items-center justify-center">
            <Loader2 className="size-8 animate-spin text-primary" />
          </div>
        )}

        {shared === null && (
          <ClayCard className="mt-10 text-center">
            <span className="clay-orb mx-auto size-14 bg-clay-butter">
              <Link2Off className="size-6 text-amber-700" />
            </span>
            <h1 className="clay-title mt-4 text-2xl sm:text-3xl">
              This share link isn’t active
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              The link may have been revoked, the resume deleted, or the address
              mistyped. Ask whoever shared it for a fresh link.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <ClayButton onClick={() => navigate("/")}>Back to Tailorly</ClayButton>
              <ClayButton variant="soft" onClick={() => navigate("/dashboard")}>
                Create your own resume
              </ClayButton>
            </div>
          </ClayCard>
        )}

        {shared && (
          <>
            {/* Identity + score header */}
            <ClayCard className="mt-2 flex flex-col items-center gap-8 sm:flex-row sm:gap-10">
              <ScoreGauge score={shared.score} className="shrink-0" />
              <div className="flex flex-col gap-3 text-center sm:text-left">
                <span className="clay-chip w-fit px-3 py-1.5 text-xs font-bold uppercase tracking-widest">
                  Shared resume · read-only
                </span>
                <h1 className="clay-title text-2xl sm:text-3xl">
                  {shared.jobTitle}{" "}
                  <span className="text-muted-foreground">
                    · {shared.companyName}
                  </span>
                </h1>
                <p className="max-w-xl text-sm leading-6 text-muted-foreground">
                  Tailored for this role and matched at {shared.score}% — the
                  rewrite uses only real experience. Anyone with this link can
                  read the resume; nothing here can be edited from this page.
                </p>
                <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                  <ClayButton variant="soft" onClick={handlePrint}>
                    <Printer /> Print / PDF
                  </ClayButton>
                  <ClayButton variant="soft" onClick={handleDownloadPdf}>
                    <Download /> Download PDF
                  </ClayButton>
                </div>
              </div>
            </ClayCard>

            {/* The resume sheet */}
            <div className="clay-card p-4 sm:p-6">
              <ResumeDocument resume={buildResume(shared)} />
            </div>

            {/* Honest-by-design note + CTA into the product */}
            <ClayCard className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="clay-title text-lg">
                  Make one for your next role
                </h2>
                <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
                  Tailorly rewrites your real experience to mirror a job
                  posting’s own language, then scores it against what businesses
                  are actually looking for.
                </p>
              </div>
              <ClayButton size="lg" onClick={() => navigate("/dashboard")}>
                Tailor my resume
              </ClayButton>
            </ClayCard>
          </>
        )}
      </main>
    </div>
  );
}
