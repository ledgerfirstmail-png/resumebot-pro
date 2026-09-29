import { cn } from "@/lib/utils";
import type { Doc } from "@/convex/_generated/dataModel";
import { Eye, FileText, Star, Trash2 } from "lucide-react";
import { ClayButton } from "./ClayButton";

function scoreTone(score: number) {
  if (score >= 90) return "bg-clay-mint text-emerald-800";
  if (score >= 75) return "bg-clay-sky text-sky-800";
  if (score >= 55) return "bg-clay-butter text-amber-800";
  return "bg-clay-blush text-rose-800";
}

export function SavedResumeCard({
  resume,
  onView,
  onDelete,
}: {
  resume: Doc<"tailoredResumes">;
  onView: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="clay-card clay-card-hover flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="clay-orb size-11 bg-clay-sky p-2.5">
            <FileText className="size-full text-sky-800" />
          </span>
          <div>
            <p className="text-sm font-bold leading-tight">{resume.jobTitle}</p>
            <p className="text-xs text-muted-foreground">{resume.companyName}</p>
          </div>
        </div>
        <span
          className={cn(
            "clay-orb h-9 min-w-14 px-3 text-sm font-extrabold tabular-nums",
            scoreTone(resume.score),
          )}
        >
          {resume.score}%
        </span>
      </div>
      <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
        {resume.summary}
      </p>
      <div className="flex gap-2">
        <ClayButton size="sm" variant="soft" onClick={onView} className="flex-1">
          <Eye /> View
        </ClayButton>
        <ClayButton
          size="sm"
          variant="ghost"
          onClick={onDelete}
          aria-label={`Delete resume for ${resume.jobTitle}`}
          className="text-rose-600 hover:text-rose-700"
        >
          <Trash2 />
        </ClayButton>
      </div>
    </div>
  );
}

export function SavedResumesEmptyState() {
  return (
    <div className="clay-card flex flex-col items-center gap-3 p-8 text-center">
      <span className="clay-orb size-12 bg-clay-butter">
        <Star className="size-5 text-amber-700" />
      </span>
      <p className="text-sm font-bold">No saved resumes yet</p>
      <p className="max-w-xs text-xs leading-5 text-muted-foreground">
        Tailor your resume for a job and save it — every version with its score
        lives here.
      </p>
    </div>
  );
}
