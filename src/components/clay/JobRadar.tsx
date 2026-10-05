import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import type { TailorResult } from "@/convex/ai";
import { ClayButton } from "@/components/clay/ClayButton";
import { ClayCard } from "@/components/clay/ClayCard";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  Bell,
  Check,
  ExternalLink,
  Loader2,
  Mail,
  Radar,
  Search,
  Send,
  Trash2,
  Wand2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getSessionId } from "@/lib/session";
import type { ResumeProfileData } from "@/types/resume";

type JobMatch = Doc<"jobMatches">;
type JobWatch = Doc<"jobWatches">;

interface JobRadarProps {
  /** The master profile every listing is scored against (null → prompt first). */
  profile: ResumeProfileData | null;
  /** Prefills the watch alert email. */
  defaultEmail: string;
  /** Send the user back to the wizard to build a profile first. */
  onBuildProfile: () => void;
  /** A tailor pass finished — hand the result to the studio view. */
  onTailored: (
    job: { jobTitle: string; companyName: string; jobDescription: string },
    result: TailorResult,
  ) => void;
}

/** Match score → chip colors so the board reads at a glance. */
function scoreClasses(score: number): string {
  if (score >= 70) return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400";
  if (score >= 50) return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  return "bg-rose-500/15 text-rose-600 dark:text-rose-400";
}

