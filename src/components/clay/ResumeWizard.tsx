import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { TailorResult } from "@/convex/ai";
import { zodResolver } from "@hookform/resolvers/zod";
import { useAction, useMutation } from "convex/react";
import { motion } from "framer-motion";
import {
  Briefcase,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Link2,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  UserRound,
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { getSessionId } from "@/lib/session";
import {
  jobSchema,
  mergeFormValues,
  profileSchema,
  profileToFormValues,
  type JobFormValues,
  type ProfileFormValues,
} from "@/lib/resumeSchemas";
import type { ResumeProfileData } from "@/types/resume";
import { ClayButton } from "./ClayButton";
import { ClayCard } from "./ClayCard";

export interface WizardOutput {
  result: TailorResult;
  job: JobFormValues;
  profileId: Id<"resumeProfiles">;
}

interface ResumeWizardProps {
  /** Previously saved master profile used to prefill step 1. */
  initialProfile: ResumeProfileData | null;
  onGenerated: (output: WizardOutput) => void;
}

const STEPS = [
  { key: "profile", label: "Your Profile", icon: UserRound },
  { key: "job", label: "Job Target", icon: Briefcase },
  { key: "generate", label: "Generate", icon: Wand2 },
] as const;

const FIELD_INPUT =
  "clay-inset h-11 w-full rounded-2xl px-4 text-sm outline-none placeholder:text-muted-foreground/70 focus-visible:ring-4 focus-visible:ring-ring/30";
const FIELD_TEXTAREA =
  "clay-inset min-h-28 w-full rounded-2xl px-4 py-3 text-sm leading-6 outline-none placeholder:text-muted-foreground/70 focus-visible:ring-4 focus-visible:ring-ring/30";

function ClayField({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
        {label}
        {hint ? (
          <span className="ml-2 normal-case tracking-normal">{hint}</span>
        ) : null}
      </span>
      {children}
      {error && (
        <span className="text-xs font-semibold text-rose-600">{error}</span>
      )}
    </label>
  );
}

const EMPTY_FORM: ProfileFormValues = {
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

const DRAFT_KEY = "tailorly_wizard_draft_v1";

interface WizardDraft {
  step?: number;
  profile?: Record<string, unknown>;
  job?: Record<string, unknown>;
}

/** Read the locally persisted wizard draft, if any (survives refresh). */
function readDraft(): WizardDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WizardDraft;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function draftProfileDefaults(draft: WizardDraft | null): ProfileFormValues {
  if (!draft?.profile) return EMPTY_FORM;
  const p = draft.profile as Partial<ProfileFormValues>;
  return {
    ...EMPTY_FORM,
    ...p,
    skills: p.skills ?? [],
    experience: p.experience ?? [],
    education: p.education ?? [],
  };
}

function draftJobDefaults(draft: WizardDraft | null): JobFormValues {
  const base: JobFormValues = { jobTitle: "", companyName: "", jobDescription: "" };
  if (!draft?.job) return base;
  return { ...base, ...(draft.job as Partial<JobFormValues>) };
}

export function ResumeWizard({ initialProfile, onGenerated }: ResumeWizardProps) {
  // Draft read once on mount via lazy state init (render-safe, unlike a ref).
  const [restoredDraft] = useState<WizardDraft | null>(() => readDraft());

  const [step, setStep] = useState(() => {
    const s = restoredDraft?.step;
    return typeof s === "number" && s >= 0 && s < 2 ? s : 0;
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [skillDraft, setSkillDraft] = useState("");
  const [urlDraft, setUrlDraft] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const saveProfile = useMutation(api.resumes.saveProfile);
  const tailorResume = useAction(api.ai.tailorResume);
  const extractJobPosting = useAction(api.ai.extractJobPosting);
  const parseResumeText = useAction(api.ai.parseResumeText);
  const [resumeDraft, setResumeDraft] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [showResumeImport, setShowResumeImport] = useState(false);

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: restoredDraft
      ? draftProfileDefaults(restoredDraft)
      : initialProfile
        ? profileToFormValues(initialProfile)
        : EMPTY_FORM,
  });
  const experienceArray = useFieldArray({
    control: profileForm.control,
    name: "experience",
  });
  const educationArray = useFieldArray({
    control: profileForm.control,
    name: "education",
  });
  const skills = useWatch({ control: profileForm.control, name: "skills" });

  const jobForm = useForm<JobFormValues>({
    resolver: zodResolver(jobSchema),
    defaultValues: draftJobDefaults(restoredDraft),
  });

  // --- Draft autosave: a refresh mid-paste must not lose anything. ---
  const profileTick = useWatch({ control: profileForm.control });
  const jobTick = useWatch({ control: jobForm.control });
  const [draftRetired, setDraftRetired] = useState(false);
  const draftTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Generation succeeded — clear the draft and stop persisting.
    if (draftRetired) {
      window.clearTimeout(draftTimerRef.current);
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore
      }
      return;
    }
    window.clearTimeout(draftTimerRef.current);
    draftTimerRef.current = window.setTimeout(() => {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({
            step: step === 2 ? 1 : step,
            profile: profileForm.getValues(),
            job: jobForm.getValues(),
          }),
        );
      } catch {
        // Storage unavailable — drafts simply won't persist.
      }
    }, 600);
    return () => window.clearTimeout(draftTimerRef.current);
  }, [profileTick, jobTick, step, draftRetired, profileForm, jobForm]);

  const addSkill = () => {
    const value = skillDraft.trim();
    if (!value) return;
    const current = profileForm.getValues("skills") ?? [];
    if (current.some((s) => s.toLowerCase() === value.toLowerCase())) {
      setSkillDraft("");
      return;
    }
    profileForm.setValue("skills", [...current, value], { shouldDirty: true });
    setSkillDraft("");
  };

  const removeSkill = (skill: string) => {
    const current = profileForm.getValues("skills") ?? [];
    profileForm.setValue(
      "skills",
      current.filter((s) => s !== skill),
      { shouldDirty: true },
    );
  };

  /** Import a posting from its URL instead of pasting the text (B2). */
  const handleImportUrl = async () => {
    const url = urlDraft.trim();
    if (!/^https?:\/\/\S/i.test(url)) {
      toast.error("Paste a full job posting URL, starting with https://");
      return;
    }
    setIsImporting(true);
    try {
      const extracted = await extractJobPosting({
        url,
        sessionId: getSessionId(),
      });
      jobForm.setValue("jobTitle", extracted.jobTitle, { shouldDirty: true });
      jobForm.setValue("companyName", extracted.companyName, {
        shouldDirty: true,
      });
      jobForm.setValue("jobDescription", extracted.jobDescription, {
        shouldDirty: true,
      });
      setUrlDraft("");
      toast.success(
        `Imported “${extracted.jobTitle}” — give it a quick read before generating.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't import that posting — paste the text instead.",
      );
    } finally {
      setIsImporting(false);
    }
  };

  /** B5 — paste plain-text resume → AI parse → fill only the empty fields. */
  const handleParseResume = async () => {
    const text = resumeDraft.trim();
    if (text.length < 120) {
      toast.error("Paste at least a few lines of your resume text first.");
      return;
    }
    setIsParsing(true);
    try {
      const parsed = await parseResumeText({
        text,
        sessionId: getSessionId(),
      });
      profileForm.reset(mergeFormValues(profileForm.getValues(), parsed));
      setResumeDraft("");
      setShowResumeImport(false);
      toast.success(
        "Resume imported — review each field before generating.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't read that resume — paste a cleaner copy and try again.",
      );
    } finally {
      setIsParsing(false);
    }
  };

  const handleGenerate = async (job: JobFormValues) => {
    setIsGenerating(true);
    setStep(2);
    try {
      const values = profileForm.getValues();
      const profile: ResumeProfileData = {
        fullName: values.fullName,
        title: values.title,
        email: values.email,
        phone: values.phone,
        location: values.location,
        portfolioUrl: values.portfolioUrl ?? "",
        summary: values.summary,
        skills: values.skills,
        experience: values.experience.map((e) => ({
          company: e.company,
          title: e.title,
          startDate: e.startDate,
          endDate: e.endDate,
          bullets: e.bulletsText
            .split("\n")
            .map((b) => b.trim())
            .filter(Boolean),
        })),
        education: values.education,
      };

      const profileId = await saveProfile({ profile });

      const result = await tailorResume({
        profileJson: JSON.stringify(profile),
        jobTitle: job.jobTitle,
        companyName: job.companyName,
        jobDescription: job.jobDescription,
        sessionId: getSessionId(),
      });

      // Success — retire the local draft so a refresh starts clean. Every
      // scheduled save fired long before generation finished (they're 600ms),
      // so removing it here can't be overwritten by a pending timer.
      setDraftRetired(true);
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // ignore
      }

      onGenerated({ result, job, profileId });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Something went wrong while generating your resume.",
      );
      setStep(1);
    } finally {
      setIsGenerating(false);
    }
  };

  const jobDescription = useWatch({
    control: jobForm.control,
    name: "jobDescription",
  });

  const experienceError =
    profileForm.formState.errors.experience?.message ??
    profileForm.formState.errors.experience?.root?.message;
  const educationError =
    profileForm.formState.errors.education?.message ??
    profileForm.formState.errors.education?.root?.message;
  const skillsError = profileForm.formState.errors.skills?.message;

  return (
    <ClayCard className="p-0">
      {/* Stepper */}
      <div className="flex items-center gap-2 border-b border-border/60 p-5 sm:gap-3 sm:p-6">
        {STEPS.map((s, i) => {
          const isDone = i < step || (i === 2 && isGenerating);
          const isActive = i === step;
          return (
            <div
              key={s.key}
              className="flex flex-1 items-center gap-2 sm:gap-2.5"
              aria-current={isActive ? "step" : undefined}
            >
              <span
                className={
                  "clay-orb size-9 shrink-0 text-sm font-extrabold " +
                  (isActive
                    ? "bg-primary text-primary-foreground"
                    : isDone
                      ? "bg-clay-mint text-emerald-800"
                      : "bg-muted text-muted-foreground")
                }
              >
                {isDone && !isActive ? "✓" : i + 1}
              </span>
              <span
                className={
                  "hidden text-sm font-bold sm:block " +
                  (isActive ? "text-foreground" : "text-muted-foreground")
                }
              >
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <span className="h-1 flex-1 rounded-full bg-border/70" />
              )}
            </div>
          );
        })}
      </div>

      <div className="p-5 sm:p-8">
        {step === 0 && (
          <form
            onSubmit={profileForm.handleSubmit(() => setStep(1))}
            className="flex flex-col gap-5"
          >
            <div className="rounded-2xl border border-dashed border-border/70 bg-background/60 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <ClipboardPaste className="size-4 text-primary" />
                  Have a resume already? Paste it and skip the typing.
                </div>
                <ClayButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowResumeImport((v) => !v)}
                  aria-expanded={showResumeImport}
                >
                  {showResumeImport ? "Not now" : "Paste to autofill"}
                </ClayButton>
              </div>
              {showResumeImport && (
                <div className="mt-3 flex flex-col gap-2">
                  <textarea
                    className={FIELD_TEXTAREA}
                    value={resumeDraft}
                    onChange={(e) => setResumeDraft(e.target.value)}
                    placeholder="Paste your resume as plain text — contact details, summary, roles, bullets, education…"
                    aria-label="Resume text to import"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <ClayButton
                      onClick={handleParseResume}
                      disabled={isParsing}
                    >
                      {isParsing ? (
                        <Loader2 className="animate-spin" />
                      ) : (
                        <Sparkles />
                      )}
                      {isParsing ? "Reading…" : "Autofill my profile"}
                    </ClayButton>
                    <span className="text-xs text-muted-foreground">
                      Fills whatever is empty — anything you already typed is
                      kept. Counts toward your daily AI budget.
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <ClayField
                label="Full name"
                error={profileForm.formState.errors.fullName?.message}
              >
                <input
                  className={FIELD_INPUT}
                  placeholder="Ada Lovelace"
                  {...profileForm.register("fullName")}
                />
              </ClayField>
              <ClayField
                label="Professional title"
                error={profileForm.formState.errors.title?.message}
              >
                <input
                  className={FIELD_INPUT}
                  placeholder="Senior Product Designer"
                  {...profileForm.register("title")}
                />
              </ClayField>
              <ClayField
                label="Email"
                error={profileForm.formState.errors.email?.message}
              >
                <input
                  className={FIELD_INPUT}
                  type="email"
                  placeholder="ada@example.com"
                  {...profileForm.register("email")}
                />
              </ClayField>
              <ClayField
                label="Phone"
                error={profileForm.formState.errors.phone?.message}
              >
                <input
                  className={FIELD_INPUT}
                  placeholder="(555) 010-0100"
                  {...profileForm.register("phone")}
                />
              </ClayField>
              <ClayField
                label="Location"
                error={profileForm.formState.errors.location?.message}
              >
                <input
                  className={FIELD_INPUT}
                  placeholder="San Francisco, CA"
                  {...profileForm.register("location")}
                />
              </ClayField>
              <ClayField
                label="Portfolio / LinkedIn"
                hint="optional"
                error={profileForm.formState.errors.portfolioUrl?.message}
              >
                <input
                  className={FIELD_INPUT}
                  placeholder="linkedin.com/in/ada"
                  {...profileForm.register("portfolioUrl")}
                />
              </ClayField>
            </div>

            <ClayField
              label="Professional summary"
              error={profileForm.formState.errors.summary?.message}
            >
              <textarea
                className={FIELD_TEXTAREA}
                placeholder="Two or three sentences about who you are and what you do best."
                {...profileForm.register("summary")}
              />
            </ClayField>

            {/* Skills */}
            <div className="flex flex-col gap-2">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Skills
              </span>
              <div className="flex gap-2">
                <input
                  className={FIELD_INPUT}
                  placeholder="Type a skill and press Enter"
                  value={skillDraft}
                  onChange={(e) => setSkillDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addSkill();
                    }
                  }}
                />
                <ClayButton
                  variant="soft"
                  size="icon"
                  onClick={addSkill}
                  aria-label="Add skill"
                >
                  <Plus />
                </ClayButton>
              </div>
              {skillsError && (
                <span className="text-xs font-semibold text-rose-600">
                  {skillsError}
                </span>
              )}
              <div className="flex flex-wrap gap-2">
                {(skills ?? []).map((skill) => (
                  <span
                    key={skill}
                    className="clay-chip inline-flex items-center gap-1.5 py-1.5 pl-3.5 pr-2 text-xs font-semibold"
                  >
                    {skill}
                    <button
                      type="button"
                      onClick={() => removeSkill(skill)}
                      className="rounded-full p-0.5 hover:bg-white/60"
                      aria-label={`Remove ${skill}`}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Experience */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Experience
                </span>
                <ClayButton
                  variant="soft"
                  size="sm"
                  onClick={() =>
                    experienceArray.append({
                      company: "",
                      title: "",
                      startDate: "",
                      endDate: "",
                      bulletsText: "",
                    })
                  }
                >
                  <Plus /> Add role
                </ClayButton>
              </div>
              {experienceError && (
                <span className="text-xs font-semibold text-rose-600">
                  {experienceError}
                </span>
              )}
              {experienceArray.fields.length === 0 && (
                <p className="clay-inset rounded-2xl px-4 py-3 text-sm text-muted-foreground">
                  No roles yet — add your most recent job first.
                </p>
              )}
              {experienceArray.fields.map((field, index) => (
                <div
                  key={field.id}
                  className="clay-inset flex flex-col gap-3 rounded-3xl p-4"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold">Role {index + 1}</span>
                    <ClayButton
                      variant="ghost"
                      size="sm"
                      onClick={() => experienceArray.remove(index)}
                      aria-label="Remove role"
                    >
                      <Trash2 />
                    </ClayButton>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <ClayField
                      label="Job title"
                      error={
                        profileForm.formState.errors.experience?.[index]?.title
                          ?.message
                      }
                    >
                      <input
                        className={FIELD_INPUT}
                        placeholder="Product Designer"
                        {...profileForm.register(`experience.${index}.title`)}
                      />
                    </ClayField>
                    <ClayField
                      label="Company"
                      error={
                        profileForm.formState.errors.experience?.[index]
                          ?.company?.message
                      }
                    >
                      <input
                        className={FIELD_INPUT}
                        placeholder="Acme Inc."
                        {...profileForm.register(`experience.${index}.company`)}
                      />
                    </ClayField>
                    <ClayField
                      label="Start date"
                      error={
                        profileForm.formState.errors.experience?.[index]
                          ?.startDate?.message
                      }
                    >
                      <input
                        className={FIELD_INPUT}
                        placeholder="Jan 2021"
                        {...profileForm.register(
                          `experience.${index}.startDate`,
                        )}
                      />
                    </ClayField>
                    <ClayField
                      label="End date"
                      error={
                        profileForm.formState.errors.experience?.[index]
                          ?.endDate?.message
                      }
                    >
                      <input
                        className={FIELD_INPUT}
                        placeholder="Present"
                        {...profileForm.register(`experience.${index}.endDate`)}
                      />
                    </ClayField>
                  </div>
                  <ClayField
                    label="Achievement bullets"
                    hint="one per line"
                    error={
                      profileForm.formState.errors.experience?.[index]
                        ?.bulletsText?.message
                    }
                  >
                    <textarea
                      className={FIELD_TEXTAREA}
                      placeholder={
                        "Led redesign of onboarding, lifting activation 18%\nShipped design system used by 4 squads"
                      }
                      {...profileForm.register(
                        `experience.${index}.bulletsText`,
                      )}
                    />
                  </ClayField>
                </div>
              ))}
            </div>

            {/* Education */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Education
                </span>
                <ClayButton
                  variant="soft"
                  size="sm"
                  onClick={() =>
                    educationArray.append({ school: "", degree: "", gradYear: "" })
                  }
                >
                  <Plus /> Add school
                </ClayButton>
              </div>
              {educationError && (
                <span className="text-xs font-semibold text-rose-600">
                  {educationError}
                </span>
              )}
              {educationArray.fields.length === 0 && (
                <p className="clay-inset rounded-2xl px-4 py-3 text-sm text-muted-foreground">
                  No education yet — add your degree or bootcamp.
                </p>
              )}
              {educationArray.fields.map((field, index) => (
                <div
                  key={field.id}
                  className="clay-inset grid gap-3 rounded-3xl p-4 sm:grid-cols-3"
                >
                  <ClayField
                    label="Degree"
                    error={
                      profileForm.formState.errors.education?.[index]?.degree
                        ?.message
                    }
                  >
                    <input
                      className={FIELD_INPUT}
                      placeholder="B.S. Computer Science"
                      {...profileForm.register(`education.${index}.degree`)}
                    />
                  </ClayField>
                  <ClayField
                    label="School"
                    error={
                      profileForm.formState.errors.education?.[index]?.school
                        ?.message
                    }
                  >
                    <input
                      className={FIELD_INPUT}
                      placeholder="State University"
                      {...profileForm.register(`education.${index}.school`)}
                    />
                  </ClayField>
                  <ClayField
                    label="Grad year"
                    error={
                      profileForm.formState.errors.education?.[index]?.gradYear
                        ?.message
                    }
                  >
                    <input
                      className={FIELD_INPUT}
                      placeholder="2020"
                      {...profileForm.register(`education.${index}.gradYear`)}
                    />
                  </ClayField>
                  <div className="sm:col-span-3">
                    <ClayButton
                      variant="ghost"
                      size="sm"
                      onClick={() => educationArray.remove(index)}
                    >
                      <Trash2 /> Remove school
                    </ClayButton>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end">
              <ClayButton type="submit" size="lg">
                Next: Job target
                <ChevronRight />
              </ClayButton>
            </div>
          </form>
        )}

        {step === 1 && (
          <form
            onSubmit={jobForm.handleSubmit(handleGenerate)}
            className="flex flex-col gap-5"
          >
            {/* Import the posting from its URL instead of pasting */}
            <div className="clay-inset flex flex-col gap-2 rounded-3xl p-4">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Import from a URL{" "}
                <span className="ml-2 font-normal normal-case tracking-normal">
                  paste the link — we'll pull the posting in
                </span>
              </span>
              <div className="flex gap-2">
                <input
                  className={FIELD_INPUT}
                  type="url"
                  inputMode="url"
                  aria-label="Job posting URL"
                  placeholder="https://jobs.example.com/senior-product-designer"
                  value={urlDraft}
                  onChange={(e) => setUrlDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleImportUrl();
                    }
                  }}
                />
                <ClayButton
                  variant="soft"
                  onClick={() => void handleImportUrl()}
                  disabled={isImporting}
                >
                  {isImporting ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Link2 />
                  )}
                  {isImporting ? "Importing…" : "Import"}
                </ClayButton>
              </div>
              <p className="text-xs text-muted-foreground">
                Works with most job boards (Greenhouse, Lever, Ashby…). Some
                sites block readers — if import fails, paste the posting text.
                Imports count toward your daily AI runs.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <ClayField
                label="Job title"
                error={jobForm.formState.errors.jobTitle?.message}
              >
                <input
                  className={FIELD_INPUT}
                  placeholder="Senior Product Designer"
                  {...jobForm.register("jobTitle")}
                />
              </ClayField>
              <ClayField
                label="Company"
                error={jobForm.formState.errors.companyName?.message}
              >
                <input
                  className={FIELD_INPUT}
                  placeholder="Dream Co."
                  {...jobForm.register("companyName")}
                />
              </ClayField>
            </div>
            <ClayField
              label="Paste the full job description"
              hint={`${jobDescription.length} chars`}
              error={jobForm.formState.errors.jobDescription?.message}
            >
              <textarea
                className="clay-inset min-h-56 w-full rounded-2xl px-4 py-3 text-sm leading-6 outline-none placeholder:text-muted-foreground/70 focus-visible:ring-4 focus-visible:ring-ring/30"
                placeholder="Paste the entire posting here — responsibilities, requirements, the works. The more complete it is, the better your tailored resume scores."
                {...jobForm.register("jobDescription")}
              />
            </ClayField>
            <p className="text-sm text-muted-foreground">
              Tailorly rewrites your bullets to mirror the job's own language —
              honestly. It never invents experience you don't have.
            </p>
            <div className="flex items-center justify-between gap-3">
              <ClayButton variant="soft" onClick={() => setStep(0)}>
                <ChevronLeft /> Back
              </ClayButton>
              <ClayButton type="submit" size="lg" disabled={isGenerating}>
                <Sparkles /> Generate tailored resume
              </ClayButton>
            </div>
          </form>
        )}

        {step === 2 && (
          <div className="flex flex-col items-center gap-5 py-14 text-center">
            <span className="clay-orb size-16 bg-clay-butter">
              {isGenerating ? (
                <Loader2 className="size-7 animate-spin text-amber-700" />
              ) : (
                <Wand2 className="size-7 text-amber-700" />
              )}
            </span>
            <div>
              <p className="clay-title text-lg">
                {isGenerating
                  ? "Sculpting your tailored resume…"
                  : "Ready when you are"}
              </p>
              <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
                {isGenerating
                  ? "Re-reading the job description, mirroring its language, and polishing every bullet. This usually takes 15–30 seconds."
                  : "Press Generate to start tailoring."}
              </p>
            </div>
            {isGenerating && (
              <div className="flex gap-2">
                {["Profile saved", "Scoring match", "Writing bullets"].map(
                  (label, i) => (
                    <motion.span
                      key={label}
                      initial={{ opacity: 0.4 }}
                      animate={{ opacity: [0.4, 1, 0.4] }}
                      transition={{
                        duration: 1.6,
                        repeat: Infinity,
                        delay: i * 0.4,
                      }}
                      className="clay-chip px-3 py-1.5 text-xs font-semibold"
                    >
                      {label}
                    </motion.span>
                  ),
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </ClayCard>
  );
}
