import { Link } from "react-router-dom";

import { getInsightsOverview } from "../api/insights";
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  Stat,
  StatusBadge,
} from "../components/ui";
import ScoreBarChart from "../components/charts/ScoreBarChart";
import LatencyBarChart from "../components/charts/LatencyBarChart";
import { useAsync } from "../hooks/useAsync";

export default function Dashboard() {
  const { data, loading, error } = useAsync(() => getInsightsOverview(), []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Dashboard</h1>
        <p className="mt-1 text-sm text-ink-500">
          Local SLM benchmarking — the Data → Models → Judge → Insights → Refinement loop at a glance.
        </p>
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}

      {data && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Stat label="Datasets" value={data.total_datasets} />
            <Stat label="Runs" value={data.total_runs} />
            <Stat
              label="Best model (judge)"
              value={data.best_model_by_overall?.model_name ?? "—"}
              hint={
                data.best_model_by_overall?.avg_overall != null
                  ? `Avg ${data.best_model_by_overall.avg_overall.toFixed(2)} / 5`
                  : "No judge runs yet"
              }
              tone={data.best_model_by_overall ? "good" : "default"}
            />
            <Stat
              label="Best model (benchmark)"
              value={data.best_model_by_benchmark?.model_name ?? "—"}
              hint={
                data.best_model_by_benchmark?.benchmark_accuracy != null
                  ? `${(data.best_model_by_benchmark.benchmark_accuracy * 100).toFixed(1)}% accuracy`
                  : "No benchmark runs yet"
              }
              tone={data.best_model_by_benchmark ? "good" : "default"}
            />
            <Stat
              label="Fastest model"
              value={data.fastest_model_by_latency?.model_name ?? "—"}
              hint={
                data.fastest_model_by_latency?.avg_latency_ms != null
                  ? `Avg ${Math.round(data.fastest_model_by_latency.avg_latency_ms)} ms`
                  : "Awaiting runs"
              }
              tone={data.fastest_model_by_latency ? "good" : "default"}
            />
          </div>

          {data.best_per_benchmark.length > 0 && (
            <Card
              title="Best model per benchmark"
              description="Deterministic A/B/C/D accuracy, pooled across every run that touched each benchmark."
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                {data.best_per_benchmark.map((b) => (
                  <div
                    key={b.benchmark}
                    className="rounded-xl border border-ink-100 bg-ink-50 px-4 py-3"
                  >
                    <div className="text-xs font-medium uppercase tracking-wide text-ink-500">
                      {benchmarkLabel(b.benchmark)}
                    </div>
                    <div className="mt-1 font-mono text-sm text-ink-900">{b.model_name}</div>
                    <div className="mt-1 text-base font-semibold text-emerald-600">
                      {b.accuracy != null ? `${(b.accuracy * 100).toFixed(1)}%` : "—"}
                      <span className="ml-1 text-xs font-normal text-ink-500">
                        ({b.count} items)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card title="Judge · average overall score" description="LLM-as-judge runs only">
              {data.by_model.length === 0 ? (
                <EmptyState title="No judge runs yet" description="Start an LLM-as-judge run to populate this chart." />
              ) : (
                <ScoreBarChart data={data.by_model} metric="avg_overall" label="Overall" />
              )}
            </Card>
            <Card title="Average latency by model" description="All runs — generation phase">
              {data.all_models.length === 0 ? (
                <EmptyState title="No latency data yet" description="Latency is captured during the generation phase." />
              ) : (
                <LatencyBarChart data={data.all_models} />
              )}
            </Card>
          </div>

          <Card title="Recent runs" description="The latest benchmark sessions">
              {data.recent_runs.length === 0 ? (
                <EmptyState
                  title="No runs yet"
                  description="Head to Runs to configure your first evaluation."
                  action={
                    <Link
                      to="/runs"
                      className="text-sm font-medium text-accent-600 hover:text-accent-700"
                    >
                      Create a run →
                    </Link>
                  }
                />
              ) : (
                <ul className="divide-y divide-ink-100">
                  {data.recent_runs.map((run) => {
                    const pct = run.progress_total
                      ? Math.min(100, (run.progress_done / run.progress_total) * 100)
                      : 0;
                    return (
                      <li key={run.id} className="flex items-center justify-between gap-4 py-3">
                        <div className="min-w-0 flex-1">
                          <Link
                            to={`/runs/${run.id}`}
                            className="text-sm font-medium text-ink-800 hover:text-accent-700"
                          >
                            {run.name}
                          </Link>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-500">
                            <span>{run.created_at ? new Date(run.created_at).toLocaleString() : "—"}</span>
                            <Badge tone={run.evaluation_mode === "benchmark" ? "info" : "neutral"}>
                              {run.evaluation_mode === "benchmark" ? "Benchmark" : "Judge"}
                            </Badge>
                          </div>
                        <div className="mt-1 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-ink-100">
                          <div
                            className={
                              run.status === "failed"
                                ? "h-full bg-red-500"
                                : run.status === "completed"
                                  ? "h-full bg-emerald-500"
                                  : "h-full bg-accent-600"
                            }
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge tone="neutral">
                          {run.progress_done}/{run.progress_total}
                        </Badge>
                        <StatusBadge status={run.status} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

const BENCHMARK_LABELS: Record<string, string> = {
  mmlu: "MMLU",
  hellaswag: "HellaSwag",
  humaneval: "HumanEval",
};

function benchmarkLabel(key: string): string {
  return BENCHMARK_LABELS[key] ?? key.toUpperCase();
}
