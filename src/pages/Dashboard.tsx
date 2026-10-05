import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import type { TailorResult } from "@/convex/ai";
import { AppHeader } from "@/components/clay/AppHeader";
import { ClayButton } from "@/components/clay/ClayButton";
import { ClayCard } from "@/components/clay/ClayCard";
import { ConfirmationModal } from "@/components/clay/ConfirmationModal";
import { ResumeResult } from "@/components/clay/ResumeResult";
import { ResumeWizard } from "@/components/clay/ResumeWizard";
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

  const [result, setResult] = useState<{
    jobTitle: string;
    companyName: string;
    jobDescription: string;
    result: TailorResult;
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isBoosting, setIsBoosting] = useState(false);
  const [viewingSaved, setViewingSaved] = useState(false);
  const [toDelete, setToDelete] = useState<SavedResume | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

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
      toast.success("Resume saved to your collection.");
      setResult(null);
      setViewingSaved(false);
      setShowWizard(false);
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

  return (
    <div>
      <AppHeader />
      <main className="clay-bg min-h-[calc(100vh-4.5rem)] px-4 pb-16 pt-6 sm:px-6">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
          {/* Greeting */}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="clay-title text-3xl sm:text-4xl">
                Resume studio
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Tailor your resume to any job posting and score what businesses
                are looking for.
              </p>
            </div>
            <ClayButton size="lg" onClick={startNewTailoring}>
              <Wand2 /> New tailoring
            </ClayButton>
          </div>

          {/* Result (after generation) */}
          {result ? (
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
              isSaving={isSaving}
              viewingSaved={viewingSaved}
            />
          ) : showWizard ? (
            /* Wizard */
            <ResumeWizard
              initialProfile={profile ?? null}
              onGenerated={handleGenerated}
            />
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
                )}
              </section>
            </div>
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
