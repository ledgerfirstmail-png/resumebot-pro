import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import type { TailorResult } from "@/convex/ai";
import { ClayButton } from "@/components/clay/ClayButton";
import { ClayCard } from "@/components/clay/ClayCard";
import { JobResultCard } from "@/components/clay/JobResultCard";
import { useAction, useMutation, useQuery } from "convex/react";
import {
  Bell,
  Briefcase,
  Check,
  Loader2,
  Mail,
  MapPin,
  Radar,
  RefreshCw,
  Search,
  Send,
  SlidersHorizontal,
  Store,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { parseRadiusLocation } from "@/lib/geo";
import {
  addEmployerToQuery,
  EMPLOYER_CHIP_NAMES,
  isEmployerSelected,
  removeEmployerFromQuery,
} from "@/lib/localEmployers";
import { US_STATE_NAMES } from "@/lib/matchScore";
import { groupIntoTiers, TIER_DOTS } from "@/lib/resultTiers";
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

/**
 * Quick-pick locations — US-only since pass 27 (broadcast "Remote" chips
 * rarely survive the strict US filter; "USA" plus shared-name towns do).
 */
const LOCATION_PRESETS = ["USA", "Remote — US only", "Remote"];

/** Radii the "within" select offers — 35mi is the local-commute default. */
const RADIUS_OPTIONS = [10, 25, 35, 50, 100];

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
  const saveWatch = useMutation(api.jobs.saveWatch);
  const deleteWatch = useMutation(api.jobs.deleteWatch);

  const [query, setQuery] = useState("");
  // Multi-location scan: the chosen chips + the live draft typed in the field.
  const [locations, setLocations] = useState<string[]>([]);
  // Radius chips (the 35-mile local scan): place + miles, sent as
  // "<place> within <miles>mi" and distance-filtered by the server.
  const [radiusChips, setRadiusChips] = useState<
    Array<{ place: string; miles: number }>
  >([]);
  const [locDraft, setLocDraft] = useState("");
  // Results-side filter over the locations actually saved on this board.
  const [locFilter, setLocFilter] = useState("");
  // "More filters" popover over the scan form (locations/employers/threshold).
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  // Auto-scan lifecycle: flipped only from promise callbacks (never
  // synchronously inside the effect) so the empty state can show "pulling
  // listings…" while the first silent scan runs.
  const [autoScanDone, setAutoScanDone] = useState(false);
  const [minScore, setMinScore] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tailoringId, setTailoringId] = useState<string | null>(null);
  const [isAutoApplying, setIsAutoApplying] = useState(false);
  const [statusId, setStatusId] = useState<string | null>(null);

  // Watch (alert) popover — opened from the results toolbar.
  const [watchOpen, setWatchOpen] = useState(false);
  const [watchEmail, setWatchEmail] = useState(defaultEmail);
  const [watchChatId, setWatchChatId] = useState("");
  const [watchEmailOn, setWatchEmailOn] = useState(true);
  const [watchTelegramOn, setWatchTelegramOn] = useState(false);
  const [isSavingWatch, setIsSavingWatch] = useState(false);
  const [isResolvingChat, setIsResolvingChat] = useState(false);

  const hasProfile = profile !== null && profile.title.trim().length > 0;

  // Distinct locations across saved listings (label + count) — powers the
  // results filter and the quick-pick suggestions.
  const locationOptions = useMemo(() => {
    const byKey = new Map<string, { label: string; count: number }>();
    for (const m of matches ?? []) {
      const label = m.location.trim();
      if (!label) continue;
      const key = label.toLowerCase();
      const prev = byKey.get(key);
      if (prev) prev.count += 1;
      else byKey.set(key, { label, count: 1 });
    }
    return [...byKey.entries()]
      .map(([key, option]) => ({ key, ...option }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [matches]);

  /** Presets first, then the most common locations from the saved board. */
  const suggestions = useMemo(() => {
    const seen = new Set(LOCATION_PRESETS.map((p) => p.toLowerCase()));
    const fromBoard: string[] = [];
    for (const option of locationOptions) {
      if (seen.has(option.key)) continue;
      seen.add(option.key);
      fromBoard.push(option.label);
      if (fromBoard.length === 4) break;
    }
    return [...LOCATION_PRESETS, ...fromBoard];
  }, [locationOptions]);

  const visible = (matches ?? []).filter(
    (m) =>
      m.score >= minScore &&
      (locFilter === "" || m.location.trim().toLowerCase() === locFilter),
  );

  // Quality tiers (pass 29): the filtered board buckets into Strong / Good /
  // Worth-a-look bands so the default view reads top-down by intent.
  const tiers = useMemo(() => groupIntoTiers(visible), [visible]);

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
              ? `Couldn't reach the job boards — hit "Scan boards" to retry.`
              : "No listings came back — try \"Scan boards\" again.",
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

  /** Location chips — the set of places the next scan targets. A radius
   * (place + "within N mi", parsed from typed text or the picker) is stored
   * separately so it survives the comma-joined round-trip. */
  const addLocation = (raw: string, radiusMiles?: number) => {
    const value = raw.trim().replace(/\s+/g, " ").slice(0, 40);
    setLocDraft("");
    if (value.length < 2) return;
    const parsed = parseRadiusLocation(value);
    const miles = radiusMiles ?? parsed.radiusMiles;
    // Strip a typed-in "within" token when applying a picker radius.
    const place =
      (parsed.radiusMiles !== undefined ? parsed.location : value).trim();
    if (place.length < 2) return;
    if (miles !== undefined) {
      setRadiusChips((prev) => [
        ...prev.filter((c) => c.place.toLowerCase() !== place.toLowerCase()),
        { place, miles },
      ]);
      // A radius chip replaces the plain chip for the same place.
      setLocations((prev) =>
        prev.filter((l) => l.toLowerCase() !== place.toLowerCase()),
      );
      return;
    }
    if (
      locations.some((l) => l.toLowerCase() === value.toLowerCase()) ||
      radiusChips.some((c) => c.place.toLowerCase() === value.toLowerCase())
    )
      return;
    if (locations.length + radiusChips.length >= 8) {
      toast.info("Up to 8 locations at a time — remove one to add another.");
      return;
    }
    setLocations([...locations, value]);
  };

  const removeLocation = (value: string) =>
    setLocations((prev) =>
      prev.filter((l) => l.toLowerCase() !== value.toLowerCase()),
    );

  const removeRadiusChip = (place: string) =>
    setRadiusChips((prev) =>
      prev.filter((c) => c.place.toLowerCase() !== place.toLowerCase()),
    );

  const toggleLocation = (value: string) => {
    if (locations.some((l) => l.toLowerCase() === value.toLowerCase())) {
      removeLocation(value);
    } else {
      addLocation(value);
    }
  };

  /** Comma-joined locations consumed by the scan action and saved watches —
   * radius chips carry their "within Nmi" token so the server can
   * distance-filter (lib/geo.parseLocationChips splits them back out). */
  const locationParam =
    [
      ...locations,
      ...radiusChips.map((c) => `${c.place} within ${c.miles}mi`),
    ].join(", ") || undefined;

  /** Apply a picked radius to the draft (preferred) or the last plain chip. */
  const handleRadiusPick = (miles: number) => {
    const base =
      locDraft.trim().length >= 2
        ? locDraft
        : locations.length > 0
          ? locations[locations.length - 1]
          : "";
    if (base.trim().length < 2) {
      toast.info("Type a city or ZIP first, then pick a radius.");
      return;
    }
    addLocation(base, miles);
  };

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
        location: locationParam,
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
        boostKeywords: match.missingKeywords.slice(0, 20),
      });
      await markTailored({ jobId: match._id, score: result.score });
      toast.success(
        `Resume converted for ${match.company} — AI fit score ${result.score}% (board match ${match.score}%).`,
      );
      // Re-scan in the background: scores refresh and new employers roll in.
      void searchJobs({
        query: query.trim(),
        location: locationParam,
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
          ? `"${match.title}" marked as interview — nice.`
          : status === "rejected"
            ? `"${match.title}" marked as rejected.`
            : `"${match.title}" moved back to the pipeline.`,
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
        location: locationParam,
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
      {/* Scan form — one search line + a filters popover (pass 29). */}
      <ClayCard className="p-4 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="clay-inset flex h-11 flex-1 items-center gap-2 rounded-2xl px-4">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Role or skills — e.g. 'react developer'"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
              aria-label="Search job titles or skills"
            />
            {locations.length + radiusChips.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setLocations([]);
                  setRadiusChips([]);
                  setLocFilter("");
                }}
                className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary"
                title="Clear all location chips"
              >
                <MapPin className="size-3" />
                {locations.length + radiusChips.length}
                <X className="size-3 opacity-70" />
              </button>
            )}
          </div>

          {/* More filters — locations, employers, threshold. */}
          <div className="relative shrink-0">
            <ClayButton
              variant="soft"
              onClick={() => setFiltersOpen((o) => !o)}
              aria-expanded={filtersOpen}
            >
              <SlidersHorizontal />
              <span className="hidden sm:inline">Filters</span>
            </ClayButton>
            {filtersOpen && (
              <div className="absolute right-0 top-12 z-40 flex w-[26rem] max-w-[calc(100vw-2rem)] flex-col gap-3 rounded-2xl border border-border/60 bg-card p-4 shadow-xl">
                {/* Locations */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    <MapPin className="size-3.5" /> Locations
                  </span>
                  {suggestions.map((s) => {
                    const active = locations.some(
                      (l) => l.toLowerCase() === s.toLowerCase(),
                    );
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleLocation(s)}
                        aria-pressed={active}
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition-colors ${
                          active
                            ? "bg-primary/15 text-primary ring-primary/40"
                            : "text-muted-foreground ring-border/60 hover:bg-accent hover:text-foreground"
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>

                {/* Chips + draft + radius picker (the location chip editor) */}
                <div className="clay-inset flex min-h-11 flex-wrap items-center gap-1.5 rounded-2xl px-3">
                  {locations.map((loc) => (
                    <span
                      key={loc}
                      className="clay-chip flex items-center gap-1 py-0.5 pl-2.5 pr-1.5 text-xs font-bold"
                    >
                      {loc}
                      <button
                        type="button"
                        onClick={() => removeLocation(loc)}
                        aria-label={`Remove ${loc} location`}
                        className="rounded-full text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  {radiusChips.map((chip) => (
                    <span
                      key={`r-${chip.place.toLowerCase()}`}
                      className="flex items-center gap-1 rounded-full bg-primary/15 py-0.5 pl-2.5 pr-1.5 text-xs font-bold text-primary ring-1 ring-primary/40"
                    >
                      <Radar className="size-3" />
                      {chip.place} · within {chip.miles} mi
                      <button
                        type="button"
                        onClick={() => removeRadiusChip(chip.place)}
                        aria-label={`Remove ${chip.place} radius`}
                        className="rounded-full text-primary/70 hover:text-primary"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    value={locDraft}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (/[,;|]/.test(value)) {
                        const parts = value.split(/[,;|]+/);
                        const rest = parts.pop() ?? "";
                        for (const part of parts) addLocation(part);
                        setLocDraft(rest);
                      } else {
                        setLocDraft(value);
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        if (locDraft.trim().length > 0) addLocation(locDraft);
                      } else if (e.key === "Backspace" && locDraft === "") {
                        setLocations((prev) => prev.slice(0, -1));
                      }
                    }}
                    onBlur={() => {
                      if (locDraft.trim().length > 0) addLocation(locDraft);
                    }}
                    placeholder={
                      locations.length + radiusChips.length === 0
                        ? "City, state or ZIP — comma or Enter adds it"
                        : "Add city, state or ZIP"
                    }
                    className="min-w-16 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
                    aria-label="Add a city, state, or town — comma or Enter adds it"
                  />
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) handleRadiusPick(Number(e.target.value));
                    }}
                    aria-label="Scan within a radius of the typed place"
                    className="cursor-pointer rounded-full bg-card px-2 py-1 text-xs font-semibold text-muted-foreground ring-1 ring-border/60 hover:text-foreground"
                    title="Distance-filter the scan to a radius around the typed place (35 mi = local)"
                  >
                    <option value="">within…</option>
                    {RADIUS_OPTIONS.map((miles) => (
                      <option key={miles} value={miles}>
                        within {miles} mi
                      </option>
                    ))}
                  </select>
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) addLocation(e.target.value);
                    }}
                    aria-label="Add a US state to the scan"
                    className="cursor-pointer rounded-full bg-card px-2 py-1 text-xs font-semibold text-muted-foreground ring-1 ring-border/60 hover:text-foreground"
                  >
                    <option value="">+ State…</option>
                    {US_STATE_NAMES.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                {radiusChips.length > 0 &&
                  !locations.some((l) => l.toLowerCase().includes("remote")) && (
                    <p className="text-xs text-muted-foreground">
                      Local scan keeps jobs inside the radius — add a Remote chip to
                      include work-from-anywhere roles.
                    </p>
                  )}

                {/* Local employers (retail & food) quick-picks */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    <Store className="size-3.5" /> Employers
                  </span>
                  {EMPLOYER_CHIP_NAMES.map((name) => {
                    const active = isEmployerSelected(query, name);
                    return (
                      <button
                        key={name}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setQuery((prev) =>
                            active
                              ? removeEmployerFromQuery(prev, name)
                              : addEmployerToQuery(prev, name),
                          )
                        }
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 transition-colors ${
                          active
                            ? "bg-primary/15 text-primary ring-primary/40"
                            : "text-muted-foreground ring-border/60 hover:bg-accent hover:text-foreground"
                        }`}
                      >
                        {name}
                      </button>
                    );
                  })}
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
            )}
          </div>

          <ClayButton size="lg" onClick={handleSearch} disabled={searching}>
            {searching ? <Loader2 className="animate-spin" /> : <Radar />}
            {searching ? "Scanning…" : "Scan boards"}
          </ClayButton>
          <ClayButton
            size="lg"
            variant="soft"
            onClick={handleSearch}
            disabled={searching}
            title="Re-scan the boards with the same search and refresh every score"
            aria-label="Refresh listings"
          >
            {searching ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            <span className="hidden sm:inline">Refresh</span>
          </ClayButton>
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
                : locFilter
                  ? "No saved listings in that location — switch back to 'All locations' or scan again."
                  : `No listings at or above ${minScore}% right now — lower the bar or scan again.`}
          </p>
        </ClayCard>
      ) : (
        <>
          {/* Results toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <h2 className="clay-title text-lg">Job listings</h2>
            <div className="flex items-center gap-2">
              {locationOptions.length > 1 && (
                <select
                  value={locFilter}
                  onChange={(e) => setLocFilter(e.target.value)}
                  className="clay-inset h-8 max-w-56 rounded-xl px-2 text-xs font-semibold outline-none"
                  aria-label="Filter listings by location"
                >
                  <option value="">All locations</option>
                  {locationOptions.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label} · {opt.count}
                    </option>
                  ))}
                </select>
              )}
              <span className="text-xs font-semibold text-muted-foreground">
                {visible.length} of {matches.length} saved
              </span>
              <button
                type="button"
                onClick={() => setWatchOpen((o) => !o)}
                aria-expanded={watchOpen}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground ring-1 ring-border/60 transition-colors hover:text-foreground"
                title="Alert me when new matches clear the bar"
              >
                <Bell className="size-3.5" />
                Watch
                {watches && watches.length > 0 && (
                  <span className="rounded-full bg-primary/15 px-1.5 text-[10px] font-black text-primary">
                    {watches.length}
                  </span>
                )}
              </button>
              <Link
                to="/tracker"
                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground ring-1 ring-border/60 transition-colors hover:text-foreground"
                title="Follow your applications from applied to interview"
              >
                <Briefcase className="size-3.5" />
                Tracker
              </Link>
            </div>
          </div>

          {/* Watch popover (alerts over this search) */}
          {watchOpen && (
            <div className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/80 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Watching "{query.trim() || "all live openings"}"
                {locations.length + radiusChips.length > 0
                  ? ` in ${[
                      ...locations,
                      ...radiusChips.map((c) => `${c.place} ≤${c.miles}mi`),
                    ].join(", ")}`
                  : ""}
              </p>

              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={watchEmailOn}
                    onChange={(e) => setWatchEmailOn(e.target.checked)}
                    className="size-4 accent-primary"
                  />
                  <Mail className="size-4 text-muted-foreground" /> Email
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
                  <Send className="size-4 text-muted-foreground" /> Telegram
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
              </div>

              <p className="text-xs text-muted-foreground">
                Telegram: message your bot once, then hit "Find ID". The bot token
                lives in the project's Keys tab as TELEGRAM_BOT_TOKEN; email needs
                RESEND_API_KEY. Without them the sweep still runs and records why
                nothing was sent.
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <ClayButton
                  onClick={handleSaveWatch}
                  disabled={isSavingWatch || query.trim().length < 2}
                >
                  {isSavingWatch ? <Loader2 className="animate-spin" /> : <Bell />}
                  Save watch
                </ClayButton>
                {watches !== undefined && watches.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {watches.length} active watch{watches.length === 1 ? "" : "es"}
                    {" — "}
                    {watches[0].lastStatus ?? "hourly sweep on"}
                  </span>
                )}
              </div>

              {/* Existing watches */}
              {watches !== undefined && watches.length > 0 && (
                <ul className="flex flex-col gap-2 border-t border-border/60 pt-2">
                  {watches.map((watch) => (
                    <li
                      key={watch._id}
                      className="flex flex-wrap items-center gap-2 text-sm"
                    >
                      <span className="font-semibold">"{watch.query}"</span>
                      {watch.location && (
                        <span className="clay-chip flex items-center gap-1 px-2 py-0.5 text-xs font-bold">
                          <MapPin className="size-3" />
                          {watch.location}
                        </span>
                      )}
                      <span className="clay-chip px-2 py-0.5 text-xs font-bold">
                        ≥ {watch.minScore}%
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {[
                          watch.emailEnabled && watch.email
                            ? `email ${watch.email}`
                            : null,
                          watch.telegramEnabled && watch.telegramChatId
                            ? `telegram …${watch.telegramChatId.slice(-4)}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "no alerts on"}
                        {watch.lastStatus ? ` · last: ${watch.lastStatus}` : ""}
                      </span>
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
              )}
            </div>
          )}

          {/* Tier-grouped results (pass 29). */}
          <div className="flex flex-col gap-6">
            {tiers.map((tier) => (
              <section key={tier.level} aria-label={tier.label}>
                <div className="mb-2 flex items-center gap-2 px-1">
                  <span className={`size-2 rounded-full ${TIER_DOTS[tier.level]}`} />
                  <h3 className="text-sm font-bold">{tier.label}</h3>
                  <span className="text-xs text-muted-foreground">
                    {tier.items.length}
                  </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {tier.items.map((match) => (
                    <JobResultCard
                      key={match._id}
                      match={match}
                      selected={selected.has(match._id)}
                      tailoring={tailoringId === match._id}
                      statusBusy={statusId === match._id}
                      onTailor={() => handleTailor(match)}
                      onToggleAutoApply={() => toggleSelected(match._id)}
                      canShowPipeline={
                        match.status === "tailored" || match.status === "applied"
                      }
                      onInterview={() => handleStatus(match, "interview")}
                      onReject={() => handleStatus(match, "rejected")}
                    />
                  ))}
                </div>
              </section>
            ))}
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
    </div>
  );
}
