import { Link } from "react-router-dom";

import { getInsightsOverview } from "../api/insights";
import LatencyBarChart from "../components/charts/LatencyBarChart";
import QualityLatencyScatter from "../components/charts/QualityLatencyScatter";
import RadarScoreChart from "../components/charts/RadarScoreChart";
import ScoreBarChart from "../components/charts/ScoreBarChart";
import BenchmarkAccuracyBarChart from "../components/charts/BenchmarkAccuracyBarChart";
import BenchmarkAccuracyGroupedChart from "../components/charts/BenchmarkAccuracyGroupedChart";
import AccuracyLatencyScatter from "../components/charts/AccuracyLatencyScatter";
import BenchmarkBreakdownStacked from "../components/charts/BenchmarkBreakdownStacked";
import {
  Badge,
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

          {data.benchmarks.length > 0 && (
            <Card
              title="Benchmark scoring"
              description="Cross-run deterministic A/B/C/D accuracy. Separated per benchmark — each has its own gold-answer space."
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                {data.benchmarks.map((bench) => {
                  const top = data.best_per_benchmark.find((b) => b.benchmark === bench.benchmark);
                  return (
                    <div
                      key={bench.benchmark}
                      className="rounded-2xl border border-ink-200 bg-white px-5 py-4 shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-semibold text-ink-800">
                          {labelFor(bench.benchmark)}
                        </div>
                        <Badge tone="info">{bench.count} items</Badge>
                      </div>
                      <div className="mt-2 text-2xl font-semibold text-ink-900">
                        {bench.accuracy != null
                          ? `${(bench.accuracy * 100).toFixed(1)}%`
                          : "—"}
                      </div>
                      <div className="text-xs text-ink-500">
                        {bench.correct}/{bench.count} correct
                        {bench.parse_error_count
                          ? ` · ${bench.parse_error_count} parse err`
                          : ""}
                      </div>
                      {top && (
                        <div className="mt-2 text-xs text-ink-700">
                          Best:{" "}
                          <span className="font-mono">{top.model_name}</span>
                          {top.accuracy != null && (
                            <span className="ml-1 text-ink-500">
                              ({(top.accuracy * 100).toFixed(1)}%)
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {data.benchmarks.length > 1 && (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Card title="Accuracy by model and benchmark">
                <BenchmarkAccuracyGroupedChart data={data.benchmark_by_model} />
              </Card>
              <Card title="Accuracy vs latency (benchmark)">
                <AccuracyLatencyScatter data={data.by_model} />
              </Card>
            </div>
          )}

          {data.benchmarks.length === 1 && (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              <Card title={`${labelFor(data.benchmarks[0].benchmark)} · accuracy by model`}>
                <BenchmarkAccuracyBarChart
                  data={data.benchmark_by_model}
                  benchmarkLabel={labelFor(data.benchmarks[0].benchmark)}
                />
              </Card>
              <Card title="Accuracy vs latency (benchmark)">
                <AccuracyLatencyScatter data={data.by_model} />
              </Card>
            </div>
          )}

          {data.benchmarks.length > 0 && (
            <Card title="Coverage breakdown" description="Correct vs incorrect vs parse-error counts">
              <BenchmarkBreakdownStacked data={data.by_model} />
            </Card>
          )}

          <Card title="Model ranking">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-ink-400">
                  <tr>
                    <th className="px-2 py-2">Rank</th>
                    <th className="px-2 py-2">Model</th>
                    <th className="px-2 py-2">Outputs</th>
                    {data.benchmarks.map((bench) => (
                      <th key={bench.benchmark} className="px-2 py-2">
                        {labelFor(bench.benchmark)}
                      </th>
                    ))}
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
                      {data.benchmarks.map((bench) => {
                        const cell = row.by_benchmark.find((b) => b.benchmark === bench.benchmark);
                        return (
                          <td key={bench.benchmark} className="px-2 py-3 text-sm font-semibold">
                            {cell?.accuracy != null
                              ? `${(cell.accuracy * 100).toFixed(1)}%`
                              : "—"}
                            {cell && cell.count > 0 && (
                              <span className="ml-1 text-xs font-normal text-ink-500">
                                ({cell.correct}/{cell.count})
                              </span>
                            )}
                          </td>
                        );
                      })}
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
            </div>
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

const BENCHMARK_LABELS: Record<string, string> = {
  mmlu: "MMLU",
  hellaswag: "HellaSwag",
};

function labelFor(key: string): string {
  return BENCHMARK_LABELS[key] ?? key.toUpperCase();
}
