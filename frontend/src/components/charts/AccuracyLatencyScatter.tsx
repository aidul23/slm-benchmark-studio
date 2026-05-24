import {
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import type { ModelSummary } from "../../types";

const PALETTE = ["#4f46e5", "#0ea5e9", "#10b981", "#f97316", "#ef4444", "#a855f7", "#14b8a6", "#eab308"];

interface Props {
  data: ModelSummary[];
}

/**
 * Accuracy (Y) vs latency (X) scatter. The benchmark twin of
 * QualityLatencyScatter — same axes shape, just with a percentage Y axis.
 */
export default function AccuracyLatencyScatter({ data }: Props) {
  const points = data.filter(
    (row) => row.benchmark_accuracy != null && row.benchmark_count > 0 && row.avg_latency_ms != null,
  );

  if (points.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-ink-400">
        No benchmark vs latency data yet.
      </div>
    );
  }

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eceef2" />
          <XAxis
            type="number"
            dataKey="x"
            name="Latency (ms)"
            unit="ms"
            stroke="#7c869a"
            tick={{ fontSize: 12 }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name="Accuracy"
            domain={[0, 100]}
            tickFormatter={(value) => `${value}%`}
            stroke="#7c869a"
            tick={{ fontSize: 12 }}
          />
          <ZAxis type="number" dataKey="z" range={[60, 220]} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            formatter={(value: number, name: string) => {
              if (name === "Latency (ms)") return `${Number(value).toFixed(0)} ms`;
              if (name === "Accuracy") return `${Number(value).toFixed(1)}%`;
              return value;
            }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {points.map((row, index) => (
            <Scatter
              key={row.model_name}
              name={row.model_name}
              data={[
                {
                  x: row.avg_latency_ms ?? 0,
                  y: (row.benchmark_accuracy ?? 0) * 100,
                  z: row.benchmark_count,
                },
              ]}
              fill={PALETTE[index % PALETTE.length]}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
