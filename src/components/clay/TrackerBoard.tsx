import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  filterTrackerItems,
  sortTrackerItems,
  TRACKER_TABS,
  trackerCounts,
  type TrackerItem,
  type TrackerStatus,
} from "@/lib/tracker";
import { useMutation, useQuery } from "convex/react";
import {
  CalendarClock,
  ExternalLink,
  Loader2,
  RotateCcw,
  Store,
  XCircle,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ClayButton } from "./ClayButton";
import { ClayCard } from "./ClayCard";

type TrackerTab = TrackerStatus | "all";

/** Status pill colors — one hue per pipeline stage. */
const STATUS_STYLES: Record<TrackerStatus, string> = {
  new: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
  tailored: "bg-indigo-500/12 text-indigo-600 dark:text-indigo-400",
  applied: "bg-amber-500/12 text-amber-600 dark:text-amber-400",
  interview: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  rejected: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
};

const STATUS_LABELS: Record<TrackerStatus, string> = {
  new: "New",
  tailored: "Tailored",
  applied: "Applied",
  interview: "Interview",
  rejected: "Rejected",
};

function scoreClasses(score: number): string {
  if (score >= 80) {
    return "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400";
  }
  if (score >= 60) {
    return "bg-amber-500/12 text-amber-600 dark:text-amber-400";
  }
  return "bg-slate-500/12 text-slate-600 dark:text-slate-400";
}

function shortDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function toTrackerItem(doc: Doc<"jobMatches">): TrackerItem {
  return {
    id: doc._id,
    title: doc.title,
    company: doc.company,
    location: doc.location,
    url: doc.url,
    score: doc.score,
    status: doc.status,
    tailoredScore: doc.tailoredScore ?? undefined,
    appliedAt: doc.appliedAt ?? undefined,
    firstSeenAt: doc._creationTime,
  };
}

/** Manual next-steps per status — only moves that change something. */
function nextStatuses(status: TrackerStatus): TrackerStatus[] {
  switch (status) {
    case "new":
    case "tailored":
      return ["applied", "interview", "rejected"];
    case "applied":
      return ["interview", "rejected", "new"];
    case "interview":
      return ["rejected", "new"];
    case "rejected":
      return ["new"];
  }
}

const MOVE_TOASTS: Record<TrackerStatus, (title: string) => string> = {
  applied: (t) => `“${t}” marked as applied.`,
  interview: (t) => `“${t}” marked as interview — nice.`,
  rejected: (t) => `“${t}” marked as rejected.`,
  new: (t) => `“${t}” is back in the running.`,
  tailored: (t) => `“${t}” marked as tailored.`,
};

/**
 * Applications tracker (pass 22): every radar listing grouped by pipeline
 * stage. Pure grouping/sorting lives in lib/tracker (vitest-covered); this
 * component just renders tabs + rows and drives setJobStatus moves — the
 * same mutation the radar's inline controls use.
 */
export function TrackerBoard() {
  const docs = useQuery(api.jobs.listTracker);
  const setStatus = useMutation(api.jobs.setJobStatus);
  const [tab, setTab] = useState<TrackerTab>("all");
  const [movingId, setMovingId] = useState<string | null>(null);

  const items = useMemo(
    () => (docs ? docs.map(toTrackerItem) : []),
    [docs],
  );
  const counts = useMemo(() => trackerCounts(items), [items]);
  const visible = useMemo(
    () => sortTrackerItems(filterTrackerItems(items, tab)),
    [items, tab],
  );

  const move = async (item: TrackerItem, status: TrackerStatus) => {
    setMovingId(item.id);
    try {
      await setStatus({ jobId: item.id as Doc<"jobMatches">["_id"], status });
      toast.success(MOVE_TOASTS[status](item.title));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't update the listing.",
      );
    } finally {
      setMovingId(null);
    }
  };

  if (docs === undefined) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="clay-card h-28 animate-pulse rounded-3xl"
            aria-hidden
          />
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <ClayCard className="flex flex-col items-center gap-3 py-12 text-center">
        <span className="clay-orb size-14 bg-primary/10 text-primary">
          <Store className="size-6" />
        </span>
        <h2 className="clay-title text-lg">No pipeline yet</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Run a search on the Job Radar, then tailor or auto-apply to a
          listing — it shows up here so you can follow it from applied to
          interview.
        </p>
      </ClayCard>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div
        className="flex flex-wrap items-center gap-1.5"
        role="tablist"
        aria-label="Pipeline stages"
      >
        {TRACKER_TABS.map(({ key, label }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(key)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                active
                  ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                  : "bg-card text-muted-foreground ring-1 ring-border/60 hover:text-foreground"
              }`}
            >
              {label}
              <span className="ml-1.5 opacity-70">{counts[key]}</span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <ClayCard className="py-10 text-center text-sm text-muted-foreground">
          Nothing in {STATUS_LABELS[tab as TrackerStatus]} yet — move a row
          here from another stage.
        </ClayCard>
      ) : (
        visible.map((item) => (
          <ClayCard key={item.id} className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="truncate text-base font-bold">{item.title}</h3>
                <p className="truncate text-sm text-muted-foreground">
                  {item.company} · {item.location}
                </p>
              </div>
              <span
                className={`clay-chip shrink-0 px-2.5 py-1 text-sm font-black ${scoreClasses(item.score)}`}
                title={`Board match score ${item.score}%`}
              >
                {item.score}%
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span
                className={`rounded-full px-2 py-0.5 font-bold ${STATUS_STYLES[item.status]}`}
              >
                {STATUS_LABELS[item.status]}
              </span>
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="size-3" />
                seen {shortDate(item.firstSeenAt)}
              </span>
              {item.status === "applied" && item.appliedAt !== undefined && (
                <span>· applied {shortDate(item.appliedAt)}</span>
              )}
              {item.tailoredScore != null && (
                <span>· tailored to {item.tailoredScore}%</span>
              )}
              {item.status === "interview" && <span>· interviewing</span>}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
                title="Open the posting on the board"
              >
                <ExternalLink className="size-4" />
                Posting
              </a>
              {nextStatuses(item.status).map((status) =>
                status === "new" ? (
                  <ClayButton
                    key={status}
                    size="sm"
                    variant="ghost"
                    disabled={movingId === item.id}
                    onClick={() => void move(item, status)}
                    title="Clear the stage and keep it in the running"
                  >
                    {movingId === item.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <RotateCcw />
                    )}
                    Restore
                  </ClayButton>
                ) : (
                  <ClayButton
                    key={status}
                    size="sm"
                    variant="soft"
                    disabled={movingId === item.id}
                    onClick={() => void move(item, status)}
                    title={`Mark as ${STATUS_LABELS[status].toLowerCase()}`}
                  >
                    {movingId === item.id ? (
                      <Loader2 className="animate-spin" />
                    ) : status === "rejected" ? (
                      <XCircle />
                    ) : (
                      <CalendarClock />
                    )}
                    {STATUS_LABELS[status]}
                  </ClayButton>
                ),
              )}
            </div>
          </ClayCard>
        ))
      )}
    </div>
  );
}
