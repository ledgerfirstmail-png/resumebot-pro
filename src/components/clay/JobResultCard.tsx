import { cn } from "@/lib/utils";
import { ExternalLink, Loader2, MapPin, Wand2 } from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import { scoreClasses } from "@/lib/scoreBadge";
import { tierLevel } from "@/lib/resultTiers";
import { ClayButton } from "./ClayButton";
import { ClayCard } from "./ClayCard";

type JobMatch = Doc<"jobMatches">;

/** Days-ago label in the same voice the board already uses. */
function daysAgo(ts: number): string {
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/** One-line status label for the row's right column. */
function statusLine(match: JobMatch): string {
  const parts: string[] = [];
  parts.push(match.source);
  if (match.postedAt) parts.push(daysAgo(match.postedAt));
  if (match.status === "tailored") parts.push("tailored");
  if (match.status === "applied") parts.push("applied");
  if (match.status === "interview") parts.push("interviewing");
  if (
    match.status === "applied" ||
    match.status === "tailored"
  ) {
    if (match.tailoredScore != null) parts.push(`${match.tailoredScore}% resume`);
  }
  return parts.join(" · ");
}

export interface JobResultCardProps {
  match: JobMatch;
  selected: boolean;
  tailoring: boolean;
  statusBusy: boolean;
  onTailor: () => void;
  onToggleAutoApply: () => void;
  /** Only tailored/applied rows can move through the pipeline. */
  canShowPipeline: boolean;
  onInterview: () => void;
  onReject: () => void;
}

/**
 * The radar's result row — information-first: title + company + location and
 * the score badge lead, with the fit story compressed into a quiet line
 * (percent, matched count, one missing skill to gain). One primary action
 * (Tailor), auto-apply as a checkbox, and pipeline moves only after a
 * tailoring exists.
 */
export function JobResultCard({
  match,
  selected,
  tailoring,
  statusBusy,
  onTailor,
  onToggleAutoApply,
  canShowPipeline,
  onInterview,
  onReject,
}: JobResultCardProps) {
  const closed =
    match.status === "applied" ||
    match.status === "interview" ||
    match.status === "rejected";
  const missingCount = match.missingKeywords.length;
  const tier = tierLevel(match.score);

  return (
    <ClayCard
      className={cn(
        "flex min-w-0 flex-col gap-2 p-4 sm:p-5",
        selected && "ring-2 ring-primary/50",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-bold leading-6">
            {match.title}
          </h3>
          <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-muted-foreground">
            <MapPin className="size-3.5 shrink-0" />
            <span className="truncate">
              {match.company} · {match.location}
            </span>
          </p>
        </div>
        <span
          className={cn(
            "clay-chip shrink-0 px-2.5 py-1 text-sm font-black",
            scoreClasses(match.score),
          )}
          title={`Board match score ${match.score}% · ${tier === 2 ? "strong match" : tier === 1 ? "good match" : "worth a look"}`}
        >
          {match.score}%
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-muted-foreground">
        <span className="truncate">{statusLine(match)}</span>
        {match.matchedKeywords.length > 0 && (
          <span
            className="clay-chip px-2 py-0.5"
            title={match.matchedKeywords.slice(0, 8).join(", ")}
          >
            {match.matchedKeywords.length} skills matched
          </span>
        )}
        {missingCount > 0 && (
          <span
            className="rounded-full bg-amber-500/12 px-2 py-0.5"
            title={`Posting terms your resume doesn't cover yet: ${match.missingKeywords.slice(0, 8).join(", ")}`}
          >
            gain +{missingCount} skills:
          </span>
        )}
      </div>

      <div className="mt-auto flex items-center gap-2 pt-1">
        <ClayButton
          size="sm"
          onClick={onTailor}
          disabled={tailoring || closed}
          title="Rewrite your resume for this posting and score it"
        >
          {tailoring ? <Loader2Spin /> : <Wand2 className="size-4" />}
          {match.status === "tailored"
            ? "Re-tailor"
            : closed
              ? "Applied"
              : "Tailor"}
        </ClayButton>
        <label className="flex cursor-pointer select-none items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleAutoApply}
            disabled={closed}
            className="size-4 accent-primary"
            aria-label={`Select ${match.title} for auto-apply`}
          />
          Auto-apply
        </label>
        {canShowPipeline && (
          <>
            <ClayButton
              size="sm"
              variant="ghost"
              onClick={onInterview}
              disabled={statusBusy}
              title="Mark as interviewing"
            >
              Interview
            </ClayButton>
            <ClayButton
              size="sm"
              variant="ghost"
              onClick={onReject}
              disabled={statusBusy}
              title="Mark as rejected"
            >
              Reject
            </ClayButton>
          </>
        )}
        <a
          href={match.url}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1 whitespace-nowrap text-xs font-bold text-primary hover:underline"
          aria-label={`Open the ${match.title} posting at ${match.company}`}
        >
          Open <ExternalLink className="size-3.5" />
        </a>
      </div>
    </ClayCard>
  );
}

function Loader2Spin() {
  return <Loader2 className="size-4 animate-spin" />;
}
