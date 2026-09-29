import type { TailorResult } from "@/convex/ai";
import { Check, Copy, FileText, Printer, RefreshCcw, Save } from "lucide-react";
import { useState } from "react";
import type { ResumeProfileData } from "@/types/resume";
import { ClayButton } from "./ClayButton";
import { ClayCard } from "./ClayCard";
import { ResumeDocument } from "./ResumeDocument";
import { ScoreBreakdown, ScoreGauge } from "./ScoreGauge";

export interface ResumeResultProps {
  jobTitle: string;
  companyName: string;
  result: TailorResult;
  contact: ResumeProfileData;
  onSave: () => void;
  onRefine: () => void;
  isSaving: boolean;
  /** True when showing an already-saved resume (hides the save action). */
  viewingSaved?: boolean;
}

/** Post-generation panel: score, breakdown, and the tailored document. */
export function ResumeResult({
  jobTitle,
  companyName,
  result,
  contact,
  onSave,
  onRefine,
  isSaving,
  viewingSaved = false,
}: ResumeResultProps) {
  const [copied, setCopied] = useState(false);

  const resume: ResumeProfileData = {
    ...contact,
    summary: result.summary,
    skills: result.skills,
    experience: result.experience,
    education: result.education,
  };

  const handleCopy = async () => {
    const lines: string[] = [
      resume.fullName,
      resume.title,
      [resume.email, resume.phone, resume.location, resume.portfolioUrl]
        .filter(Boolean)
        .join(" • "),
      "",
      "SUMMARY",
      resume.summary,
      "",
      "SKILLS",
      resume.skills.join(" • "),
      "",
      "EXPERIENCE",
    ];
    for (const job of resume.experience) {
      lines.push(`${job.title} — ${job.company} (${job.startDate} – ${job.endDate})`);
      for (const b of job.bullets) lines.push(`  • ${b}`);
      lines.push("");
    }
    lines.push("EDUCATION");
    for (const edu of resume.education) {
      lines.push(`${edu.degree} — ${edu.school} (${edu.gradYear})`);
    }
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrint = () => window.print();

  return (
    <div className="flex flex-col gap-6">
      {/* Header row */}
      <ClayCard className="flex flex-col items-center gap-8 sm:flex-row sm:items-center sm:gap-10">
        <ScoreGauge score={result.score} className="shrink-0" />
        <div className="flex flex-col gap-3">
          <span className="clay-chip w-fit px-3 py-1.5 text-xs font-bold uppercase tracking-widest">
            Tailored resume
          </span>
          <h2 className="clay-title text-2xl sm:text-3xl">
            {jobTitle} <span className="text-muted-foreground">· {companyName}</span>
          </h2>
          <p className="max-w-xl text-sm leading-6 text-muted-foreground">
            Bullets were rewritten to mirror the job's own language — using only
            your real experience. Copy, print, or tailor for another job below.
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            <ClayButton onClick={handleCopy} variant="soft">
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied!" : "Copy text"}
            </ClayButton>
            <ClayButton onClick={handlePrint} variant="soft">
              <Printer /> Print / PDF
            </ClayButton>
            {!viewingSaved && (
              <ClayButton onClick={onSave} disabled={isSaving}>
                {isSaving ? <RefreshCcw className="animate-spin" /> : <Save />}
                {isSaving ? "Saving…" : "Save to collection"}
              </ClayButton>
            )}
            <ClayButton onClick={onRefine} variant="ghost">
              <FileText /> New tailoring
            </ClayButton>
          </div>
        </div>
      </ClayCard>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
        {/* Score breakdown */}
        <ClayCard>
          <h3 className="clay-title mb-4 text-lg">What businesses are looking for</h3>
          <ScoreBreakdown breakdown={result.breakdown} />
          {result.keywords.length > 0 && (
            <div className="mt-6 border-t border-border/60 pt-5">
              <h4 className="mb-2.5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Keywords the AI worked in
              </h4>
              <div className="flex flex-wrap gap-2">
                {result.keywords.map((kw) => (
                  <span key={kw} className="clay-chip px-3 py-1.5 text-xs font-semibold">
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}
        </ClayCard>

        {/* Document preview */}
        <div className="clay-card p-4 sm:p-6">
          <h3 className="clay-title mb-4 text-lg">Your tailored resume</h3>
          <div className="clay-scroll clay-inset max-h-[640px] overflow-y-auto rounded-3xl p-3">
            <ResumeDocument resume={resume} />
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Printing renders just this sheet — clean, ATS-friendly, pastel-free.
          </p>
        </div>
      </div>
    </div>
  );
}
