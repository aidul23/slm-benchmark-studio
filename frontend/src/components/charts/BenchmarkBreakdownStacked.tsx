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

import type { ModelSummary } from "../../types";

interface Props {
  data: ModelSummary[];
  /** Optional filter so this chart only counts cells from one benchmark. */
  benchmark?: string;
}

/**
 * Stacked bar chart per model: correct vs incorrect vs parse-error.
 *
 * This is the "coverage" view — it answers "out of N benchmark items, how
 * many did each model actually answer correctly, get wrong, or fail to
 * produce a parseable letter for?"
 */
export default function BenchmarkBreakdownStacked({ data, benchmark }: Props) {
  const points = data
    .map((row) => {
      let count = 0;
      let correct = 0;
      let incorrect = 0;
      let parseErrors = 0;
      if (benchmark) {
        const cell = row.by_benchmark.find((b) => b.benchmark === benchmark);
        if (cell) {
          count = cell.count;
          correct = cell.correct;
          incorrect = cell.incorrect;
          parseErrors = cell.parse_error_count;
        }
      } else {
        count = row.benchmark_count;
        correct = row.benchmark_correct;
        incorrect = Math.max(0, count - correct);
        parseErrors = row.benchmark_parse_error_count;
      }
      return {
        model: row.model_name,
        correct,
        incorrect,
        parse_error: parseErrors,
        total: count + parseErrors,
      };
    })
    .filter((row) => row.total > 0);

  if (points.length === 0) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-ink-400">
        No benchmark coverage data yet.
      </div>
    );
  }

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
          <YAxis stroke="#7c869a" tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "rgba(99,102,241,0.05)" }}
            formatter={(value: number, name: string) => [Number(value).toFixed(0), name]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="correct" name="Correct" stackId="a" fill="#10b981" radius={[0, 0, 0, 0]} />
          <Bar dataKey="incorrect" name="Incorrect" stackId="a" fill="#ef4444" />
          <Bar dataKey="parse_error" name="Parse error" stackId="a" fill="#f59e0b" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
