import { cn } from "@/lib/utils";
import type { ScoreBreakdownEntry } from "@/types/resume";
import { motion } from "framer-motion";

const barColors: Record<string, string> = {
  Skills: "bg-clay-lilac",
  Experience: "bg-clay-sky",
  Education: "bg-clay-mint",
  Summary: "bg-clay-butter",
  Formatting: "bg-clay-blush",
};

function scoreTone(score: number) {
  if (score >= 90) return { text: "text-emerald-700", label: "Outstanding" };
  if (score >= 75) return { text: "text-sky-700", label: "Strong" };
  if (score >= 55) return { text: "text-amber-700", label: "Decent" };
  return { text: "text-rose-700", label: "Needs work" };
}

/** Big squishy donut showing the overall match score out of 100. */
export function ScoreGauge({
  score,
  className,
}: {
  score: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  const tone = scoreTone(clamped);

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <div
        className="relative flex size-44 items-center justify-center rounded-full shadow-clay"
        style={{
          background: `conic-gradient(var(--primary) ${clamped * 3.6}deg, oklch(0.92 0.03 45 / 70%) ${clamped * 3.6}deg)`,
        }}
      >
        <div className="clay-card flex size-34 flex-col items-center justify-center rounded-full p-0">
          <span className={cn("text-5xl font-extrabold tabular-nums", tone.text)}>
            {clamped}
            <span className="text-xl font-bold">%</span>
          </span>
          <span className="mt-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Match score
          </span>
        </div>
      </div>
      <span
        className={cn(
          "clay-chip px-4 py-1.5 text-sm font-bold",
          tone.text,
        )}
      >
        {tone.label}
      </span>
    </div>
  );
}

/** Animated per-category bars beneath the gauge. */
export function ScoreBreakdown({
  breakdown,
}: {
  breakdown: ScoreBreakdownEntry[];
}) {
  return (
    <div className="flex flex-col gap-3">
      {breakdown.map((entry, index) => {
        const pct = entry.maxScore > 0 ? Math.round((entry.score / entry.maxScore) * 100) : 0;
        return (
          <div key={entry.label} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-bold">{entry.label}</span>
              <span className="text-xs font-semibold tabular-nums text-muted-foreground">
                {entry.score}/{entry.maxScore}
              </span>
            </div>
            <div className="clay-inset h-4 overflow-hidden rounded-full">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.7, delay: 0.1 + index * 0.08, ease: "easeOut" }}
                className={cn("h-full rounded-full", barColors[entry.label] ?? "bg-primary")}
              />
            </div>
            <p className="text-xs leading-5 text-muted-foreground">{entry.note}</p>
          </div>
        );
      })}
    </div>
  );
}
