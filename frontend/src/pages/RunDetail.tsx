import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ApiError } from "../api/client";
import { getJudgeKey } from "../api/judgeKeys";
import { listProviders } from "../api/providers";
import {
  exportRunCsvUrl,
  getResults,
  getRun,
  getSummary,
  startRun,
  submitHumanReview,
} from "../api/runs";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Select,
  Stat,
  StatusBadge,
} from "../components/ui";
import { useToast } from "../components/Toast";
import { useAsync } from "../hooks/useAsync";
import type { BenchmarkBreakdown, JudgeProviderInfo, ResultRow, RunSummary } from "../types";
import ScoreBarChart from "../components/charts/ScoreBarChart";
import LatencyBarChart from "../components/charts/LatencyBarChart";
import BenchmarkAccuracyBarChart from "../components/charts/BenchmarkAccuracyBarChart";
import BenchmarkAccuracyGroupedChart from "../components/charts/BenchmarkAccuracyGroupedChart";
import BenchmarkBreakdownStacked from "../components/charts/BenchmarkBreakdownStacked";
import SubjectAccuracyBarChart from "../components/charts/SubjectAccuracyBarChart";
import AccuracyLatencyScatter from "../components/charts/AccuracyLatencyScatter";
import ProgressPanel from "../components/ProgressPanel";

