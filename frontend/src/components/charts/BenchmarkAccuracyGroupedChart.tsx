import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { modelChartStyle } from "../../lib/modelProviders";
import type { BenchmarkModelStat } from "../../types";
import {
  MODEL_CHART_MARGINS,
  MODEL_CHART_XAXIS_HEIGHT,
  ModelChartAxisTick,
} from "./ModelChartParts";

interface Props {
  data: BenchmarkModelStat[];
}

const BENCHMARK_LABELS: Record<string, string> = {
  mmlu: "MMLU",
  hellaswag: "HellaSwag",
};

function labelFor(key: string): string {
  return BENCHMARK_LABELS[key] ?? key.toUpperCase();
}

/** Tint a hex color with alpha 0–1 for secondary benchmark bars. */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Grouped bar chart: one cluster per model (logo on axis), one bar per benchmark.
 * Bars use each model's provider brand color; lighter shade for the 2nd benchmark.
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
    const style = modelChartStyle(model);
    const row: Record<string, string | number> = {
      model,
      providerColor: style.color,
    };
    for (const bench of benchmarks) {
      const cell = data.find((d) => d.model_name === model && d.benchmark === bench);
      row[bench] = cell?.accuracy != null ? cell.accuracy * 100 : 0;
      row[`${bench}__correct`] = cell?.correct ?? 0;
      row[`${bench}__count`] = cell?.count ?? 0;
    }
    return row;
  });

  return (
    <div className="h-96 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ ...MODEL_CHART_MARGINS, bottom: MODEL_CHART_MARGINS.bottom }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" vertical={false} />
          <XAxis
            dataKey="model"
            interval={0}
            tick={ModelChartAxisTick}
            height={MODEL_CHART_XAXIS_HEIGHT}
            stroke="transparent"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            stroke="#7c869a"
            tick={{ fontSize: 12 }}
            domain={[0, 100]}
            tickFormatter={(value) => `${value}%`}
            width={40}
          />
          <Tooltip
            cursor={{ fill: "rgba(15,23,42,0.04)" }}
            formatter={(value: number, name: string, ctx: any) => {
              const payload = ctx?.payload as Record<string, number> | undefined;
              const correct = payload?.[`${name}__correct`];
              const count = payload?.[`${name}__count`];
              const detail = count ? ` (${correct}/${count})` : "";
              return [`${Number(value).toFixed(1)}%${detail}`, labelFor(name)];
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} formatter={(value) => labelFor(value)} />
          {benchmarks.map((bench, benchIndex) => (
            <Bar
              key={bench}
              dataKey={bench}
              name={bench}
              radius={[4, 4, 0, 0]}
            >
              {points.map((entry, index) => {
                const base = String(entry.providerColor ?? "#64748B");
                const fill = benchIndex === 0 ? base : withAlpha(base, 0.45);
                return <Cell key={`${bench}-${index}`} fill={fill} />;
              })}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
