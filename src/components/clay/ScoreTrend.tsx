import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface ScorePoint {
  createdAt: number;
  score: number;
  jobTitle: string;
  companyName: string;
}

/**
 * Trend of match scores across saved resumes. Colored through `currentColor`
 * so it inherits the clay palette (and dark mode) without hardcoded hexes.
 * Renders nothing with fewer than two data points.
 */
export function ScoreTrend({ points }: { points: ScorePoint[] }) {
  if (points.length < 2) return null;

  const data = [...points]
    .sort((a, b) => a.createdAt - b.createdAt)
    .map((p) => ({
      date: new Date(p.createdAt).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      }),
      score: p.score,
      job: `${p.jobTitle} · ${p.companyName}`,
    }));

  const first = data[0].score;
  const last = data[data.length - 1].score;
  const trend =
    last > first ? "improving" : last < first ? "declining" : "flat";

  return (
    <div
      role="img"
      aria-label={`Match scores over time: ${data
        .map((d) => `${d.date} ${d.score} percent`)
        .join(", ")}. Trend ${trend}.`}
      className="text-primary"
    >
      <ResponsiveContainer width="100%" height={220}>
        <LineChart
          data={data}
          margin={{ top: 8, right: 12, bottom: 0, left: -18 }}
        >
          <CartesianGrid
            stroke="currentColor"
            strokeOpacity={0.15}
            strokeDasharray="4 6"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tick={{ fill: "currentColor", fillOpacity: 0.65, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "currentColor", fillOpacity: 0.65, fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={36}
          />
          <Tooltip
            cursor={{ stroke: "currentColor", strokeOpacity: 0.35 }}
            contentStyle={{
              borderRadius: "1rem",
              border: "1px solid var(--border)",
              background: "var(--card)",
              color: "var(--card-foreground)",
              fontSize: 12,
              fontWeight: 600,
              boxShadow: "0 8px 20px rgb(0 0 0 / 0.08)",
            }}
            formatter={(value) => [`${value}%`, "Match score"]}
            labelFormatter={(label) => `${label}`}
          />
          <Line
            type="monotone"
            dataKey="score"
            stroke="currentColor"
            strokeWidth={3}
            dot={{ r: 4, strokeWidth: 2, fill: "var(--card)" }}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
