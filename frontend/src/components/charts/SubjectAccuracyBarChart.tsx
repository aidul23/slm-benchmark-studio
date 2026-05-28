import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { BenchmarkSubjectBreakdown } from "../../types";

interface Props {
  data: BenchmarkSubjectBreakdown[];
  /** Cap the number of subjects shown (sorted by accuracy desc + asc). */
  limit?: number;
}

/**
 * Horizontal bar chart of accuracy per subject inside one benchmark.
 *
 * Bars are colored by accuracy band (green ≥ 60%, amber 30–60%, red < 30%).
 * 0%-accuracy subjects use `minPointSize` so wrong-only rows still show a
 * visible red stub (recharts otherwise draws zero-width bars at 0%).
 * Every all-wrong subject is kept in the bottom slice even when there are
 * more than limit/2 of them — important for HellaSwag where many activities
 * have only 1 example (0/1 = 0%).
 */
export default function SubjectAccuracyBarChart({ data, limit = 20 }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-ink-400">
        No per-subject scores yet.
      </div>
    );
  }

  const ordered = [...data].filter((s) => s.count > 0);
  ordered.sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0));
  const total = ordered.length;

  let shown: BenchmarkSubjectBreakdown[];
  let topCount = 0;
  let bottomCount = 0;
  if (total <= limit) {
    shown = ordered;
    topCount = ordered.length;
  } else {
    const zeroAccCount = ordered.filter((s) => (s.accuracy ?? 0) === 0).length;
    topCount = Math.ceil(limit / 2);
    bottomCount = Math.max(Math.floor(limit / 2), zeroAccCount);
    const top = ordered.slice(0, topCount);
    const bottom = ordered.slice(-bottomCount);
    shown = Array.from(new Set([...top, ...bottom]));
  }

  const points = shown.map((s) => ({
    subject: s.subject,
    accuracy: (s.accuracy ?? 0) * 100,
    count: s.count,
    correct: s.correct,
  }));

  const colorFor = (pct: number) => (pct >= 60 ? "#10b981" : pct >= 30 ? "#f59e0b" : "#ef4444");

  const hidden = total - shown.length;
  const chartHeight = Math.max(384, points.length * 22);

  return (
    <div className="w-full">
      <div style={{ height: chartHeight }} className="w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={points}
            layout="vertical"
            margin={{ top: 8, right: 24, left: 12, bottom: 8 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" />
            <XAxis
              type="number"
              stroke="#7c869a"
              domain={[0, 100]}
              tickFormatter={(value) => `${value}%`}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              type="category"
              dataKey="subject"
              stroke="#7c869a"
              width={170}
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              cursor={{ fill: "rgba(99,102,241,0.05)" }}
              formatter={(value: number, _name: string, ctx: any) => {
                const payload = ctx?.payload as { correct?: number; count?: number } | undefined;
                const detail = payload ? ` (${payload.correct}/${payload.count})` : "";
                return [`${Number(value).toFixed(1)}%${detail}`, "Accuracy"];
              }}
            />
            <Bar dataKey="accuracy" radius={[0, 4, 4, 0]} minPointSize={3}>
              {points.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colorFor(entry.accuracy)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 text-xs text-ink-400">
        {hidden > 0 ? (
          <>
            Showing {points.length} of {total} subjects · top {topCount} + bottom {bottomCount}
            {" · "}
            {hidden} mid-range hidden. 0%-accuracy subjects are always kept and shown as a thin red
            stub.
          </>
        ) : (
          <>Showing all {total} subjects. 0%-accuracy bars appear as a thin red stub.</>
        )}
      </div>
    </div>
  );
}
