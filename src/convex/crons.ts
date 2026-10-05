import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Job Radar watch sweep (feature: email watch + Telegram alerts): every 55
// minutes, re-scan each saved search, persist fresh matches at/above its
// threshold, and push the digest out by email and Telegram. The internal
// action debounces per-watch (50 min) so staggered watches don't double-run.
crons.interval(
  "job radar watch sweep",
  { minutes: 55 },
  internal.jobSearch.sweepDueWatches,
  {},
);

export default crons;
