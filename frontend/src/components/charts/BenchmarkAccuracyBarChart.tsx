import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { modelChartStyle } from "../../lib/modelProviders";
import type { BenchmarkModelStat } from "../../types";
import {
  BarInsideLabel,
  MODEL_CHART_MARGINS,
  MODEL_CHART_XAXIS_HEIGHT,
  ModelChartAxisTick,
} from "./ModelChartParts";

interface Props {
  data: BenchmarkModelStat[];
  /** When provided, the chart title-axis can show "MMLU" / "HellaSwag" etc. */
  benchmarkLabel?: string;
}

/**
 * Accuracy bar chart for a single benchmark, one brand-colored bar per model.
 */
export default function BenchmarkAccuracyBarChart({ data, benchmarkLabel }: Props) {
  const points = data
    .filter((row) => row.count > 0 && row.accuracy != null)
    .map((row) => {
      const style = modelChartStyle(row.model_name);
      return {
        model: row.model_name,
        accuracy: (row.accuracy ?? 0) * 100,
        correct: row.correct,
        count: row.count,
        color: style.color,
        provider: style.label,
      };
    })
    .sort((a, b) => b.accuracy - a.accuracy);

  if (points.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-ink-400">
        No scored items for {benchmarkLabel ?? "this benchmark"} yet.
      </div>
    );
  }

  return (
    <div className="h-80 w-full">
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
            formatter={(value: number, _name: string, ctx: any) => {
              const payload = ctx?.payload as { correct?: number; count?: number; provider?: string } | undefined;
              const detail = payload ? ` (${payload.correct}/${payload.count})` : "";
              return [`${Number(value).toFixed(1)}%${detail}`, `${payload?.provider ?? "Accuracy"}`];
            }}
          />
          <Bar dataKey="accuracy" radius={[4, 4, 0, 0]}>
            {points.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
            <LabelList
              dataKey="accuracy"
              content={(props) => (
                <BarInsideLabel {...props} formatter={(v) => `${Math.round(v)}%`} />
              )}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
