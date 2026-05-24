import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { BenchmarkModelStat } from "../../types";

const PALETTE = ["#10b981", "#6366f1", "#f97316", "#0ea5e9", "#a855f7", "#ef4444", "#14b8a6", "#eab308"];

interface Props {
  data: BenchmarkModelStat[];
}

/**
 * Grouped bar chart: one cluster per model, one bar per benchmark.
 * Bar height = accuracy percentage; tooltip shows correct/total per cell.
 *
 * Use this when a run (or insights view) has scores from more than one
 * benchmark and the user wants to compare them side-by-side per model.
 */
export default function BenchmarkAccuracyGroupedChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-ink-400">
        No benchmark scores yet.
      </div>
    );
  }

  const benchmarks = Array.from(new Set(data.map((d) => d.benchmark))).sort();
  const models = Array.from(new Set(data.map((d) => d.model_name)));

  const points = models.map((model) => {
    const row: Record<string, string | number> = { model };
    for (const bench of benchmarks) {
      const cell = data.find((d) => d.model_name === model && d.benchmark === bench);
      row[bench] = cell?.accuracy != null ? cell.accuracy * 100 : 0;
      row[`${bench}__correct`] = cell?.correct ?? 0;
      row[`${bench}__count`] = cell?.count ?? 0;
    }
    return row;
  });

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 10, right: 16, left: 0, bottom: 30 }}>
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
            cursor={{ fill: "rgba(99,102,241,0.05)" }}
            formatter={(value: number, name: string, ctx: any) => {
              const payload = ctx?.payload as Record<string, number> | undefined;
              const correct = payload?.[`${name}__correct`];
              const count = payload?.[`${name}__count`];
              const detail = count ? ` (${correct}/${count})` : "";
              return [`${Number(value).toFixed(1)}%${detail}`, name];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {benchmarks.map((bench, index) => (
            <Bar
              key={bench}
              dataKey={bench}
              fill={PALETTE[index % PALETTE.length]}
              radius={[4, 4, 0, 0]}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