function daysAgo(ts?: number): string {
  if (!ts) return "";
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function JobRadar({
  profile,
  defaultEmail,
  onBuildProfile,
  onTailored,
}: JobRadarProps) {
  const matches = useQuery(api.jobs.listMatches);
  const watches = useQuery(api.jobs.listWatches);
  const searchJobs = useAction(api.jobSearch.searchJobs);
  const runWatchNow = useAction(api.jobSearch.runWatchNow);
  const tailorResume = useAction(api.ai.tailorResume);
  const autoApply = useAction(api.ai.autoApply);
  const resolveTelegramChat = useAction(api.notify.resolveTelegramChat);
  const markTailored = useMutation(api.jobs.markTailored);
  const setJobStatus = useMutation(api.jobs.setJobStatus);
  const [statusId, setStatusId] = useState<string | null>(null);
  const saveWatch = useMutation(api.jobs.saveWatch);
  const deleteWatch = useMutation(api.jobs.deleteWatch);

  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  // Auto-scan lifecycle: flipped only from promise callbacks (never
  // synchronously inside the effect) so the empty state can show "pulling
  // listings…" while the first silent scan runs.
  const [autoScanDone, setAutoScanDone] = useState(false);
  const [minScore, setMinScore] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tailoringId, setTailoringId] = useState<string | null>(null);
  const [isAutoApplying, setIsAutoApplying] = useState(false);

  // Watch (alert) form.
  const [watchOpen, setWatchOpen] = useState(false);
  const [watchEmail, setWatchEmail] = useState(defaultEmail);
  const [watchChatId, setWatchChatId] = useState("");
  const [watchEmailOn, setWatchEmailOn] = useState(true);
  const [watchTelegramOn, setWatchTelegramOn] = useState(false);
  const [isSavingWatch, setIsSavingWatch] = useState(false);
  const [isResolvingChat, setIsResolvingChat] = useState(false);

  const hasProfile = profile !== null && profile.title.trim().length > 0;
  const visible = (matches ?? []).filter((m) => m.score >= minScore);
  // Spinner/copy driver: a manual scan, or the one silent first scan.
  const searching =
    isSearching ||
    (hasProfile && matches !== undefined && matches.length === 0 && !autoScanDone);

  /**
   * Show listings on open: on first mount with a profile, quietly scan the
   * boards with an empty query (latest postings across all three) when
   * nothing is persisted yet — so the radar never opens on an empty list.
   * Silent on success; a warning only when nothing could be fetched. All
   * state changes happen in promise callbacks, never in the effect body.
   */
  const autoScanned = useRef(false);
  useEffect(() => {
    if (autoScanned.current || !hasProfile || matches === undefined) return;
    autoScanned.current = true;
    if (matches.length > 0) {
      // Refresh stale scores (parser/matcher fixes must reach stored rows;
      // upserts patch description + score in place).
      const freshest = matches.reduce(
        (max, m) => Math.max(max, m.scoredAt ?? 0),
        0,
      );
      if (freshest > Date.now() - 30 * 60_000) return;
    }
    searchJobs({ query: "", location: undefined })
      .then((out) => {
        if (out.searched === 0) {
          toast.warning(
            out.errors.length > 0
              ? `Couldn't reach the job boards — hit “Scan boards” to retry.`
              : "No listings came back — try “Scan boards” again.",
          );
        }
      })
      .catch((error) => {
        toast.error(
          error instanceof Error ? error.message : "Couldn't load listings.",
        );
      })
      .finally(() => setAutoScanDone(true));
  }, [matches, hasProfile, searchJobs]);

  /** Feature 1 — find employers hiring right now, scored against the profile. */
  const handleSearch = async () => {
    if (!hasProfile) {
      toast.error("Build your master profile first — the radar scores against it.");
      onBuildProfile();
      return;
    }
    setIsSearching(true);
    try {
      const out = await searchJobs({
        query: query.trim(),
        location: location.trim() || undefined,
      });
      if (out.searched === 0) {
        toast.info("No listings came back — try a broader search term.");
      } else {
        toast.success(
          `Scanned ${out.searched} live openings · ${out.total} saved to your radar.`,
        );
        if (out.errors.length > 0) {
          toast.warning(`Some boards were unreachable: ${out.errors.join("; ")}`);
        }
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Search failed — try again.",
      );
    } finally {
      setIsSearching(false);
    }
  };

  /**
   * Feature 2 — "convert resume": run the AI tailor pass for this exact
   * posting, record the higher AI score on the card, hand the result to the
   * studio, and quietly re-scan the board so fresh employers keep flowing in.
   */
  const handleTailor = async (match: JobMatch) => {
    if (!profile) return;
    setTailoringId(match._id);
    try {
      const result = await tailorResume({
        profileJson: JSON.stringify(profile),
        jobTitle: match.title,
        companyName: match.company,
        jobDescription: match.description,
        sessionId: getSessionId(),
        boostKeywords: match.missingKeywords.slice(0, 20),
      });
      await markTailored({ jobId: match._id, score: result.score });
      toast.success(
        `Resume converted for ${match.company} — AI fit score ${result.score}% (board match ${match.score}%).`,
      );
      // Re-scan in the background: scores refresh and new employers roll in.
      void searchJobs({
        query: query.trim(),
        location: location.trim() || undefined,
      }).catch(() => undefined);
      onTailored(
        {
          jobTitle: match.title,
          companyName: match.company,
          jobDescription: match.description,
        },
        result,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Tailoring failed — try again.",
      );
    } finally {
      setTailoringId(null);
    }
  };

  /** Feature 3 — auto-apply: tailored resume saved + marked applied, per job. */
  const handleAutoApply = async () => {
    if (!profile) return;
    const ids = [...selected];
    if (ids.length === 0) return;
    setIsAutoApplying(true);
    try {
      const applied = await autoApply({
        jobIds: ids as Array<JobMatch["_id"]>,
        sessionId: getSessionId(),
      });
      if (applied.length === 0) {
        toast.error("Those listings were no longer available — refresh the board.");
      } else {
        toast.success(
          `Auto-applied to ${applied.length} job${applied.length === 1 ? "" : "s"} — tailored resumes saved to your collection.`,
        );
        const first = applied[0];
        toast(`Open the top posting to submit: ${first.url}`, {
          action: { label: "Open", onClick: () => window.open(first.url, "_blank") },
        });
      }
      setSelected(new Set());
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Auto-apply failed — try again.",
      );
    } finally {
      setIsAutoApplying(false);
    }
  };

  /** Manual pipeline moves: interview / rejected / restore (E3 remainder). */
  const handleStatus = async (
    match: JobMatch,
    status: "new" | "tailored" | "interview" | "rejected",
  ) => {
    setStatusId(match._id);
    try {
      await setJobStatus({ jobId: match._id, status });
      toast.success(
        status === "interview"
          ? `“${match.title}” marked as interview — nice.`
          : status === "rejected"
            ? `“${match.title}” marked as rejected.`
            : `“${match.title}” moved back to the pipeline.`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't update that listing.",
      );
    } finally {
      setStatusId(null);
    }
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  /** Feature 4 — save this search as a watch with email/Telegram alerts. */
  const handleSaveWatch = async () => {
    setIsSavingWatch(true);
    try {
      await saveWatch({
        query: query.trim(),
        location: location.trim() || undefined,
        minScore,
        email: watchEmail.trim() || undefined,
        emailEnabled: watchEmailOn,
        telegramChatId: watchChatId.trim() || undefined,
        telegramEnabled: watchTelegramOn,
      });
      toast.success(
        "Watch saved — hourly sweep alerts you when fresh matches clear the bar.",
      );
      setWatchOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save the watch.",
      );
    } finally {
      setIsSavingWatch(false);
    }
  };

  const handleResolveChat = async () => {
    setIsResolvingChat(true);
    try {
      const out = await resolveTelegramChat({});
      if (out.ok) {
        setWatchChatId(out.chatId);
        toast.success(`Found chat with ${out.name} — chat ID filled in.`);
      } else {
        toast.error(out.error);
      }
    } finally {
      setIsResolvingChat(false);
    }
  };

  const handleRunWatch = async (watch: JobWatch) => {
    try {
      const status = await runWatchNow({ watchId: watch._id });
      toast.success(status);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Sweep failed — try again.",
      );
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Search employers */}
      <ClayCard>
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="clay-title text-xl">Find employers hiring now</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Live job boards, scored against your profile — no AI credits
                spent on scanning.
              </p>
            </div>
            <span className="clay-chip px-3 py-1 text-xs font-bold">
              {visible.length} match{visible.length === 1 ? "" : "es"}
            </span>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="clay-inset flex h-11 flex-1 items-center gap-2 rounded-2xl px-4">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Role or skills — e.g. “react developer”"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
                aria-label="Search job titles or skills"
              />
            </div>
            <div className="clay-inset flex h-11 items-center gap-2 rounded-2xl px-4 sm:w-56">
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="Location (optional)"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
                aria-label="Location filter"
              />
            </div>
            <ClayButton
              size="lg"
              onClick={handleSearch}
              disabled={searching}
            >
              {searching ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Radar />
              )}
              {searching ? "Scanning…" : "Scan boards"}
            </ClayButton>
          </div>

          {/* Match threshold */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Show ≥ {minScore}% match
            </span>
            <input
              type="range"
              min={0}
              max={90}
              step={5}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              className="h-2 flex-1 cursor-pointer accent-primary"
              aria-label="Minimum match score"
            />
          </div>
        </div>
      </ClayCard>

      {/* Results */}
      {!hasProfile ? (
        <ClayCard className="flex flex-col items-start gap-3 p-8">
          <h3 className="clay-title text-lg">Build your profile to arm the radar</h3>
          <p className="max-w-xl text-sm text-muted-foreground">
            Every listing is scored against your skills and experience. Create
            your master profile once, then the radar ranks employers for you.
          </p>
          <ClayButton onClick={onBuildProfile}>
            <Wand2 /> Open the resume wizard
          </ClayButton>
        </ClayCard>
      ) : matches === undefined ? (
        <div className="clay-card flex items-center justify-center gap-2 p-8 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading your radar…
        </div>
      ) : visible.length === 0 ? (
        <ClayCard className="p-8 text-center">
          <p className="text-sm text-muted-foreground">
            {searching
              ? "Pulling the latest listings from the boards…"
              : matches.length === 0
                ? "Nothing scanned yet — run your first search above to pull live openings."
                : `No listings at or above ${minScore}% right now — lower the bar or scan again.`}
          </p>
        </ClayCard>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-2 px-1">
            <h2 className="clay-title text-lg">Job listings</h2>
            <span className="text-xs font-semibold text-muted-foreground">
              {visible.length} of {matches.length} saved · sorted by match
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
          {visible.map((match) => {
            const isSelected = selected.has(match._id);
            return (
              <ClayCard
                key={match._id}
                className={`flex flex-col gap-3 ${isSelected ? "ring-2 ring-primary/50" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-base font-bold">{match.title}</h3>
                    <p className="truncate text-sm text-muted-foreground">
                      {match.company} · {match.location}
                    </p>
                  </div>
                  <span
                    className={`clay-chip shrink-0 px-2.5 py-1 text-sm font-black ${scoreClasses(match.score)}`}
                    title={`Board match score ${match.score}%`}
                  >
                    {match.score}%
                  </span>
                </div>

                <p className="text-xs text-muted-foreground">
                  {match.source} {match.postedAt ? `· ${daysAgo(match.postedAt)}` : ""}
                  {match.status === "applied" && match.tailoredScore != null
                    ? ` · applied with ${match.tailoredScore}% resume`
                    : match.status === "tailored" && match.tailoredScore != null
                      ? ` · tailored to ${match.tailoredScore}%`
                      : ""}
                  {match.status === "interview" ? " · interviewing" : ""}
                  {match.status === "rejected" ? " · rejected" : ""}
                </p>

                {match.matchedKeywords.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {match.matchedKeywords.slice(0, 6).map((kw) => (
                      <span
                        key={kw}
                        className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"
                      >
                        {kw}
                      </span>
                    ))}
                    {match.missingKeywords.slice(0, 3).map((kw) => (
                      <span
                        key={kw}
                        className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400"
                        title="Posting term your resume doesn't cover yet"
                      >
                        +{kw}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                  <ClayButton
                    size="sm"
                    onClick={() => handleTailor(match)}
                    disabled={
                      tailoringId !== null ||
                      match.status === "applied" ||
                      match.status === "interview" ||
                      match.status === "rejected"
                    }
                    title="Rewrite your resume for this posting and score it"
                  >
                    {tailoringId === match._id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Wand2 />
                    )}
                    {match.status === "tailored"
                      ? "Re-tailor"
                      : match.status === "applied"
                        ? "Applied"
                        : "Tailor to this job"}
                  </ClayButton>

                  <label className="flex cursor-pointer items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold text-muted-foreground hover:text-foreground">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelected(match._id)}
                      disabled={
                        match.status === "applied" ||
                        match.status === "interview" ||
                        match.status === "rejected"
                      }
                      className="size-4 accent-primary"
                      aria-label={`Select ${match.title} for auto-apply`}
                    />
                    Auto-apply
                  </label>

                  {(match.status === "tailored" ||
                    match.status === "applied") && (
                    <>
                      <ClayButton
                        size="sm"
                        variant="soft"
                        onClick={() => handleStatus(match, "interview")}
                        disabled={statusId === match._id}
                        title="Mark as interviewing"
                      >
                        Interview
                      </ClayButton>
                      <ClayButton
                        size="sm"
                        variant="ghost"
                        onClick={() => handleStatus(match, "rejected")}
                        disabled={statusId === match._id}
                        title="Mark as rejected"
                      >
                        Reject
                      </ClayButton>
                    </>
                  )}
                  {match.status === "interview" && (
                    <ClayButton
                      size="sm"
                      variant="ghost"
                      onClick={() => handleStatus(match, "rejected")}
                      disabled={statusId === match._id}
                      title="Mark as rejected"
                    >
                      Reject
                    </ClayButton>
                  )}
                  {match.status === "rejected" && (
                    <ClayButton
                      size="sm"
                      variant="ghost"
                      onClick={() => handleStatus(match, "new")}
                      disabled={statusId === match._id}
                      title="Move back into the pipeline"
                    >
                      Restore
                    </ClayButton>
                  )}

                  <a
                    href={match.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-auto inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                  >
                    Open posting <ExternalLink className="size-3.5" />
                  </a>
                </div>
              </ClayCard>
            );
          })}
          </div>
        </>
      )}

      {/* Auto-apply bar */}
      {selected.size > 0 && (
        <div className="sticky bottom-4 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/95 p-3 shadow-lg backdrop-blur">
          <span className="text-sm font-semibold">
            {selected.size} selected for auto-apply
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              tailors + saves a resume per job (shares your daily AI budget)
            </span>
          </span>
          <div className="flex gap-2">
            <ClayButton
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </ClayButton>
            <ClayButton
              size="sm"
              onClick={handleAutoApply}
              disabled={isAutoApplying}
            >
              {isAutoApplying ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Check />
              )}
              {isAutoApplying ? "Applying…" : "Auto-apply now"}
            </ClayButton>
          </div>
        </div>
      )}

      {/* Watches — email watch + Telegram alerts */}
      <ClayCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="clay-title text-xl">Watch this search</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              An hourly sweep emails you and pings Telegram when new matches
              clear {minScore}%.
            </p>
          </div>
          <ClayButton onClick={() => setWatchOpen((o) => !o)}>
            <Bell />
            {watchOpen ? "Close" : watches && watches.length > 0 ? "Add watch" : "Set up alerts"}
          </ClayButton>
        </div>

        {watchOpen && (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl bg-card/70 p-4 ring-1 ring-border/60">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Watching “{query.trim() || "all live openings”"}
              {location.trim() ? ` in ${location.trim()}` : ""}
            </p>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={watchEmailOn}
                onChange={(e) => setWatchEmailOn(e.target.checked)}
                className="size-4 accent-primary"
              />
              <Mail className="size-4 text-muted-foreground" /> Email digest to
              <input
                value={watchEmail}
                onChange={(e) => setWatchEmail(e.target.value)}
                type="email"
                placeholder="you@example.com"
                className="clay-inset h-9 flex-1 rounded-xl px-3 text-sm outline-none"
                aria-label="Alert email address"
              />
            </label>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={watchTelegramOn}
                onChange={(e) => setWatchTelegramOn(e.target.checked)}
                className="size-4 accent-primary"
              />
              <Send className="size-4 text-muted-foreground" /> Telegram bot
              message
              <input
                value={watchChatId}
                onChange={(e) => setWatchChatId(e.target.value)}
                placeholder="chat ID"
                className="clay-inset h-9 w-36 rounded-xl px-3 text-sm outline-none"
                aria-label="Telegram chat ID"
              />
              <ClayButton
                variant="ghost"
                size="sm"
                onClick={handleResolveChat}
                disabled={isResolvingChat}
              >
                {isResolvingChat ? <Loader2 className="animate-spin" /> : null}
                Find ID
              </ClayButton>
            </label>

            <p className="text-xs text-muted-foreground">
              Telegram: message your bot once, then hit “Find ID”. The bot token
              lives in the project’s Keys tab as TELEGRAM_BOT_TOKEN; email needs
              RESEND_API_KEY. Without them the sweep still runs and records why
              nothing was sent.
            </p>

            <div className="flex gap-2">
              <ClayButton
                onClick={handleSaveWatch}
                disabled={isSavingWatch || query.trim().length < 2}
              >
                {isSavingWatch ? <Loader2 className="animate-spin" /> : <Bell />}
                Save watch
              </ClayButton>
            </div>
          </div>
        )}

        {watches === undefined ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading watches…
          </div>
        ) : watches.length > 0 ? (
          <ul className="mt-4 flex flex-col gap-2">
            {watches.map((watch) => (
              <li
                key={watch._id}
                className="flex flex-wrap items-center gap-3 rounded-2xl bg-card/70 px-4 py-3 text-sm ring-1 ring-border/60"
              >
                <span className="font-semibold">“{watch.query}”</span>
                <span className="clay-chip px-2 py-0.5 text-xs font-bold">
                  ≥ {watch.minScore}%
                </span>
                <span className="text-xs text-muted-foreground">
                  {[
                    watch.emailEnabled && watch.email ? `email ${watch.email}` : null,
                    watch.telegramEnabled && watch.telegramChatId
                      ? `telegram …${watch.telegramChatId.slice(-4)}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "no alerts on"}
                </span>
                {watch.lastStatus && (
                  <span className="truncate text-xs text-muted-foreground">
                    last: {watch.lastStatus}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-1">
                  <ClayButton
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRunWatch(watch)}
                    title="Run this sweep now"
                  >
                    Run now
                  </ClayButton>
                  <ClayButton
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      await deleteWatch({ watchId: watch._id });
                      toast.success("Watch deleted.");
                    }}
                    aria-label="Delete watch"
                  >
                    <Trash2 />
                  </ClayButton>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            No watches yet — search for a role, then turn on alerts above.
          </p>
        )}
      </ClayCard>
    </div>
  );
}
