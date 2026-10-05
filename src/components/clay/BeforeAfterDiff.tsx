import { ArrowRight } from "lucide-react";
import type { TailorResult } from "@/convex/ai";
import { buildDiff } from "@/lib/bulletDiff";
import type { ResumeProfileData } from "@/types/resume";
import { ClayCard } from "./ClayCard";

/**
 * Trust builder: shows the user's real bullet next to the tailored rewrite so
 * "honest by design" is verifiable, not claimed. Renders nothing when the
 * tailoring changed nothing.
 */
export function BeforeAfterDiff({
  original,
  tailored,
}: {
  original: ResumeProfileData;
  tailored: TailorResult;
}) {
  const diff = buildDiff(original, tailored);
  const hasAnyChange =
    diff.rewrittenCount > 0 ||
    diff.summaryChanged ||
    diff.skillsAdded.length > 0 ||
    diff.skillsRemoved.length > 0;

  if (!hasAnyChange) return null;

  return (
    <ClayCard>
      <details>
        <summary className="flex cursor-pointer list-none select-none flex-col gap-2 outline-none sm:flex-row sm:items-center sm:justify-between [&::-webkit-details-marker]:hidden">
          <div>
            <h3 className="clay-title text-lg">Before vs. after</h3>
            <p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">
              Every rewrite, side by side with the original — your words on the
              left, the job-mirrored version on the right. Nothing invented.
            </p>
          </div>
          <span className="clay-chip w-fit shrink-0 px-3 py-1.5 text-xs font-bold">
            {diff.rewrittenCount > 0
              ? `${diff.rewrittenCount} bullet${diff.rewrittenCount === 1 ? "" : "s"} rewritten`
              : "Wording updated"}
            <ArrowRight className="ml-1.5 inline size-3.5" />
          </span>
        </summary>

        <div className="mt-5 flex flex-col gap-6">
          {/* Summary rewrite */}
          {diff.summaryChanged && (
            <section>
              <h4 className="mb-2.5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Professional summary
              </h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <DiffBox label="Yours" text={original.summary || "—"} />
                <DiffBox label="Tailored" text={tailored.summary} highlight />
              </div>
            </section>
          )}

          {/* Bullet rewrites, per role */}
          {diff.roles.map((role) => (
            <section key={role.role}>
              <h4 className="mb-2.5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {role.role}
              </h4>
              <div className="flex flex-col gap-3">
                {role.pairs.map((pair, i) => (
                  <div key={i} className="grid gap-3 sm:grid-cols-2">
                    <DiffBox label="Yours" text={pair.original ?? "(new framing)"} />
                    <DiffBox
                      label="Tailored"
                      text={pair.tailored || "(merged below)"}
                      highlight
                    />
                  </div>
                ))}
              </div>
            </section>
          ))}

          {/* Skills added / reframed */}
          {(diff.skillsAdded.length > 0 || diff.skillsRemoved.length > 0) && (
            <section>
              <h4 className="mb-2.5 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Skills wording
              </h4>
              <div className="flex flex-col gap-2.5">
                {diff.skillsAdded.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-xs font-bold text-muted-foreground">
                      Added
                    </span>
                    {diff.skillsAdded.map((s) => (
                      <span
                        key={s}
                        className="rounded-full bg-clay-mint px-3 py-1 text-xs font-semibold text-clay-ink"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}
                {diff.skillsRemoved.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-xs font-bold text-muted-foreground">
                      Set aside
                    </span>
                    {diff.skillsRemoved.map((s) => (
                      <span
                        key={s}
                        className="rounded-full bg-clay-blush px-3 py-1 text-xs font-semibold text-clay-ink line-through"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      </details>
    </ClayCard>
  );
}

/** One side of a before/after pair. */
function DiffBox({
  label,
  text,
  highlight = false,
}: {
  label: string;
  text: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-4 text-sm leading-6 ${
        highlight
          ? "border border-primary/25 bg-clay-mint/50 text-foreground"
          : "clay-inset text-muted-foreground"
      }`}
    >
      <span
        className={`mb-1.5 block text-[10px] font-bold uppercase tracking-widest ${
          highlight ? "text-primary" : "text-muted-foreground/80"
        }`}
      >
        {label}
      </span>
      <p className="whitespace-pre-wrap">{text}</p>
    </div>
  );
}
