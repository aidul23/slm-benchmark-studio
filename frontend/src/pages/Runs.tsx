import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { listDatasets } from "../api/datasets";
import { listOllamaModels } from "../api/models";
import { listPrompts } from "../api/prompts";
import { createRun, deleteRun, listRuns, startRun } from "../api/runs";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Select,
  StatusBadge,
  Textarea,
} from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import type { RunCreatePayload } from "../types";

interface RunFormState {
  name: string;
  dataset_id: number | null;
  prompt_template_id: number | null;
  judge_model: string;
  selected_models: string[];
  temperature: number;
  max_tokens: number;
  repeats: number;
  notes: string;
}

const defaultForm: RunFormState = {
  name: "",
  dataset_id: null,
  prompt_template_id: null,
  judge_model: "",
  selected_models: [],
  temperature: 0.2,
  max_tokens: 512,
  repeats: 1,
  notes: "",
};

export default function Runs() {
  const datasets = useAsync(() => listDatasets(), []);
  const prompts = useAsync(() => listPrompts(), []);
  const models = useAsync(() => listOllamaModels(), []);
  const runs = useAsync(() => listRuns(), []);

  const [form, setForm] = useState<RunFormState>(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const availableModels = useMemo(() => models.data?.models ?? [], [models.data]);

  const hasActiveRun = useMemo(
    () => (runs.data ?? []).some((r) => r.status === "running" || r.status === "pending"),
    [runs.data],
  );

  // Poll the runs list while any run is active so the bars update live.
  useEffect(() => {
    if (!hasActiveRun) return;
    const handle = window.setInterval(() => void runs.reload(), 1500);
    return () => window.clearInterval(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActiveRun]);

  async function refreshAll() {
    await Promise.all([datasets.reload(), prompts.reload(), models.reload(), runs.reload()]);
  }

  function toggleModel(name: string) {
    setForm((prev) => {
      const exists = prev.selected_models.includes(name);
      return {
        ...prev,
        selected_models: exists
          ? prev.selected_models.filter((item) => item !== name)
          : [...prev.selected_models, name],
      };
    });
  }

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setSubmitError(null);

    if (!form.dataset_id || !form.prompt_template_id || form.selected_models.length === 0) {
      setSubmitError("Pick a dataset, prompt template, and at least one model.");
      return;
    }

    const payload: RunCreatePayload = {
      name: form.name || `Run ${new Date().toLocaleString()}`,
      dataset_id: form.dataset_id,
      prompt_template_id: form.prompt_template_id,
      selected_models: form.selected_models,
      judge_model: form.judge_model || null,
      temperature: form.temperature,
      max_tokens: form.max_tokens,
      repeats: form.repeats,
      notes: form.notes || null,
    };

    setSubmitting(true);
    try {
      const created = await createRun(payload);
      await startRun(created.id);
      setForm(defaultForm);
      await runs.reload();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this run and all of its outputs?")) return;
    await deleteRun(id);
    await runs.reload();
  }

  async function handleRestart(id: number) {
    await startRun(id);
    await runs.reload();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Benchmark runs</h1>
          <p className="mt-1 text-sm text-ink-500">
            Configure the dataset, prompt, models, and judge, then launch the loop.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void refreshAll()}>
          Refresh
        </Button>
      </div>

      <Card title="New run" description="Each run pairs a dataset and prompt with one or more generator models and an optional judge.">
        <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            label="Run name"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Auto-generated if empty"
          />
          <Select
            label="Dataset"
            value={form.dataset_id ?? ""}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                dataset_id: event.target.value ? Number(event.target.value) : null,
              }))
            }
          >
            <option value="">Choose dataset...</option>
            {datasets.data?.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>
                {dataset.name} ({dataset.example_count} examples)
              </option>
            ))}
          </Select>

          <Select
            label="Prompt template"
            value={form.prompt_template_id ?? ""}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                prompt_template_id: event.target.value ? Number(event.target.value) : null,
              }))
            }
          >
            <option value="">Choose prompt...</option>
            {prompts.data?.map((prompt) => (
              <option key={prompt.id} value={prompt.id}>
                {prompt.name} (v{prompt.version})
              </option>
            ))}
          </Select>

          <Select
            label="Judge model (optional but recommended)"
            value={form.judge_model}
            onChange={(event) => setForm((prev) => ({ ...prev, judge_model: event.target.value }))}
            hint="Use a different model from your generators when possible."
          >
            <option value="">No judge (generation only)</option>
            {availableModels.map((model) => (
              <option key={model.name} value={model.name}>
                {model.name}
              </option>
            ))}
          </Select>

          <Input
            label="Temperature"
            type="number"
            step="0.1"
            min="0"
            max="2"
            value={form.temperature}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, temperature: Number(event.target.value || 0) }))
            }
          />
          <Input
            label="Max tokens"
            type="number"
            min="16"
            max="4096"
            value={form.max_tokens}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, max_tokens: Number(event.target.value || 512) }))
            }
          />

          <div className="md:col-span-2">
            <div className="mb-1 text-sm font-medium text-ink-700">Generator models</div>
            <div className="flex flex-wrap gap-2 rounded-lg border border-ink-200 bg-white p-3">
              {availableModels.length === 0 ? (
                <p className="text-sm text-ink-500">
                  No Ollama models detected. Pull at least one model and refresh.
                </p>
              ) : (
                availableModels.map((model) => {
                  const active = form.selected_models.includes(model.name);
                  return (
                    <button
                      type="button"
                      key={model.name}
                      onClick={() => toggleModel(model.name)}
                      className={
                        active
                          ? "rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm"
                          : "rounded-lg border border-ink-200 bg-ink-50 px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-100"
                      }
                    >
                      {model.name}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="md:col-span-2">
            <Textarea
              label="Notes"
              rows={2}
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="What are you trying to learn from this run?"
            />
          </div>

          {submitError && (
            <div className="md:col-span-2">
              <ErrorState message={submitError} />
            </div>
          )}

          <div className="md:col-span-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Starting..." : "Create & start run"}
            </Button>
          </div>
        </form>
      </Card>

      {runs.loading && <LoadingState />}
      {runs.error && <ErrorState message={runs.error} />}

      {runs.data && runs.data.length === 0 && (
        <EmptyState title="No runs yet" description="Configure a run above and launch it." />
      )}

      {runs.data && runs.data.length > 0 && (
        <Card title="History" description={`${runs.data.length} run${runs.data.length === 1 ? "" : "s"}`}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400">
              <tr>
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Models</th>
                <th className="px-2 py-2">Judge</th>
                <th className="px-2 py-2">Status</th>
                <th className="px-2 py-2">Progress</th>
                <th className="px-2 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {runs.data.map((run) => (
                <tr key={run.id}>
                  <td className="px-2 py-3">
                    <Link to={`/runs/${run.id}`} className="font-medium text-ink-800 hover:text-accent-700">
                      {run.name}
                    </Link>
                    <div className="text-xs text-ink-500">
                      {new Date(run.created_at).toLocaleString()}
                    </div>
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex flex-wrap gap-1">
                      {run.selected_models.map((model) => (
                        <Badge key={model} tone="info">
                          {model}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-2 py-3 text-xs text-ink-600">
                    {run.judge_model ? <Badge tone="neutral">{run.judge_model}</Badge> : "—"}
                  </td>
                  <td className="px-2 py-3"><StatusBadge status={run.status} /></td>
                  <td className="px-2 py-3 text-xs text-ink-600">
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        {run.progress_done}/{run.progress_total}
                      </span>
                      <span className="font-medium">
                        {run.progress_total
                          ? `${Math.round((run.progress_done / run.progress_total) * 100)}%`
                          : "—"}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-32 overflow-hidden rounded-full bg-ink-100">
                      <div
                        className={
                          run.status === "failed"
                            ? "h-full bg-red-500"
                            : run.status === "completed"
                              ? "h-full bg-emerald-500"
                              : "h-full bg-accent-600"
                        }
                        style={{
                          width: run.progress_total
                            ? `${Math.min(100, (run.progress_done / run.progress_total) * 100)}%`
                            : "0%",
                        }}
                      />
                    </div>
                    {run.current_activity && run.status === "running" && (
                      <div className="mt-1 truncate font-mono text-[10px] text-ink-400">
                        {run.current_activity}
                      </div>
                    )}
                    {run.error && <div className="mt-1 text-red-600">{run.error}</div>}
                  </td>
                  <td className="px-2 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      {run.status !== "running" && (
                        <Button variant="secondary" size="sm" onClick={() => void handleRestart(run.id)}>
                          {run.status === "completed" ? "Re-run" : "Start"}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => void handleDelete(run.id)}>
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
