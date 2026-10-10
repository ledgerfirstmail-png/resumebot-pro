/** Shared score-badge classes for radar/tracker cards (single source). */

/**
 * Score tier classes: emerald at 80+, amber at 60+, slate below — the same
 * treatment the tracker board already uses, now shared with the radar.
 */
export function scoreClasses(score: number): string {
  if (score >= 80) {
    return "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400";
  }
  if (score >= 60) {
    return "bg-amber-500/12 text-amber-600 dark:text-amber-400";
  }
  return "bg-slate-500/12 text-slate-600 dark:text-slate-400";
}
