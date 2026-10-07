import { TrackerBoard } from "@/components/clay/TrackerBoard";
import { AppHeader } from "@/components/clay/AppHeader";

/** Applications tracker (pass 22): the user's pipeline, stage by stage. */
export default function Tracker() {
  return (
    <div>
      <AppHeader />
      <main className="clay-bg min-h-[calc(100vh-4.5rem)] px-4 pb-16 pt-6 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <div>
            <h1 className="clay-title text-3xl sm:text-4xl">Tracker</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Every listing you tailored or applied to, from the Job Radar —
              move it along as you hear back. Progress survives re-scans.
            </p>
          </div>
          <TrackerBoard />
        </div>
      </main>
    </div>
  );
}
