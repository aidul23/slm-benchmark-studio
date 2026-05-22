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
import type { JudgeProviderInfo, ResultRow } from "../types";
import ScoreBarChart from "../components/charts/ScoreBarChart";
import LatencyBarChart from "../components/charts/LatencyBarChart";
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
        </div>
      )}

      {summary.data && summary.data.by_model.length > 0 && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card title="Average overall score">
            <ScoreBarChart data={summary.data.by_model} metric="avg_overall" label="Overall" />
          </Card>
          <Card title="Latency">
            <LatencyBarChart data={summary.data.by_model} />
          </Card>
        </div>
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

function ScoreCell({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <div className="rounded-lg bg-white px-3 py-2 shadow-sm">
      <div className="text-[10px] font-medium uppercase tracking-wide text-ink-400">{label}</div>
      <div className="mt-1 text-base font-semibold text-ink-800">
        {value == null ? "—" : value.toFixed(2)}
      </div>
    </div>
  );
}
