import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { BenchmarkModelStat } from "../../types";

interface Props {
  data: BenchmarkModelStat[];
  color?: string;
  /** When provided, the chart title-axis can show "MMLU" / "HellaSwag" etc. */
  benchmarkLabel?: string;
}

/**
 * Accuracy bar chart for a single benchmark, one bar per model.
 * Y axis is percentage (0–100); tooltip shows the raw correct/total.
 */
export default function BenchmarkAccuracyBarChart({ data, color = "#10b981", benchmarkLabel }: Props) {
  const points = data
    .filter((row) => row.count > 0 && row.accuracy != null)
    .map((row) => ({
      model: row.model_name,
      accuracy: ((row.accuracy ?? 0) * 100),
      correct: row.correct,
      count: row.count,
    }));

  if (points.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-ink-400">
        No scored items for {benchmarkLabel ?? "this benchmark"} yet.
      </div>
    );
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 16, right: 16, left: 0, bottom: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" />
          <XAxis
            dataKey="model"
            interval={0}
            angle={-25}
            textAnchor="end"
            height={50}
            stroke="#7c869a"
            tick={{ fontSize: 12 }}
          />
          <YAxis
            stroke="#7c869a"
            tick={{ fontSize: 12 }}
            domain={[0, 100]}
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip
            cursor={{ fill: "rgba(16,185,129,0.06)" }}
            formatter={(value: number, _name: string, ctx: any) => {
              const payload = ctx?.payload as { correct?: number; count?: number } | undefined;
              const detail = payload ? ` (${payload.correct}/${payload.count})` : "";
              return [`${Number(value).toFixed(1)}%${detail}`, "Accuracy"];
            }}
          />
          <Bar dataKey="accuracy" fill={color} radius={[6, 6, 0, 0]}>
            <LabelList
              dataKey="accuracy"
              position="top"
              formatter={(v: number) => `${v.toFixed(0)}%`}
              style={{ fontSize: 11, fill: "#475569" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
