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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Datasets" value={data.total_datasets} />
            <Stat label="Runs" value={data.total_runs} />
            <Stat
              label="Best model (overall)"
              value={data.best_model_by_overall?.model_name ?? "—"}
              hint={
                data.best_model_by_overall?.avg_overall != null
                  ? `Avg ${data.best_model_by_overall.avg_overall.toFixed(2)} / 5`
                  : "Awaiting judge scores"
              }
              tone={data.best_model_by_overall ? "good" : "default"}
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

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card title="Average overall score by model" description="Across all completed runs">
              {data.by_model.length === 0 ? (
                <EmptyState title="No completed scores yet" description="Run a benchmark to populate this chart." />
              ) : (
                <ScoreBarChart data={data.by_model} metric="avg_overall" label="Overall" />
              )}
            </Card>
            <Card title="Average latency by model" description="Lower is better">
              {data.by_model.length === 0 ? (
                <EmptyState title="No latency data yet" description="Latency is captured during the generation phase." />
              ) : (
                <LatencyBarChart data={data.by_model} />
              )}
            </Card>
          </div>

          <Card title="Recent runs" description="The latest benchmark sessions">
            {data.recent_runs.length === 0 ? (
              <EmptyState
                title="No runs yet"
                description="Head to Runs to configure your first benchmark."
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
                {data.recent_runs.map((run) => (
                  <li key={run.id} className="flex items-center justify-between py-3">
                    <div>
                      <Link
                        to={`/runs/${run.id}`}
                        className="text-sm font-medium text-ink-800 hover:text-accent-700"
                      >
                        {run.name}
                      </Link>
                      <div className="text-xs text-ink-500">
                        {run.created_at ? new Date(run.created_at).toLocaleString() : "—"}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge tone="neutral">
                        {run.progress_done}/{run.progress_total}
                      </Badge>
                      <StatusBadge status={run.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