export default function RunDetail() {
  const params = useParams();
  const id = Number(params.id);

  const run = useAsync(() => getRun(id), [id]);
  const summary = useAsync(() => getSummary(id), [id]);
  const results = useAsync(() => getResults(id), [id]);
  const providers = useAsync(() => listProviders(), []);
  const toast = useToast();

  async function handleStart() {
    if (!run.data) return;
    const provider: JudgeProviderInfo | undefined = providers.data?.find(
      (p) => p.key === run.data?.judge_provider,
    );
    let apiKey: string | null = null;
    if (run.data.judge_model && provider?.requires_api_key) {
      apiKey = getJudgeKey(run.data.judge_provider) || null;
      if (!apiKey) {
        toast.error(
          `This run's judge (${provider.name}) needs an API key. Open the Runs page, enter the key for this session, then come back and restart.`,
          "API key required",
        );
        return;
      }
    }
    try {
      await startRun(id, { judge_api_key: apiKey });
      void run.reload();
    } catch (err) {
      const detail = err instanceof ApiError ? err.payload : null;
      const detailObj = (detail as { detail?: { message?: string } } | null)?.detail;
      const message = (detailObj?.message ?? (err instanceof Error ? err.message : String(err))) || "Could not start run";
      toast.error(message, "Could not start run");
    }
  }

  const [modelFilter, setModelFilter] = useState<string>("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("");
  const [lowScoreOnly, setLowScoreOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [active, setActive] = useState<ResultRow | null>(null);

  // Poll while the run is in progress so the UI updates without manual refresh.
  // The run object refreshes faster than the heavier results/summary queries.
  useEffect(() => {
    if (!run.data) return;
    if (run.data.status !== "running" && run.data.status !== "pending") return;
    const fastHandle = window.setInterval(() => {
      void run.reload();
    }, 1000);
    const slowHandle = window.setInterval(() => {
      void summary.reload();
      void results.reload();
    }, 4000);
    return () => {
      window.clearInterval(fastHandle);
      window.clearInterval(slowHandle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.data?.status]);

  const models = useMemo(() => {
    if (!results.data) return [] as string[];
    return Array.from(new Set(results.data.map((row) => row.model_name))).sort();
  }, [results.data]);

  const categories = useMemo(() => {
    if (!results.data) return [] as string[];
    return Array.from(
      new Set(results.data.map((row) => row.category).filter(Boolean) as string[]),
    ).sort();
  }, [results.data]);

  const difficulties = useMemo(() => {
    if (!results.data) return [] as string[];
    return Array.from(
      new Set(results.data.map((row) => row.difficulty).filter(Boolean) as string[]),
    ).sort();
  }, [results.data]);

  const filteredResults = useMemo(() => {
    if (!results.data) return [] as ResultRow[];
    return results.data.filter((row) => {
      if (modelFilter && row.model_name !== modelFilter) return false;
      if (categoryFilter && row.category !== categoryFilter) return false;
      if (difficultyFilter && row.difficulty !== difficultyFilter) return false;
      if (lowScoreOnly) {
        const overall = row.judge?.overall ?? null;
        if (overall === null || overall > 3) return false;
      }
      if (search) {
        const needle = search.toLowerCase();
        const haystack = `${row.input} ${row.output ?? ""} ${row.reference ?? ""}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [results.data, modelFilter, categoryFilter, difficultyFilter, lowScoreOnly, search]);

  const hasBenchmark = useMemo(
    () => (results.data ?? []).some((row) => row.benchmark != null),
    [results.data],
  );
  const bestBenchmarkModel = useMemo(() => {
    if (!summary.data) return null;
    const ranked = summary.data.by_model
      .filter((m) => m.benchmark_accuracy != null && m.benchmark_count > 0)
      .sort((a, b) => (b.benchmark_accuracy ?? 0) - (a.benchmark_accuracy ?? 0));
    return ranked[0] ?? null;
  }, [summary.data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/runs" className="text-sm text-accent-600 hover:text-accent-700">
            ← All runs
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-ink-900">{run.data?.name ?? "Run"}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-500">
            {run.data && <StatusBadge status={run.data.status} />}
            {run.data?.judge_model && (
              <Badge tone="neutral">
                judge: {run.data.judge_model}
                {run.data.judge_provider && run.data.judge_provider !== "ollama" && (
                  <span className="ml-1 text-[10px] uppercase tracking-wide opacity-70">
                    · {run.data.judge_provider}
                  </span>
                )}
              </Badge>
            )}
            {run.data?.judge_model && run.data?.judge_criteria && (
              <Badge tone="info">
                rubric: {run.data.judge_criteria.length}/5 criteria
                {(run.data.judge_system_prompt || run.data.judge_user_template) && (
                  <span className="ml-1 text-[10px] uppercase tracking-wide opacity-70">
                    · custom prompt
                  </span>
                )}
              </Badge>
            )}
            {run.data?.selected_models.map((model) => (
              <Badge key={model} tone="info">
                {model}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => void run.reload()}>
            Refresh
          </Button>
          <a
            href={exportRunCsvUrl(id)}
            download
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
          >
            <DownloadIcon /> Download full CSV
          </a>
          {run.data && run.data.status !== "running" && (
            <Button size="sm" onClick={() => void handleStart()}>
              {run.data.status === "completed" ? "Re-run" : "Start"}
            </Button>
          )}
        </div>
      </div>

      {run.loading && <LoadingState />}
      {run.error && <ErrorState message={run.error} />}

      {run.data && <ProgressPanel run={run.data} />}

      {run.data?.status === "completed" && run.data.export_path && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm text-emerald-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="font-medium">Full results CSV saved on disk</div>
              <div className="mt-0.5 font-mono text-xs text-emerald-700">{run.data.export_path}</div>
            </div>
            <a
              href={exportRunCsvUrl(id)}
              download
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700"
            >
              <DownloadIcon /> Download a fresh copy
            </a>
          </div>
        </div>
      )}

      {run.data && (
        <div
          className={`grid grid-cols-1 gap-4 ${
            hasBenchmark ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-3"
          }`}
        >
          <Stat label="Examples" value={summary.data?.total_examples ?? "—"} />
          <Stat
            label="Outputs"
            value={summary.data?.total_outputs ?? "—"}
            hint="Across all models"
          />
          <Stat
            label="Best avg overall"
            value={summary.data?.by_model[0]?.model_name ?? "—"}
            hint={
              summary.data?.by_model[0]?.avg_overall != null
                ? `${summary.data.by_model[0].avg_overall.toFixed(2)} / 5`
                : "Awaiting judge"
            }
            tone={summary.data?.by_model[0]?.avg_overall ? "good" : "default"}
          />
          {hasBenchmark && (
            <Stat
              label="Best benchmark accuracy"
              value={bestBenchmarkModel?.model_name ?? "—"}
              hint={
                bestBenchmarkModel?.benchmark_accuracy != null
                  ? `${(bestBenchmarkModel.benchmark_accuracy * 100).toFixed(1)}% · ${bestBenchmarkModel.benchmark_correct}/${bestBenchmarkModel.benchmark_count}`
                  : "Awaiting deterministic scoring"
              }
              tone={bestBenchmarkModel?.benchmark_accuracy ? "good" : "default"}
            />
          )}
        </div>
      )}

      {summary.data && summary.data.by_model.length > 0 && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card title="Average overall score" description="LLM judge rubric (1–5)">
            <ScoreBarChart data={summary.data.by_model} metric="avg_overall" label="Overall" />
          </Card>
          <Card title="Latency">
            <LatencyBarChart data={summary.data.by_model} />
          </Card>
        </div>
      )}

      {summary.data && summary.data.benchmarks.length > 0 && (
        <BenchmarkScoringSection summary={summary.data} />
      )}

      <Card
        title="Results"
        description="Per-output details with optional filters."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={modelFilter}
              onChange={(event) => setModelFilter(event.target.value)}
              className="min-w-[10rem]"
            >
              <option value="">All models</option>
              {models.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
            <Select
              value={categoryFilter}
              onChange={(event) => setCategoryFilter(event.target.value)}
              className="min-w-[10rem]"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Select
              value={difficultyFilter}
              onChange={(event) => setDifficultyFilter(event.target.value)}
              className="min-w-[8rem]"
            >
              <option value="">Any difficulty</option>
              {difficulties.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </Select>
            <label className="inline-flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={lowScoreOnly}
                onChange={(event) => setLowScoreOnly(event.target.checked)}
                className="h-4 w-4 rounded border-ink-300"
              />
              Low score only (≤ 3)
            </label>
            <Input
              placeholder="Search input/output..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="min-w-[12rem]"
            />
          </div>
        }
      >
        {results.loading && <LoadingState />}
        {results.error && <ErrorState message={results.error} />}
        {results.data && results.data.length === 0 && (
          <EmptyState title="No outputs yet" description="Start the run to generate outputs." />
        )}
        {filteredResults.length > 0 && (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-ink-400">
                <tr>
                  <th className="px-2 py-2">Example</th>
                  <th className="px-2 py-2">Model</th>
                  <th className="px-2 py-2">Overall</th>
                  {hasBenchmark && <th className="px-2 py-2">Benchmark</th>}
                  <th className="px-2 py-2">Latency</th>
                  <th className="px-2 py-2">Tokens/s</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filteredResults.map((row) => {
                  const overall = row.judge?.overall;
                  const overallTone =
                    overall == null ? "neutral" : overall >= 4 ? "good" : overall >= 3 ? "warning" : "danger";
                  const benchmark = row.benchmark;
                  return (
                    <tr key={row.output_id} className="align-top">
                      <td className="px-2 py-3 max-w-[24rem]">
                        <div className="font-mono text-xs text-ink-500">
                          {row.external_id ?? `#${row.example_id}`}
                        </div>
                        <div className="mt-1 line-clamp-2 text-sm text-ink-800">{row.input}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {row.category && <Badge tone="info">{row.category}</Badge>}
                          {row.difficulty && <Badge tone="warning">{row.difficulty}</Badge>}
                        </div>
                      </td>
                      <td className="px-2 py-3 font-mono text-xs text-ink-700">{row.model_name}</td>
                      <td className="px-2 py-3">
                        {overall != null ? (
                          <Badge tone={overallTone}>{overall.toFixed(2)}</Badge>
                        ) : row.judge?.parse_error ? (
                          <Badge tone="danger">parse err</Badge>
                        ) : (
                          <Badge tone="neutral">—</Badge>
                        )}
                      </td>
                      {hasBenchmark && (
                        <td className="px-2 py-3">
                          {benchmark?.is_correct === true ? (
                            <Badge tone="good">
                              ✓ {benchmark.predicted ?? ""}
                            </Badge>
                          ) : benchmark?.is_correct === false ? (
                            <Badge tone="danger">
                              ✗ {benchmark.predicted ?? "?"} / {benchmark.expected ?? "?"}
                            </Badge>
                          ) : benchmark?.parse_error ? (
                            <Badge tone="warning">parse err</Badge>
                          ) : (
                            <Badge tone="neutral">—</Badge>
                          )}
                        </td>
                      )}
                      <td className="px-2 py-3 text-xs text-ink-700">
                        {row.latency_ms != null ? `${Math.round(row.latency_ms)} ms` : "—"}
                      </td>
                      <td className="px-2 py-3 text-xs text-ink-700">
                        {row.tokens_per_second != null ? row.tokens_per_second.toFixed(1) : "—"}
                      </td>
                      <td className="px-2 py-3 text-xs">
                        {row.error ? (
                          <Badge tone="danger">error</Badge>
                        ) : row.output ? (
                          <Badge tone="good">ok</Badge>
                        ) : (
                          <Badge tone="neutral">pending</Badge>
                        )}
                      </td>
                      <td className="px-2 py-3 text-right">
                        <Button variant="ghost" size="sm" onClick={() => setActive(row)}>
                          View
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {active && (
        <ResultModal
          row={active}
          onClose={() => setActive(null)}
          onReviewSaved={() => {
            void results.reload();
            void summary.reload();
          }}
        />
      )}
    </div>
  );
}

interface ResultModalProps {
  row: ResultRow;
  onClose: () => void;
  onReviewSaved: () => void;
}

function ResultModal({ row, onClose, onReviewSaved }: ResultModalProps) {
  const [humanScore, setHumanScore] = useState<string>(
    row.judge?.human_score != null ? String(row.judge.human_score) : "",
  );
  const [humanNotes, setHumanNotes] = useState<string>(row.judge?.human_notes ?? "");
  const [accepted, setAccepted] = useState<string>(
    row.judge?.accepted_judge_score == null ? "" : row.judge.accepted_judge_score ? "true" : "false",
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await submitHumanReview(row.run_id, row.output_id, {
        human_score: humanScore === "" ? null : Number(humanScore),
        human_notes: humanNotes || null,
        accepted_judge_score: accepted === "" ? null : accepted === "true",
      });
      onReviewSaved();
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="max-h-full w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-ink-100 px-6 py-4">
          <div>
            <div className="text-xs text-ink-500">
              {row.external_id ?? `#${row.example_id}`} · <span className="font-mono">{row.model_name}</span>
            </div>
            <h2 className="text-lg font-semibold text-ink-900">Output details</h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="space-y-4 px-6 py-5">
          <Section title="Input" body={row.input} />
          <Section title="Reference" body={row.reference ?? "—"} />
          <Section title="Output" body={row.output ?? "—"} tone={row.error ? "error" : "neutral"} />
          {row.error && <ErrorState message={row.error} />}
          {row.rendered_prompt && (
            <Section title="Rendered prompt" body={row.rendered_prompt} mono />
          )}

          {row.judge && (
            <div className="rounded-xl border border-ink-100 bg-ink-50 p-4">
              <div className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-500">
                Judge ({row.judge.judge_model ?? "n/a"})
              </div>
              {row.judge.parse_error ? (
                <ErrorState message={`Judge parse error: ${row.judge.parse_error}`} />
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-6">
                  <ScoreCell label="Overall" value={row.judge.overall} />
                  <ScoreCell label="Correctness" value={row.judge.correctness} />
                  <ScoreCell label="Factuality" value={row.judge.factuality} />
                  <ScoreCell label="Completeness" value={row.judge.completeness} />
                  <ScoreCell label="Conciseness" value={row.judge.conciseness} />
                  <ScoreCell label="Instruction" value={row.judge.instruction_following} />
                </div>
              )}
              {row.judge.reason && (
                <p className="mt-3 whitespace-pre-wrap text-sm text-ink-700">{row.judge.reason}</p>
              )}
            </div>
          )}

          {row.benchmark && (
            <div className="rounded-xl border border-ink-100 bg-ink-50 p-4">
              <div className="mb-3 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-ink-500">
                <span>
                  Benchmark ({row.benchmark.benchmark ?? "n/a"} · {row.benchmark.scorer ?? "n/a"})
                </span>
                {row.benchmark.is_correct === true && <Badge tone="good">correct</Badge>}
                {row.benchmark.is_correct === false && <Badge tone="danger">incorrect</Badge>}
              </div>
              {row.benchmark.parse_error ? (
                <ErrorState message={`Benchmark parse error: ${row.benchmark.parse_error}`} />
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <ScoreCell label="Predicted" value={null} display={row.benchmark.predicted ?? "—"} />
                  <ScoreCell label="Expected" value={null} display={row.benchmark.expected ?? "—"} />
                  <ScoreCell
                    label="Score"
                    value={null}
                    display={
                      row.benchmark.score != null
                        ? `${(row.benchmark.score * 100).toFixed(0)}%`
                        : "—"
                    }
                  />
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl border border-ink-100 bg-white p-4">
            <div className="mb-3 text-xs font-medium uppercase tracking-wide text-ink-500">
              Human review
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Input
                label="Human score (1–5)"
                type="number"
                min="1"
                max="5"
                step="0.5"
                value={humanScore}
                onChange={(event) => setHumanScore(event.target.value)}
              />
              <Select
                label="Accept judge score?"
                value={accepted}
                onChange={(event) => setAccepted(event.target.value)}
              >
                <option value="">No opinion</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </Select>
              <div className="md:col-span-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium text-ink-700">Notes</span>
                  <textarea
                    value={humanNotes}
                    onChange={(event) => setHumanNotes(event.target.value)}
                    rows={3}
                    className="block w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/30"
                  />
                </label>
              </div>
            </div>
            {saveError && <div className="mt-3"><ErrorState message={saveError} /></div>}
            <div className="mt-3 flex justify-end">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save review"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  body,
  mono,
  tone = "neutral",
}: {
  title: string;
  body: string;
  mono?: boolean;
  tone?: "neutral" | "error";
}) {
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-ink-400">{title}</div>
      <pre
        className={
          mono
            ? "mt-1 whitespace-pre-wrap rounded-lg bg-ink-50 px-3 py-2 font-mono text-xs leading-relaxed text-ink-800"
            : tone === "error"
              ? "mt-1 whitespace-pre-wrap rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800"
              : "mt-1 whitespace-pre-wrap rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-800"
        }
      >
        {body}
      </pre>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M7 10l5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

function ScoreCell({
  label,
  value,
  display,
}: {
  label: string;
  value: number | null | undefined;
  display?: string;
}) {
  return (
    <div className="rounded-lg bg-white px-3 py-2 shadow-sm">
      <div className="text-[10px] font-medium uppercase tracking-wide text-ink-400">{label}</div>
      <div className="mt-1 text-base font-semibold text-ink-800">
        {display ?? (value == null ? "—" : value.toFixed(2))}
      </div>
    </div>
  );
}

const BENCHMARK_LABELS: Record<string, string> = {
  mmlu: "MMLU",
  hellaswag: "HellaSwag",
};

function labelFor(key: string): string {
  return BENCHMARK_LABELS[key] ?? key.toUpperCase();
}

function BenchmarkScoringSection({ summary }: { summary: RunSummary }) {
  const benchmarks = summary.benchmarks;
  const multi = benchmarks.length > 1;

  return (
    <div className="space-y-6">
      <Card
        title="Benchmark scoring"
        description="Deterministic A/B/C/D scoring against the gold answer — independent of the LLM judge."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
          {benchmarks.map((bench) => (
            <Stat
              key={bench.benchmark}
              label={`${labelFor(bench.benchmark)} accuracy`}
              value={
                bench.accuracy != null ? `${(bench.accuracy * 100).toFixed(1)}%` : "—"
              }
              hint={`${bench.correct} / ${bench.count} correct${
                bench.parse_error_count ? ` · ${bench.parse_error_count} parse err` : ""
              }`}
              tone={bench.accuracy != null && bench.accuracy >= 0.5 ? "good" : "default"}
            />
          ))}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-ink-500">
          We evaluate each output by parsing a single A/B/C/D letter from the model's response and
          comparing it to the gold letter on the example. The metric reported is plain{" "}
          <span className="font-medium">accuracy</span> (correct ÷ scored). Note this is{" "}
          <span className="font-medium">generation-mode</span> evaluation — Ollama does not expose
          log-probabilities, so results may differ from canonical leaderboard numbers.
        </p>
      </Card>

      {multi && (
        <Card
          title="Accuracy by model and benchmark"
          description="One cluster per model, one colored bar per benchmark."
        >
          <BenchmarkAccuracyGroupedChart data={summary.benchmark_by_model} />
        </Card>
      )}

      <Card
        title="Accuracy vs latency"
        description="Quality–speed trade-off for the deterministic scorer (point size = items scored)."
      >
        <AccuracyLatencyScatter data={summary.by_model} />
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card
          title="Coverage breakdown"
          description="Per model: correct, incorrect, and items the parser couldn't read a letter from."
        >
          <BenchmarkBreakdownStacked data={summary.by_model} />
        </Card>
        {!multi && (
          <Card title="Accuracy by model" description={`Single benchmark: ${labelFor(benchmarks[0].benchmark)}`}>
            <BenchmarkAccuracyBarChart
              data={summary.benchmark_by_model.filter((s) => s.benchmark === benchmarks[0].benchmark)}
              benchmarkLabel={labelFor(benchmarks[0].benchmark)}
            />
          </Card>
        )}
        {multi && (
          <Card title="Coverage per benchmark" description="Choose a benchmark above for filtered views.">
            <BenchmarkBreakdownStacked
              data={summary.by_model}
              benchmark={benchmarks[0].benchmark}
            />
          </Card>
        )}
      </div>

      {benchmarks.map((bench) => (
        <PerBenchmarkCard
          key={bench.benchmark}
          summary={summary}
          bench={bench}
        />
      ))}
    </div>
  );
}

function PerBenchmarkCard({
  summary,
  bench,
}: {
  summary: RunSummary;
  bench: BenchmarkBreakdown;
}) {
  const cells = summary.benchmark_by_model.filter((s) => s.benchmark === bench.benchmark);
  const subjects = summary.benchmark_subjects[bench.benchmark] ?? [];

  return (
    <Card
      title={`${labelFor(bench.benchmark)} · detail`}
      description={
        bench.accuracy != null
          ? `${(bench.accuracy * 100).toFixed(1)}% across ${bench.count} scored items${
              bench.parse_error_count ? ` (${bench.parse_error_count} parse errors)` : ""
            }.`
          : "No scored items yet."
      }
    >
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-500">
            Accuracy by model
          </div>
          <BenchmarkAccuracyBarChart data={cells} benchmarkLabel={labelFor(bench.benchmark)} />
        </div>
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-500">
            Per-subject accuracy{subjects.length > 20 ? " (top + bottom)" : ""}
          </div>
          {subjects.length > 1 ? (
            <SubjectAccuracyBarChart data={subjects} />
          ) : (
            <div className="flex h-72 items-center justify-center text-sm text-ink-400">
              Only one subject — nothing to break down.
            </div>
          )}
        </div>
      </div>

      <table className="mt-6 w-full text-sm">
        <thead className="text-left text-xs uppercase text-ink-400">
          <tr>
            <th className="px-2 py-2">Model</th>
            <th className="px-2 py-2">Accuracy</th>
            <th className="px-2 py-2">Correct / scored</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {cells
            .slice()
            .sort((a, b) => (b.accuracy ?? 0) - (a.accuracy ?? 0))
            .map((row) => (
              <tr key={row.model_name}>
                <td className="px-2 py-2 font-mono text-xs text-ink-800">{row.model_name}</td>
                <td className="px-2 py-2 font-medium">
                  {row.accuracy != null ? `${(row.accuracy * 100).toFixed(1)}%` : "—"}
                </td>
                <td className="px-2 py-2 text-xs text-ink-600">
                  {row.correct} / {row.count}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </Card>
  );
}
