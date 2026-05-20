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
  metric: keyof ModelSummary;
  label: string;
  color?: string;
  domain?: [number, number];
}

export default function ScoreBarChart({
  data,
  metric,
  label,
  color = "#4f46e5",
  domain = [0, 5],
}: Props) {
  const points = data.map((row) => ({
    model: row.model_name,
    value: (row[metric] as number | null | undefined) ?? 0,
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
          <YAxis stroke="#7c869a" tick={{ fontSize: 12 }} domain={domain} />
          <Tooltip
            cursor={{ fill: "rgba(99,102,241,0.05)" }}
            formatter={(value: number) => [Number(value).toFixed(2), label]}
          />
          <Bar dataKey="value" name={label} fill={color} radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
