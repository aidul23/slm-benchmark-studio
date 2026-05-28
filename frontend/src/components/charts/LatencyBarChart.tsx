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
import type { ModelSummary } from "../../types";
import {
  BarInsideLabel,
  MODEL_CHART_MARGINS,
  MODEL_CHART_XAXIS_HEIGHT,
  ModelChartAxisTick,
} from "./ModelChartParts";

interface Props {
  data: ModelSummary[];
}

/** Average generation latency — one brand-colored bar per model (AA-style). */
export default function LatencyBarChart({ data }: Props) {
  const points = data
    .map((row) => {
      const style = modelChartStyle(row.model_name);
      return {
        model: row.model_name,
        value: row.avg_latency_ms ?? 0,
        p50: row.p50_latency_ms,
        p95: row.p95_latency_ms,
        color: style.color,
        provider: style.label,
      };
    })
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);

  if (points.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-ink-400">
        No latency data yet.
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
          <YAxis stroke="#7c869a" tick={{ fontSize: 12 }} unit=" ms" width={48} />
          <Tooltip
            cursor={{ fill: "rgba(15,23,42,0.04)" }}
            formatter={(value: number, _name: string, ctx: any) => {
              const row = ctx?.payload as { p50?: number; p95?: number; provider?: string } | undefined;
              const lines = [`${Number(value).toFixed(0)} ms avg`];
              if (row?.p50 != null) lines.push(`p50: ${Math.round(row.p50)} ms`);
              if (row?.p95 != null) lines.push(`p95: ${Math.round(row.p95)} ms`);
              return [lines.join(" · "), row?.provider ?? "Latency"];
            }}
          />
          <Bar dataKey="value" name="Avg latency" radius={[4, 4, 0, 0]}>
            {points.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
            <LabelList
              dataKey="value"
              content={(props) => (
                <BarInsideLabel {...props} formatter={(v) => `${Math.round(v)}`} />
              )}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
