import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from "recharts";
import type { ModelSummary } from "../../types";

const PALETTE = ["#4f46e5", "#0ea5e9", "#10b981", "#f97316", "#ef4444", "#a855f7", "#14b8a6", "#eab308"];

const AXES: Array<{ key: keyof ModelSummary; label: string }> = [
  { key: "avg_correctness", label: "Correctness" },
  { key: "avg_factuality", label: "Factuality" },
  { key: "avg_completeness", label: "Completeness" },
  { key: "avg_conciseness", label: "Conciseness" },
  { key: "avg_instruction_following", label: "Instruction" },
];

interface Props {
  data: ModelSummary[];
}

export default function RadarScoreChart({ data }: Props) {
  if (data.length === 0) {
    return <div className="flex h-72 items-center justify-center text-sm text-ink-400">No judge scores yet.</div>;
  }

  const points = AXES.map((axis) => {
    const point: Record<string, string | number> = { metric: axis.label };
    for (const row of data) {
      point[row.model_name] = (row[axis.key] as number | null | undefined) ?? 0;
    }
    return point;
  });

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={points} outerRadius="75%">
          <PolarGrid stroke="#eceef2" />
          <PolarAngleAxis dataKey="metric" stroke="#56627a" tick={{ fontSize: 12 }} />
          <PolarRadiusAxis angle={90} domain={[0, 5]} tick={{ fontSize: 10 }} />
          {data.map((row, index) => (
            <Radar
              key={row.model_name}
              name={row.model_name}
              dataKey={row.model_name}
              stroke={PALETTE[index % PALETTE.length]}
              fill={PALETTE[index % PALETTE.length]}
              fillOpacity={0.18}
            />
          ))}
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Tooltip formatter={(value: number) => Number(value).toFixed(2)} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
