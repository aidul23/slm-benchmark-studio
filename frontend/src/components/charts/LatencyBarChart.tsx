import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ModelSummary } from "../../types";

interface Props {
  data: ModelSummary[];
}

export default function LatencyBarChart({ data }: Props) {
  const points = data.map((row) => ({
    model: row.model_name,
    avg: row.avg_latency_ms ?? 0,
    p50: row.p50_latency_ms ?? 0,
    p95: row.p95_latency_ms ?? 0,
  }));

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 10, right: 16, left: 0, bottom: 24 }}>
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
          <YAxis stroke="#7c869a" tick={{ fontSize: 12 }} unit="ms" />
          <Tooltip
            cursor={{ fill: "rgba(99,102,241,0.05)" }}
            formatter={(value: number, key: string) => [`${Number(value).toFixed(0)} ms`, key]}
          />
          <Bar dataKey="avg" name="avg" fill="#6366f1" radius={[6, 6, 0, 0]} />
          <Bar dataKey="p50" name="p50" fill="#22c55e" radius={[6, 6, 0, 0]} />
          <Bar dataKey="p95" name="p95" fill="#f97316" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
