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
import {
  FilePlus2,
  Loader2,
  UserRound,
  UserRoundPlus,
  Wand2,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { profileLabel } from "@/lib/resumeSchemas";
import type { ResumeProfileData } from "@/types/resume";

type SavedResume = Doc<"tailoredResumes">;

export default function Dashboard() {
  const profile = useQuery(api.resumes.getProfile);
  const resumes = useQuery(api.resumes.listResumes);
  // E12 — every named profile the user owns.
  const profiles = useQuery(api.resumes.listProfiles);
  const deleteProfile = useMutation(api.resumes.deleteProfile);
  // E12 — explicit target profile when the user picked one (undefined =
  // legacy behavior: saveProfile upserts the newest).
  const [activeProfileId, setActiveProfileId] = useState<
    Id<"resumeProfiles"> | undefined
  >(undefined);
  const [createMode, setCreateMode] = useState(false);
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [toDeleteProfile, setToDeleteProfile] = useState<
    Doc<"resumeProfiles"> | null
  >(null);
  const [isDeletingProfile, setIsDeletingProfile] = useState(false);
  // Usage is keyed server-side to the signed-in account now — no client id.
  const usage = useQuery(api.aiUsage.usageSummary, {});
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
  // Which saved doc the result view is showing (drives the share controls).
  const [viewingSavedId, setViewingSavedId] = useState<
    Id<"tailoredResumes"> | null
  >(null);
  const [toDelete, setToDelete] = useState<SavedResume | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showWizard, setShowWizard] = useState(false);
  // Two workspaces: the resume studio and the employer radar (job search).
  const [tab, setTab] = useState<"studio" | "radar">("studio");

  const deleteResume = useMutation(api.resumes.deleteResume);
  const createShareLink = useMutation(api.resumes.createShareLink);
  const revokeShareLink = useMutation(api.resumes.revokeShareLink);

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
    setViewingSavedId(null);
    setShowWizard(false);
    setKit(null);
    // E12 — the profile the result belongs to drives saves, boost, and kit.
    setActiveProfileId(output.profileId);
    setCreateMode(false);
    setProfileNameDraft("");
    toast.success(
      `Tailored resume ready — ${output.result.score}% match for ${output.job.companyName}!`,
    );
  };

  const handleSave = async () => {
    if (!result) return;
    // E12 — the generating profile; falls back to the newest profile.
    if (!resultProfile) {
      toast.error("Your profile is still loading — try again in a second.");
      return;
    }
    setIsSaving(true);
    try {
      await saveResume({
        ...(kit ? { applicationKit: kit } : {}),
        profileId: resultProfile._id,
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
      setViewingSavedId(null);
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
    setViewingSavedId(resume._id);
    // E12 — the active profile follows the resume's own profile, so save /
    // boost / kit / PDF-preview all use the right contact block even when a
    // different profile is currently selected in the switcher.
    setActiveProfileId(resume.profileId);
    setCreateMode(false);
    setProfileNameDraft("");
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
        setViewingSavedId(null);
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
    setViewingSavedId(null);
    setShowWizard(true);
    setKit(null);
    setTab("studio");
    setCreateMode(false);
    // E12 — leave activeProfileId alone: "New tailoring" continues in the
    // profile the user last worked with (wizard targets it explicitly).
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** E12 — start a brand-new named profile from scratch. */
  const startCreateProfile = () => {
    setResult(null);
    setViewingSaved(false);
    setViewingSavedId(null);
    setShowWizard(true);
    setKit(null);
    setTab("studio");
    setCreateMode(true);
    setProfileNameDraft("");
    setActiveProfileId(undefined);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  /** E12 — point the workspace at a different profile. */
  const switchProfile = (profileId: Id<"resumeProfiles"> | undefined) => {
    setActiveProfileId(profileId);
    setCreateMode(false);
    setProfileNameDraft("");
    // A fresh result belongs to the profile that generated it — clear the
    // view so the user never saves into the wrong profile by accident.
    if (result && !viewingSaved) {
      setResult(null);
      setViewingSavedId(null);
    }
  };

  const handleDeleteProfile = async () => {
    if (!toDeleteProfile) return;
    setIsDeletingProfile(true);
    try {
      await deleteProfile({ profileId: toDeleteProfile._id });
      toast.success(`Profile “${profileLabel(toDeleteProfile.name)}” deleted.`);
      setToDeleteProfile(null);
      if (activeProfileId === toDeleteProfile._id) {
        setActiveProfileId(undefined);
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't delete that profile.",
      );
      setToDeleteProfile(null);
    } finally {
      setIsDeletingProfile(false);
    }
  };

  /** The radar's tailor pass finished — show it in the studio. */
  const handleRadarTailor = (
    job: { jobTitle: string; companyName: string; jobDescription: string },
    tailored: TailorResult,
  ) => {
    setResult({ ...job, result: tailored });
    setViewingSaved(false);
    setViewingSavedId(null);
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

  // E12 — the profile driving the current view: the explicit pick, else the
  // newest profile. Falls back to the query result while loading a pick.
  const activeProfile =
    (activeProfileId
      ? (profiles ?? []).find((p) => p._id === activeProfileId)
      : profile) ?? profile;
  const resultProfile = activeProfile ?? profile;

  const contact: ResumeProfileData = activeProfile
    ? {
        fullName: activeProfile.fullName,
        title: activeProfile.title,
        email: activeProfile.email,
        phone: activeProfile.phone,
        location: activeProfile.location,
        portfolioUrl: activeProfile.portfolioUrl,
        summary: activeProfile.summary,
        skills: activeProfile.skills,
        experience: activeProfile.experience,
        education: activeProfile.education,
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
    if (!result || !resultProfile) return;
    if (result.result.missingKeywords.length === 0) return;
    setIsBoosting(true);
    try {
      const updated = await tailorResume({
        profileJson: JSON.stringify(contact),
        jobTitle: result.jobTitle,
        companyName: result.companyName,
        jobDescription: result.jobDescription,
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
    if (!result || !resultProfile) return;
    setIsKitLoading(true);
    try {
      const generated = await generateKit({
        profileJson: JSON.stringify(contact),
        jobTitle: result.jobTitle,
        companyName: result.companyName,
        jobDescription: result.jobDescription,
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

  /** E11 — mint the public read-only link for the resume being viewed. */
  const handleCreateShare = async (): Promise<string | null> => {
    if (!viewingSavedId) return null;
    try {
      return await createShareLink({ resumeId: viewingSavedId });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't create a share link — try again.",
      );
      return null;
    }
  };

  /** E11 — turn the public link off (slug cleared, /r/… stops resolving). */
  const handleRevokeShare = async () => {
    if (!viewingSavedId) return;
    try {
      await revokeShareLink({ resumeId: viewingSavedId });
      toast.success("Sharing stopped — the public link no longer works.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't stop sharing.",
      );
    }
  };

  // The saved doc being viewed — its shareSlug drives the share controls.
  const savedResume =
    viewingSavedId && resumes
      ? (resumes.find((r) => r._id === viewingSavedId) ?? null)
      : null;

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
                  ? "Live openings tiered against your resume — tailor the strong ones, auto-apply, and watch for new matches."
                  : "Tailor your resume to any job posting and score what businesses are looking for."}
              </p>
              {usage && usage.usedToday > 0 && (
                <p
                  className="mt-1 text-xs font-semibold text-muted-foreground"
                  title="AI usage for this browser session over the last day"
                >
                  AI today: {usage.usedToday}/{usage.limit} runs
                  {usage.tokensIn + usage.tokensOut > 0
                    ? ` · ${usage.tokensIn + usage.tokensOut} tokens`
                    : ""}
                  {usage.credits > 0 ? ` · ${usage.credits} credits` : ""}
                  {usage.failuresToday > 0
                    ? ` · ${usage.failuresToday} failed`
                    : ""}
                </p>
              )}
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

          {/* E12 — named profile switcher (studio tab only). */}
          {tab === "studio" && profiles && profiles.length > 0 && (
            <div
              className="flex flex-wrap items-center gap-2"
              role="group"
              aria-label="Resume profile"
            >
              <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                <UserRound className="size-3.5" /> Profile
              </span>
              {profiles.map((p) => {
                const isActive =
                  createMode
                    ? false
                    : (activeProfileId ?? profile?._id) === p._id;
                return (
                  <div key={p._id} className="relative inline-flex">
                    <button
                      type="button"
                      aria-pressed={isActive}
                      onClick={() => switchProfile(p._id)}
                      className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "clay-chip text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {profileLabel(p.name)}
                    </button>
                    {profiles.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Delete profile ${profileLabel(p.name)}`}
                        title={
                          isActive
                            ? "Switch away before deleting"
                            : "Delete this profile (only if it has no saved resumes)"
                        }
                        onClick={() => setToDeleteProfile(p)}
                        className="absolute -right-1.5 -top-1.5 rounded-full bg-background p-0.5 text-muted-foreground shadow-sm ring-1 ring-border/60 transition-colors hover:text-rose-600"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </div>
                );
              })}
              <ClayButton
                variant="ghost"
                size="sm"
                onClick={startCreateProfile}
                aria-pressed={createMode}
              >
                <UserRoundPlus /> New profile
              </ClayButton>
            </div>
          )}

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
                shareSlug={savedResume?.shareSlug ?? null}
                onCreateShare={handleCreateShare}
                onRevokeShare={handleRevokeShare}
              />
            </SectionBoundary>
          ) : showWizard ? (
            /* Wizard */
            <SectionBoundary key="wizard-section">
              <ResumeWizard
                key={
                  createMode
                    ? "wizard-create"
                    : (activeProfileId ?? "wizard-default")
                }
                initialProfile={
                  createMode
                    ? null
                    : activeProfileId && activeProfile
                      ? {
                          fullName: activeProfile.fullName,
                          title: activeProfile.title,
                          email: activeProfile.email,
                          phone: activeProfile.phone,
                          location: activeProfile.location,
                          portfolioUrl: activeProfile.portfolioUrl,
                          summary: activeProfile.summary,
                          skills: activeProfile.skills,
                          experience: activeProfile.experience,
                          education: activeProfile.education,
                        }
                      : profile
                }
                targetProfileId={createMode ? null : (activeProfileId ?? null)}
                targetProfileName={
                  createMode ? null : profileLabel(activeProfile?.name)
                }
                createMode={createMode}
                profileNameDraft={profileNameDraft}
                onProfileNameDraftChange={setProfileNameDraft}
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

      <ConfirmationModal
        open={toDeleteProfile !== null}
        title={`Delete profile “${profileLabel(toDeleteProfile?.name)}”?`}
        message="Only empty profiles can be deleted — if it still has tailored resumes, move or delete those first. The resumes' contact details come from the profile."
        confirmLabel="Delete profile"
        onConfirm={handleDeleteProfile}
        onCancel={() => setToDeleteProfile(null)}
        busy={isDeletingProfile}
      />
    </div>
  );
}
