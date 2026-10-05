import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { ApplicationKit, TailorResult } from "@/convex/ai";
import { AppHeader } from "@/components/clay/AppHeader";
import { JobRadar } from "@/components/clay/JobRadar";
import { ClayButton } from "@/components/clay/ClayButton";
import { ClayCard } from "@/components/clay/ClayCard";
import { ConfirmationModal } from "@/components/clay/ConfirmationModal";
import { ResumeResult } from "@/components/clay/ResumeResult";
import { ResumeWizard } from "@/components/clay/ResumeWizard";
import { ScoreTrend } from "@/components/clay/ScoreTrend";
import { SectionBoundary } from "@/components/clay/SectionBoundary";
import {
  SavedResumeCard,
  SavedResumesEmptyState,
} from "@/components/clay/SavedResumeCard";
import { useAction, useMutation, useQuery } from "convex/react";
import { FilePlus2, Loader2, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getSessionId } from "@/lib/session";
import type { ResumeProfileData } from "@/types/resume";

type SavedResume = Doc<"tailoredResumes">;

export default function Dashboard() {
  const profile = useQuery(api.resumes.getProfile);
  const resumes = useQuery(api.resumes.listResumes);
  const saveResume = useMutation(api.resumes.saveResume);
  const tailorResume = useAction(api.ai.tailorResume);
  const generateKit = useAction(api.ai.generateApplicationKit);

  const [result, setResult] = useState<{
    jobTitle: string;
    companyName: string;
    jobDescription: string;
    result: TailorResult;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isBoosting, setIsBoosting] = useState(false);
  const [kit, setKit] = useState<ApplicationKit | null>(null);
  const [isKitLoading, setIsKitLoading] = useState(false);
  const [viewingSaved, setViewingSaved] = useState(false);
  const [toDelete, setToDelete] = useState<SavedResume | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  // Two workspaces: the resume studio and the employer radar (job search).
  const [tab, setTab] = useState<"studio" | "radar">("studio");

  const deleteResume = useMutation(api.resumes.deleteResume);

  const handleGenerated = (output: {
    result: TailorResult;
    job: { jobTitle: string; companyName: string; jobDescription: string };
    profileId: Id<"resumeProfiles">;
  }) => {
    setResult({
      jobTitle: output.job.jobTitle,
      companyName: output.job.companyName,
      jobDescription: output.job.jobDescription,
      result: output.result,
    });
    setViewingSaved(false);
    setShowWizard(false);
    setKit(null);
    toast.success(
      `Tailored resume ready — ${output.result.score}% match for ${output.job.companyName}!`,
    );
  };

  const handleSave = async () => {
    if (!result) return;
    if (!profile) {
      toast.error("Your profile is still loading — try again in a second.");
      return;
    }
    setIsSaving(true);
    try {
      await saveResume({
        ...(kit ? { applicationKit: kit } : {}),
        profileId: profile._id,
        companyName: result.companyName,
        jobTitle: result.jobTitle,
        jobDescription: result.jobDescription,
        score: result.result.score,
        summary: result.result.summary,
        skills: result.result.skills,
        experience: result.result.experience,
        education: result.result.education,
        keywords: result.result.keywords,
        missingKeywords: result.result.missingKeywords,
        breakdown: result.result.breakdown,
      });
      toast.success(
        viewingSaved
          ? "Saved copy updated."
          : "Resume saved to your collection.",
      );
      setResult(null);
      setViewingSaved(false);
      setShowWizard(false);
      setKit(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save the resume.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleViewSaved = (resume: SavedResume) => {
    setResult({
      jobTitle: resume.jobTitle,
      companyName: resume.companyName,
      jobDescription: resume.jobDescription,
      result: {
        score: resume.score,
        summary: resume.summary,
        skills: resume.skills,
        experience: resume.experience,
        education: resume.education,
        keywords: resume.keywords,
        missingKeywords: resume.missingKeywords ?? [],
        breakdown: resume.breakdown,
      },
    });
    setViewingSaved(true);
    setShowWizard(false);
    setKit(resume.applicationKit ?? null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setIsDeleting(true);
    try {
      await deleteResume({ resumeId: toDelete._id });
      if (result) {
        setResult(null);
        setViewingSaved(false);
      }
      setKit(null);
      toast.success("Saved resume deleted.");
      setToDelete(null);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete the resume.",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const startNewTailoring = () => {
    setResult(null);
    setViewingSaved(false);
    setShowWizard(true);
    setKit(null);
    setTab("studio");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** The radar's tailor pass finished — show it in the studio. */
  const handleRadarTailor = (
    job: { jobTitle: string; companyName: string; jobDescription: string },
    tailored: TailorResult,
  ) => {
    setResult({ ...job, result: tailored });
    setViewingSaved(false);
    setShowWizard(false);
    setKit(null);
    setTab("studio");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (profile === undefined) {
    return (
      <main className="clay-bg flex min-h-screen items-center justify-center">
        <Loader2 className="size-8 animate-spin text-primary" />
      </main>
    );
  }

  const contact: ResumeProfileData = profile
    ? {
        fullName: profile.fullName,
        title: profile.title,
        email: profile.email,
        phone: profile.phone,
        location: profile.location,
        portfolioUrl: profile.portfolioUrl,
        summary: profile.summary,
        skills: profile.skills,
        experience: profile.experience,
        education: profile.education,
      }
    : {
        fullName: "",
        title: "",
        email: "",
        phone: "",
        location: "",
        portfolioUrl: "",
        summary: "",
        skills: [],
        experience: [],
        education: [],
      };

  /** Re-tailor with the gap checklist fed back into the prompt (boost to 90). */
  const handleBoost = async () => {
    if (!result || !profile) return;
    if (result.result.missingKeywords.length === 0) return;
    setIsBoosting(true);
    try {
      const updated = await tailorResume({
        profileJson: JSON.stringify(contact),
        jobTitle: result.jobTitle,
        companyName: result.companyName,
        jobDescription: result.jobDescription,
        sessionId: getSessionId(),
        boostKeywords: result.result.missingKeywords,
      });
      setResult({ ...result, result: updated });
      setViewingSaved(false);
      toast.success(
        updated.score >= 90
          ? `Boosted — now ${updated.score}% match. You're at the target.`
          : `Boosted — now ${updated.score}% match.${
              updated.missingKeywords.length > 0
                ? ` ${updated.missingKeywords.length} gap(s) left.`
                : ""
            }`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Boost failed — try again.",
      );
    } finally {
      setIsBoosting(false);
    }
  };

  /** Generate the copy-ready application answers + cover letter for this job. */
  const handleGenerateKit = async () => {
    if (!result || !profile) return;
    setIsKitLoading(true);
    try {
      const generated = await generateKit({
        profileJson: JSON.stringify(contact),
        jobTitle: result.jobTitle,
        companyName: result.companyName,
        jobDescription: result.jobDescription,
        sessionId: getSessionId(),
      });
      setKit(generated);
      toast.success(
        "Application kit ready — cover letter, why-this-role, and form answers.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not generate the application kit.",
      );
    } finally {
      setIsKitLoading(false);
    }
  };

  return (
    <div>
      <AppHeader />
      <main className="clay-bg min-h-[calc(100vh-4.5rem)] px-4 pb-16 pt-6 sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          {/* Greeting + workspace tabs */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="clay-title text-3xl sm:text-4xl">
                {tab === "radar" ? "Job radar" : "Resume studio"}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {tab === "radar"
                  ? "Live openings scored against your resume — tailor, auto-apply, and watch for new matches."
                  : "Tailor your resume to any job posting and score what businesses are looking for."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div
                className="clay-chip flex gap-1 p-1"
                role="tablist"
                aria-label="Workspace"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "studio"}
                  onClick={() => setTab("studio")}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
                    tab === "studio"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Studio
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "radar"}
                  onClick={() => setTab("radar")}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold transition-colors ${
                    tab === "radar"
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Job radar
                </button>
              </div>
              <ClayButton size="lg" onClick={startNewTailoring}>
                <Wand2 /> New tailoring
              </ClayButton>
            </div>
          </div>

          {tab === "radar" ? (
            <SectionBoundary key="radar-section">
              <JobRadar
                profile={profile}
                defaultEmail={profile?.email ?? ""}
                onBuildProfile={startNewTailoring}
                onTailored={handleRadarTailor}
              />
            </SectionBoundary>
          ) : (
          <>

          {/* Result (after generation) */}
          {result ? (
            <SectionBoundary key="result-section">
              <ResumeResult
                jobTitle={result.jobTitle}
                companyName={result.companyName}
                jobDescription={result.jobDescription}
                result={result.result}
                contact={contact}
                onSave={handleSave}
                onRefine={startNewTailoring}
                onBoost={handleBoost}
                isBoosting={isBoosting}
                kit={kit}
                onGenerateKit={handleGenerateKit}
                isGeneratingKit={isKitLoading}
                isSaving={isSaving}
                viewingSaved={viewingSaved}
              />
            </SectionBoundary>
          ) : showWizard ? (
            /* Wizard */
            <SectionBoundary key="wizard-section">
              <ResumeWizard
                initialProfile={profile ?? null}
                onGenerated={handleGenerated}
              />
            </SectionBoundary>
          ) : (
            /* Default workspace state */
            <div className="flex flex-col gap-6">
              <ClayCard className="relative overflow-hidden">
                <div className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-clay-blush opacity-70 blur-2xl" />
                <div className="pointer-events-none absolute -bottom-20 -left-10 size-56 rounded-full bg-clay-sky opacity-60 blur-2xl" />
                <div className="relative flex flex-col items-start gap-4">
                  <span className="clay-orb size-14 bg-clay-butter">
                    <Wand2 className="size-6 text-amber-700" />
                  </span>
                  <div>
                    <h2 className="clay-title text-2xl sm:text-3xl">
                      {profile
                        ? "Your profile is ready. Aim it at a job."
                        : "Build your master profile, then tailor it to any job."}
                    </h2>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                      The wizard walks you through your experience once, then
                      rewrites your bullets to mirror each job's own language —
                      scoring how well you match what businesses are looking for.
                    </p>
                  </div>
                  <ClayButton size="lg" onClick={startNewTailoring}>
                    <FilePlus2 />
                    {profile ? "Tailor a resume" : "Start the resume wizard"}
                  </ClayButton>
                </div>
              </ClayCard>

              {/* Saved resumes */}
              <section className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h2 className="clay-title text-xl">Saved resumes</h2>
                  {resumes && resumes.length > 0 && (
                    <span className="clay-chip px-3 py-1 text-xs font-bold">
                      {resumes.length} saved
                    </span>
                  )}
                </div>
                {resumes === undefined ? (
                  <div className="clay-card flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" /> Loading your
                    collection…
                  </div>
                ) : resumes.length === 0 ? (
                  <SavedResumesEmptyState />
                ) : (
                  <>
                    {/* Score history — progress toward the 90% goal */}
                    {resumes.length >= 2 && (
                      <ClayCard>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <h3 className="clay-title text-lg">
                              Your match trend
                            </h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Every saved resume scored against its own posting
                              — watch the climb toward 90%.
                            </p>
                          </div>
                          <span className="clay-chip px-3 py-1 text-xs font-bold">
                            avg{" "}
                            {Math.round(
                              resumes.reduce((sum, r) => sum + r.score, 0) /
                                resumes.length,
                            )}
                            %
                          </span>
                        </div>
                        <div className="mt-4">
                          <ScoreTrend
                            points={resumes.map((resume) => ({
                              createdAt: resume._creationTime,
                              score: resume.score,
                              jobTitle: resume.jobTitle,
                              companyName: resume.companyName,
                            }))}
                          />
                        </div>
                      </ClayCard>
                    )}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {resumes.map((resume) => (
                      <SavedResumeCard
                        key={resume._id}
                        resume={resume}
                        onView={() => handleViewSaved(resume)}
                        onDelete={() => setToDelete(resume)}
                      />
                    ))}
                    </div>
                  </>
                )}
              </section>
            </div>
          )}
          </>
          )}
        </div>
      </main>

      <ConfirmationModal
        open={toDelete !== null}
        title="Delete this saved resume?"
        message={`The tailored resume for "${toDelete?.jobTitle}" at ${toDelete?.companyName} will be gone for good.`}
        onConfirm={handleDelete}
        onCancel={() => setToDelete(null)}
        busy={isDeleting}
      />
    </div>
  );
}
