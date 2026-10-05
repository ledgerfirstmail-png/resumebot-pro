/**
 * Pure before/after diff between the original profile and a tailored result —
 * extracted from BeforeAfterDiff.tsx so it can be unit tested (ROADMAP D1).
 */
import type { TailorResult } from "@/convex/ai";
import type { ResumeProfileData } from "@/types/resume";

export interface BulletPair {
  original: string | null;
  tailored: string;
  changed: boolean;
}

export interface RoleDiff {
  role: string;
  pairs: BulletPair[];
}

export interface Diff {
  roles: RoleDiff[];
  summaryChanged: boolean;
  skillsAdded: string[];
  skillsRemoved: string[];
  rewrittenCount: number;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * Match original experience entries to tailored ones (by company + title first,
 * then by position) and zip their bullets so each rewrite can be shown side by
 * side. Pure — safe to recompute on every render.
 */
export function buildDiff(
  original: ResumeProfileData,
  tailored: TailorResult,
): Diff {
  const usedOriginal = new Set<number>();
  const roles: RoleDiff[] = [];

  tailored.experience.forEach((entry, idx) => {
    let matchIdx = original.experience.findIndex(
      (o, i) =>
        !usedOriginal.has(i) &&
        norm(o.company) === norm(entry.company) &&
        norm(o.title) === norm(entry.title),
    );
    if (matchIdx === -1) {
      matchIdx = original.experience.findIndex((_, i) => !usedOriginal.has(i));
      // Only fall back to positional matching while the lists are parallel.
      if (matchIdx !== -1 && matchIdx !== idx) matchIdx = -1;
    }
    const originalEntry =
      matchIdx === -1 ? null : original.experience[matchIdx];
    if (matchIdx !== -1) usedOriginal.add(matchIdx);

    const pairs: BulletPair[] = entry.bullets.map((tailoredBullet, b) => {
      const originalBullet = originalEntry?.bullets[b] ?? null;
      return {
        original: originalBullet,
        tailored: tailoredBullet,
        changed: norm(originalBullet ?? "") !== norm(tailoredBullet),
      };
    });
    // Original bullets the tailored version dropped.
    (originalEntry?.bullets ?? []).slice(entry.bullets.length).forEach((b) => {
      pairs.push({ original: b, tailored: "", changed: true });
    });

    const changedPairs = pairs.filter((p) => p.changed);
    if (changedPairs.length > 0) {
      roles.push({
        role: `${entry.title} · ${entry.company}`,
        pairs: changedPairs,
      });
    }
  });

  const originalSkills = new Set(original.skills.map(norm));
  const tailoredSkills = new Set(tailored.skills.map(norm));
  const skillsAdded = tailored.skills.filter((s) => !originalSkills.has(norm(s)));
  const skillsRemoved = original.skills.filter((s) => !tailoredSkills.has(norm(s)));

  return {
    roles,
    summaryChanged: norm(original.summary) !== norm(tailored.summary),
    skillsAdded,
    skillsRemoved,
    rewrittenCount: roles.reduce((n, r) => n + r.pairs.length, 0),
  };
}
