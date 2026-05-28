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
  metric: keyof ModelSummary;
  label: string;
  domain?: [number, number];
}

export default function ScoreBarChart({
  data,
  metric,
  label,
  domain = [0, 5],
}: Props) {
  const points = data
    .map((row) => {
      const style = modelChartStyle(row.model_name);
      return {
        model: row.model_name,
        value: (row[metric] as number | null | undefined) ?? 0,
        color: style.color,
        provider: style.label,
      };
    })
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);

  if (points.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-ink-400">
        No scores yet.
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
          <YAxis stroke="#7c869a" tick={{ fontSize: 12 }} domain={domain} width={36} />
          <Tooltip
            cursor={{ fill: "rgba(15,23,42,0.04)" }}
            formatter={(value: number, _name: string, ctx: any) => {
              const row = ctx?.payload as { provider?: string } | undefined;
              return [Number(value).toFixed(2), `${label} · ${row?.provider ?? ""}`];
            }}
          />
          <Bar dataKey="value" name={label} radius={[4, 4, 0, 0]}>
            {points.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
            <LabelList
              dataKey="value"
              content={(props) => (
                <BarInsideLabel {...props} formatter={(v) => v.toFixed(2)} />
              )}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
