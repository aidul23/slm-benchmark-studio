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
 * Horizontal-ish bar chart of accuracy per subject inside one benchmark.
 * Useful for MMLU where each subject is a meaningful slice; also works for
 * HellaSwag's activity labels but is less informative there.
 *
 * Bars are colored by accuracy band (green ≥ 60%, amber 30–60%, red < 30%).
 */
export default function SubjectAccuracyBarChart({ data, limit = 20 }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-ink-400">
        No per-subject scores yet.
      </div>
    );
  }

  // Show a head + tail mix so you see the best and worst subjects.
  const ordered = [...data].filter((s) => s.count > 0);
  ordered.sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0));
  const top = ordered.slice(0, Math.ceil(limit / 2));
  const bottom = ordered.slice(-Math.floor(limit / 2));
  const shown = ordered.length <= limit ? ordered : Array.from(new Set([...top, ...bottom]));

  const points = shown.map((s) => ({
    subject: s.subject,
    accuracy: (s.accuracy ?? 0) * 100,
    count: s.count,
    correct: s.correct,
  }));

  const colorFor = (pct: number) => (pct >= 60 ? "#10b981" : pct >= 30 ? "#f59e0b" : "#ef4444");

  return (
    <div className="h-96 w-full">
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
          <Bar dataKey="accuracy" radius={[0, 4, 4, 0]}>
            {points.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={colorFor(entry.accuracy)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
