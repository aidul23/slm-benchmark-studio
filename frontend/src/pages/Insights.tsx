import { Link } from "react-router-dom";

import { getInsightsOverview } from "../api/insights";
import LatencyBarChart from "../components/charts/LatencyBarChart";
import QualityLatencyScatter from "../components/charts/QualityLatencyScatter";
import RadarScoreChart from "../components/charts/RadarScoreChart";
import ScoreBarChart from "../components/charts/ScoreBarChart";
import {
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
} from "../components/ui";
import { useAsync } from "../hooks/useAsync";

export default function Insights() {
  const { data, loading, error } = useAsync(() => getInsightsOverview(), []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Insights</h1>
        <p className="mt-1 text-sm text-ink-500">
          Cross-run aggregations: quality vs latency, score dimensions, and worst models per criterion.
        </p>
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}

      {data && data.by_model.length === 0 && (
        <EmptyState
          title="No data yet"
          description="Complete at least one run with a judge model to populate insights."
          action={
            <Link className="text-sm font-medium text-accent-600" to="/runs">
              Go to Runs →
            </Link>
          }
        />
      )}

      {data && data.by_model.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card title="Overall score by model">
              <ScoreBarChart data={data.by_model} metric="avg_overall" label="Overall" />
            </Card>
            <Card title="Latency by model">
              <LatencyBarChart data={data.by_model} />
            </Card>
            <Card title="Score dimensions">
              <RadarScoreChart data={data.by_model.slice(0, 6)} />
            </Card>
            <Card title="Quality vs latency">
              <QualityLatencyScatter data={data.by_model} />
            </Card>
          </div>

          <Card title="Model ranking">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-ink-400">
                <tr>
                  <th className="px-2 py-2">Rank</th>
                  <th className="px-2 py-2">Model</th>
                  <th className="px-2 py-2">Outputs</th>
                  <th className="px-2 py-2">Overall</th>
                  <th className="px-2 py-2">Correct.</th>
                  <th className="px-2 py-2">Fact.</th>
                  <th className="px-2 py-2">Compl.</th>
                  <th className="px-2 py-2">Concise.</th>
                  <th className="px-2 py-2">Instruct.</th>
                  <th className="px-2 py-2">Latency p50/p95</th>
                  <th className="px-2 py-2">Errors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {data.by_model.map((row, index) => (
                  <tr key={row.model_name}>
                    <td className="px-2 py-3 font-medium text-ink-700">#{index + 1}</td>
                    <td className="px-2 py-3 font-mono text-xs text-ink-800">{row.model_name}</td>
                    <td className="px-2 py-3 text-xs text-ink-600">{row.count}</td>
                    <td className="px-2 py-3 text-sm font-semibold">
                      {row.avg_overall != null ? row.avg_overall.toFixed(2) : "—"}
                    </td>
                    <td className="px-2 py-3 text-xs">{fmt(row.avg_correctness)}</td>
                    <td className="px-2 py-3 text-xs">{fmt(row.avg_factuality)}</td>
                    <td className="px-2 py-3 text-xs">{fmt(row.avg_completeness)}</td>
                    <td className="px-2 py-3 text-xs">{fmt(row.avg_conciseness)}</td>
                    <td className="px-2 py-3 text-xs">{fmt(row.avg_instruction_following)}</td>
                    <td className="px-2 py-3 text-xs text-ink-600">
                      {ms(row.p50_latency_ms)} / {ms(row.p95_latency_ms)}
                    </td>
                    <td className="px-2 py-3 text-xs text-ink-600">
                      {row.error_count} run · {row.parse_error_count} judge
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}

function fmt(value: number | null | undefined): string {
  return value == null ? "—" : value.toFixed(2);
}

function ms(value: number | null | undefined): string {
  return value == null ? "—" : `${Math.round(value)} ms`;
}
