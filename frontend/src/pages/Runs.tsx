import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { ApiError } from "../api/client";
import { listDatasets } from "../api/datasets";
import { getJudgeDefaults } from "../api/judge";
import { getJudgeKey, setJudgeKey } from "../api/judgeKeys";
import { listOllamaModels } from "../api/models";
import { listPrompts } from "../api/prompts";
import { listProviderModels, listProviders } from "../api/providers";
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
import { useToast } from "../components/Toast";
import ModelLabel from "../components/ModelLabel";
import { useAsync } from "../hooks/useAsync";
import type {
  EvaluationMode,
  JudgeCriterionKey,
  JudgeProviderInfo,
  JudgeProviderKey,
  ProviderModel,
  RunCreatePayload,
} from "../types";

interface RunFormState {
  name: string;
  evaluation_mode: EvaluationMode;
  dataset_id: number | null;
  prompt_template_id: number | null;
  judge_provider: JudgeProviderKey;
  judge_model: string;
  selected_models: string[];
  judge_criteria: JudgeCriterionKey[];
  judge_system_prompt: string;
  judge_user_template: string;
  temperature: number;
  max_tokens: number;
  repeats: number;
  notes: string;
}

// The 5 criterion keys are fixed by the backend. We list them in the same
// canonical order the server uses so the UI checkbox order is stable.
const ALL_CRITERIA: JudgeCriterionKey[] = [
  "correctness",
  "factuality",
  "completeness",
  "conciseness",
  "instruction_following",
];

const MIN_CRITERIA = 2;

const defaultForm: RunFormState = {
  name: "",
  evaluation_mode: "judge",
  dataset_id: null,
  prompt_template_id: null,
  judge_provider: "ollama",
  judge_model: "",
  selected_models: [],
  judge_criteria: [...ALL_CRITERIA],
  judge_system_prompt: "",
  judge_user_template: "",
  temperature: 0.2,
  max_tokens: 512,
  repeats: 1,
  notes: "",
};

function describeApiError(err: unknown): { message: string; code?: string } {
  if (err instanceof ApiError) {
    // FastAPI returns `{detail: {code, message}}` from our providers router.
    const detail = (err.payload as { detail?: { code?: string; message?: string } | string })?.detail;
    if (detail && typeof detail === "object") {
      return { message: detail.message || err.message, code: detail.code };
    }
    return { message: err.message };
  }
  return { message: err instanceof Error ? err.message : String(err) };
}

export default function Runs() {
  const datasets = useAsync(() => listDatasets(), []);
  const prompts = useAsync(() => listPrompts(), []);
  const localModels = useAsync(() => listOllamaModels(), []);
  const providers = useAsync(() => listProviders(), []);
  const judgeDefaults = useAsync(() => getJudgeDefaults(), []);
  const runs = useAsync(() => listRuns(), []);
  const toast = useToast();

  const [form, setForm] = useState<RunFormState>(defaultForm);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [promptEditorOpen, setPromptEditorOpen] = useState(false);

  // Per-provider state for the API key + the model list returned after a
  // successful "Test & load models" call. We keep this in component state
  // (not on the run record) so the key never round-trips through the backend
  // until the user actually starts a run.
  const [apiKey, setApiKey] = useState<string>("");
  const [keyVisible, setKeyVisible] = useState(false);
  const [providerModels, setProviderModels] = useState<ProviderModel[]>([]);
  const [keyState, setKeyState] = useState<"empty" | "checking" | "verified" | "error">("empty");
  const [validating, setValidating] = useState(false);

  const isJudgeMode = form.evaluation_mode === "judge";
  const isBenchmarkMode = form.evaluation_mode === "benchmark";

  const availableDatasets = useMemo(() => {
    const all = datasets.data ?? [];
    if (isBenchmarkMode) return all.filter((d) => d.kind === "benchmark");
    return all.filter((d) => d.kind === "general");
  }, [datasets.data, isBenchmarkMode]);

  const generatorModels = useMemo(() => localModels.data?.models ?? [], [localModels.data]);

  const selectedProvider = useMemo<JudgeProviderInfo | undefined>(
    () => providers.data?.find((p) => p.key === form.judge_provider),
    [providers.data, form.judge_provider],
  );
  const isLocalJudge = form.judge_provider === "ollama";
  const requiresKey = selectedProvider?.requires_api_key ?? false;

  // Models offered in the "judge model" dropdown depend on the provider:
  //   - Ollama: locally installed models
  //   - Proprietary: whatever `Test & load models` returned (verified key)
  const judgeModelOptions = useMemo<ProviderModel[]>(() => {
    if (isLocalJudge) {
      return generatorModels.map((m) => ({ id: m.name, name: m.name }));
    }
    return providerModels;
  }, [isLocalJudge, generatorModels, providerModels]);

  const hasActiveRun = useMemo(
    () => (runs.data ?? []).some((r) => r.status === "running" || r.status === "pending"),
    [runs.data],
  );

  useEffect(() => {
    if (!form.dataset_id || !datasets.data) return;
    const ds = datasets.data.find((d) => d.id === form.dataset_id);
    if (!ds) return;
    const compatible =
      (isBenchmarkMode && ds.kind === "benchmark") || (isJudgeMode && ds.kind === "general");
    if (!compatible) {
      setForm((prev) => ({ ...prev, dataset_id: null }));
    }
  }, [form.dataset_id, form.evaluation_mode, datasets.data, isBenchmarkMode, isJudgeMode]);

  useEffect(() => {
    if (!hasActiveRun) return;
    const handle = window.setInterval(() => void runs.reload(), 1500);
    return () => window.clearInterval(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActiveRun]);

  // Seed the prompt editor textareas with the canonical defaults the first
  // time the user expands the editor. We do this lazily (instead of on mount)
  // so the form state stays "empty == use defaults" until the user actively
  // engages with the editor — submitting an unmodified form leaves the
  // backend's defaults in place rather than freezing them into the run.
  useEffect(() => {
    if (!promptEditorOpen || !judgeDefaults.data) return;
    setForm((prev) => {
      if (prev.judge_system_prompt || prev.judge_user_template) return prev;
      return {
        ...prev,
        judge_system_prompt: judgeDefaults.data!.system_prompt,
        judge_user_template: judgeDefaults.data!.user_template,
      };
    });
  }, [promptEditorOpen, judgeDefaults.data]);

  function resetPromptToDefault() {
    if (!judgeDefaults.data) return;
    setForm((prev) => ({
      ...prev,
      judge_system_prompt: judgeDefaults.data!.system_prompt,
      judge_user_template: judgeDefaults.data!.user_template,
    }));
  }

  function toggleCriterion(key: JudgeCriterionKey) {
    setForm((prev) => {
      const exists = prev.judge_criteria.includes(key);
      // Don't allow falling below the minimum — we'd rather block the toggle
      // than silently re-enable a different criterion.
      if (exists && prev.judge_criteria.length <= MIN_CRITERIA) {
        return prev;
      }
      const next = exists
        ? prev.judge_criteria.filter((c) => c !== key)
        : [...prev.judge_criteria, key];
      // Keep canonical order regardless of click order.
      return {
        ...prev,
        judge_criteria: ALL_CRITERIA.filter((c) => next.includes(c)),
      };
    });
  }

  // Whenever the user picks a different provider, restore any cached key and
  // reset the model dropdown / verification status.
  useEffect(() => {
    setProviderModels([]);
    setKeyState("empty");
    setForm((prev) => ({ ...prev, judge_model: "" }));
    if (isLocalJudge) {
      setApiKey("");
      setKeyVisible(false);
      return;
    }
    const cached = getJudgeKey(form.judge_provider);
    setApiKey(cached);
    setKeyVisible(false);
  }, [form.judge_provider, isLocalJudge]);

  // When the user edits the key after a successful validation, mark the cached
  // model list stale so they must re-validate before starting a run.
  useEffect(() => {
    if (!requiresKey) return;
    if (keyState === "verified") {
      setKeyState(apiKey ? "empty" : "empty");
      setProviderModels([]);
      setForm((prev) => ({ ...prev, judge_model: "" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  async function refreshAll() {
    await Promise.all([
      datasets.reload(),
      prompts.reload(),
      localModels.reload(),
      providers.reload(),
      runs.reload(),
    ]);
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

  const validateKeyAndLoadModels = useCallback(async () => {
    if (!selectedProvider) return;
    if (selectedProvider.requires_api_key && !apiKey.trim()) {
      toast.error("Enter your API key first.");
      return;
    }
    setValidating(true);
    setKeyState("checking");
    try {
      const response = await listProviderModels(selectedProvider.key, apiKey.trim() || null);
      setProviderModels(response.models);
      setKeyState("verified");
      // Cache only after a successful validation, so we never hold onto
      // strings the user didn't intend to use.
      if (selectedProvider.requires_api_key) {
        setJudgeKey(selectedProvider.key, apiKey.trim());
      }
      toast.success(
        `${selectedProvider.name}: found ${response.models.length} model${response.models.length === 1 ? "" : "s"}.`,
      );
    } catch (err) {
      setProviderModels([]);
      setKeyState("error");
      const { message, code } = describeApiError(err);
      const title =
        code === "invalid_api_key"
          ? "Invalid API key"
          : code === "rate_limited"
            ? "Rate limited"
            : code === "missing_api_key"
              ? "API key required"
              : `${selectedProvider.name} error`;
      toast.error(message, title);
    } finally {
      setValidating(false);
    }
  }, [selectedProvider, apiKey, toast]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    setSubmitError(null);

    if (!form.dataset_id || !form.prompt_template_id || form.selected_models.length === 0) {
      setSubmitError("Pick a dataset, prompt template, and at least one model.");
      return;
    }
    if (isJudgeMode && !form.judge_model) {
      setSubmitError("Select a judge model for LLM-as-judge evaluation.");
      return;
    }
    if (isJudgeMode && requiresKey && keyState !== "verified") {
      setSubmitError(
        `Validate your ${selectedProvider?.name ?? "judge"} API key with "Test & load models" before starting the run.`,
      );
      return;
    }
    if (isJudgeMode && form.judge_criteria.length < MIN_CRITERIA) {
      setSubmitError(`Select at least ${MIN_CRITERIA} criteria for the judge to score.`);
      return;
    }

    // Only send custom prompts when the user actually edited them (i.e. they
    // differ from the canonical defaults). Sending `null` preserves the
    // server's defaults and lets future default-prompt tweaks propagate to
    // historical configurations.
    const defaultSystem = judgeDefaults.data?.system_prompt ?? "";
    const defaultTemplate = judgeDefaults.data?.user_template ?? "";
    const systemPromptOverride =
      form.judge_system_prompt && form.judge_system_prompt.trim() !== defaultSystem.trim()
        ? form.judge_system_prompt
        : null;
    const userTemplateOverride =
      form.judge_user_template && form.judge_user_template.trim() !== defaultTemplate.trim()
        ? form.judge_user_template
        : null;
    // If all 5 are selected, omit the field so the run picks up future
    // default-rubric changes; if a subset, persist it explicitly.
    const judgeCriteriaPayload =
      form.judge_criteria.length === ALL_CRITERIA.length ? null : form.judge_criteria;

    const payload: RunCreatePayload = {
      name: form.name || `Run ${new Date().toLocaleString()}`,
      evaluation_mode: form.evaluation_mode,
      dataset_id: form.dataset_id,
      prompt_template_id: form.prompt_template_id,
      selected_models: form.selected_models,
      judge_model: isJudgeMode ? form.judge_model || null : null,
      judge_provider: isJudgeMode ? form.judge_provider : "ollama",
      judge_criteria: isJudgeMode ? judgeCriteriaPayload : null,
      judge_system_prompt: isJudgeMode ? systemPromptOverride : null,
      judge_user_template: isJudgeMode ? userTemplateOverride : null,
      temperature: form.temperature,
      max_tokens: form.max_tokens,
      repeats: form.repeats,
      notes: form.notes || null,
    };

    setSubmitting(true);
    try {
      const created = await createRun(payload);
      await startRun(created.id, {
        judge_api_key: isJudgeMode && requiresKey ? apiKey.trim() : null,
      });
      toast.success(`Run "${created.name}" started.`);
      // Preserve rubric + prompt edits so the user can immediately spin up a
      // sibling run without re-configuring; clear only the per-run inputs.
      setForm((prev) => ({
        ...defaultForm,
        evaluation_mode: prev.evaluation_mode,
        judge_provider: prev.judge_provider,
        judge_criteria: prev.judge_criteria,
        judge_system_prompt: prev.judge_system_prompt,
        judge_user_template: prev.judge_user_template,
      }));
      await runs.reload();
    } catch (err) {
      const { message } = describeApiError(err);
      setSubmitError(message);
      toast.error(message, "Could not start run");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this run and all of its outputs?")) return;
    try {
      await deleteRun(id);
      await runs.reload();
    } catch (err) {
      const { message } = describeApiError(err);
      toast.error(message, "Delete failed");
    }
  }

  async function handleRestart(run: {
    id: number;
    evaluation_mode?: EvaluationMode;
    judge_model?: string | null;
    judge_provider: JudgeProviderKey;
  }) {
    const isJudge = (run.evaluation_mode ?? (run.judge_model ? "judge" : "benchmark")) === "judge";
    const providerInfo = providers.data?.find((p) => p.key === run.judge_provider);
    let key: string | null = null;
    if (isJudge && run.judge_model && providerInfo?.requires_api_key) {
      key = getJudgeKey(run.judge_provider) || null;
      if (!key) {
        toast.error(
          `This run's judge (${providerInfo.name}) needs an API key. Use "New run" above to enter it for this session, then restart.`,
          "API key required",
        );
        return;
      }
    }
    try {
      await startRun(run.id, { judge_api_key: key });
      await runs.reload();
    } catch (err) {
      const { message } = describeApiError(err);
      toast.error(message, "Could not start run");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Benchmark runs</h1>
          <p className="mt-1 text-sm text-ink-500">
            Choose benchmark scoring (MMLU/HellaSwag) or LLM-as-judge — one evaluation path per run.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void refreshAll()}>
          Refresh
        </Button>
      </div>

      <Card
        title="New run"
        description="Pick an evaluation mode first — benchmark and judge runs use different datasets and produce separate results."
      >
        <form onSubmit={handleCreate} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="md:col-span-2">
            <div className="mb-1 text-sm font-medium text-ink-700">Evaluation mode</div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  {
                    key: "benchmark" as EvaluationMode,
                    label: "Standard benchmark",
                    hint: "MMLU, HellaSwag — deterministic A/B/C/D accuracy",
                  },
                  {
                    key: "judge" as EvaluationMode,
                    label: "LLM as judge",
                    hint: "Custom dataset — rubric scores from a judge model",
                  },
                ] as const
              ).map((option) => {
                const active = form.evaluation_mode === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        evaluation_mode: option.key,
                        dataset_id: null,
                      }))
                    }
                    className={
                      active
                        ? "flex min-w-[12rem] flex-1 flex-col rounded-xl border-2 border-accent-600 bg-accent-50 px-4 py-3 text-left shadow-sm"
                        : "flex min-w-[12rem] flex-1 flex-col rounded-xl border border-ink-200 bg-white px-4 py-3 text-left hover:bg-ink-50"
                    }
                  >
                    <span className="text-sm font-semibold text-ink-900">{option.label}</span>
                    <span className="mt-0.5 text-xs text-ink-500">{option.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <Input
            label="Run name"
            value={form.name}
            onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            placeholder="Auto-generated if empty"
          />
          <Select
            label={isBenchmarkMode ? "Benchmark dataset" : "Dataset"}
            value={form.dataset_id ?? ""}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                dataset_id: event.target.value ? Number(event.target.value) : null,
              }))
            }
            hint={
              isBenchmarkMode
                ? "Only datasets imported from MMLU/HellaSwag appear here."
                : "Upload JSONL on the Datasets page — benchmark imports are excluded."
            }
          >
            <option value="">
              {availableDatasets.length === 0
                ? isBenchmarkMode
                  ? "No benchmark datasets — import from Datasets"
                  : "No general datasets — upload JSONL"
                : "Choose dataset..."}
            </option>
            {availableDatasets.map((dataset) => (
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

          {isJudgeMode && (
            <>
          <Select
            label="Judge provider"
            value={form.judge_provider}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                judge_provider: event.target.value as JudgeProviderKey,
              }))
            }
            hint={selectedProvider?.description}
          >
            {(providers.data ?? []).map((provider) => (
              <option key={provider.key} value={provider.key}>
                {provider.name}
              </option>
            ))}
          </Select>

          <Select
            label="Judge model"
            value={form.judge_model}
            onChange={(event) => setForm((prev) => ({ ...prev, judge_model: event.target.value }))}
            hint={
              isLocalJudge
                ? "Use a different model from your generators when possible."
                : keyState === "verified"
                  ? `${providerModels.length} model${providerModels.length === 1 ? "" : "s"} available with this key.`
                  : 'Click "Test & load models" with your API key to populate this list.'
            }
            disabled={!isLocalJudge && keyState !== "verified"}
          >
            <option value="">Choose judge model…</option>
            {judgeModelOptions.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </Select>

          {!isLocalJudge && (
            <div className="md:col-span-2 rounded-xl border border-ink-200 bg-ink-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-ink-800">
                    {selectedProvider?.name ?? form.judge_provider} API key
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">
                    Stored only in this browser tab (sessionStorage). Never sent anywhere except
                    {" "}
                    <span className="font-medium">{selectedProvider?.name ?? form.judge_provider}</span>
                    {" "}
                    via your local backend. Closing the tab clears it.
                    {selectedProvider?.docs_url && (
                      <>
                        {" "}
                        <a
                          href={selectedProvider.docs_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="font-medium text-accent-700 hover:underline"
                        >
                          Get a key →
                        </a>
                      </>
                    )}
                  </p>
                </div>
                <Badge
                  tone={
                    keyState === "verified"
                      ? "good"
                      : keyState === "checking"
                        ? "info"
                        : keyState === "error"
                          ? "danger"
                          : "neutral"
                  }
                >
                  {keyState === "verified"
                    ? "Key verified"
                    : keyState === "checking"
                      ? "Checking…"
                      : keyState === "error"
                        ? "Key rejected"
                        : "Not verified"}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[16rem]">
                  <Input
                    label="API key"
                    type={keyVisible ? "text" : "password"}
                    autoComplete="off"
                    spellCheck={false}
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={
                      selectedProvider?.key === "openai"
                        ? "sk-…"
                        : selectedProvider?.key === "anthropic"
                          ? "sk-ant-…"
                          : selectedProvider?.key === "gemini"
                            ? "AIza…"
                            : "Paste your API key"
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setKeyVisible((v) => !v)}
                >
                  {keyVisible ? "Hide" : "Show"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void validateKeyAndLoadModels()}
                  disabled={validating || !apiKey.trim()}
                >
                  {validating ? "Testing…" : "Test & load models"}
                </Button>
              </div>
            </div>
          )}

          {form.judge_model && (
            <div className="md:col-span-2 rounded-xl border border-ink-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-ink-800">Rubric</div>
                  <p className="mt-0.5 text-xs text-ink-500">
                    Pick which criteria the judge should score. At least {MIN_CRITERIA} of {ALL_CRITERIA.length} must be selected.
                  </p>
                </div>
                <Badge tone={form.judge_criteria.length === ALL_CRITERIA.length ? "neutral" : "info"}>
                  {form.judge_criteria.length}/{ALL_CRITERIA.length} selected
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(judgeDefaults.data?.criteria ?? ALL_CRITERIA.map((k) => ({ key: k, label: k, description: "" }))).map(
                  (criterion) => {
                    const active = form.judge_criteria.includes(criterion.key as JudgeCriterionKey);
                    const isLastChecked = active && form.judge_criteria.length <= MIN_CRITERIA;
                    return (
                      <label
                        key={criterion.key}
                        className={
                          active
                            ? "flex cursor-pointer items-start gap-2 rounded-lg border border-accent-300 bg-accent-50/60 p-2"
                            : "flex cursor-pointer items-start gap-2 rounded-lg border border-ink-200 bg-white p-2 hover:bg-ink-50"
                        }
                        title={isLastChecked ? `At least ${MIN_CRITERIA} criteria are required.` : undefined}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 accent-accent-600"
                          checked={active}
                          disabled={isLastChecked}
                          onChange={() => toggleCriterion(criterion.key as JudgeCriterionKey)}
                        />
                        <span>
                          <span className="block text-sm font-medium text-ink-800">{criterion.label}</span>
                          {criterion.description && (
                            <span className="block text-xs text-ink-500">{criterion.description}</span>
                          )}
                        </span>
                      </label>
                    );
                  },
                )}
              </div>

              <details
                className="mt-4 rounded-lg border border-ink-200 bg-ink-50/60 p-3"
                open={promptEditorOpen}
                onToggle={(event) => setPromptEditorOpen((event.target as HTMLDetailsElement).open)}
              >
                <summary className="cursor-pointer text-sm font-medium text-ink-700">
                  Advanced: customize judge prompt
                </summary>
                <div className="mt-3 space-y-3">
                  <p className="text-xs text-ink-500">
                    Both prompts default to the same wording the LLM-judge has always used.
                    {" "}
                    Supported placeholders:
                    {" "}
                    {(judgeDefaults.data?.placeholders ?? ["{{input}}", "{{reference}}", "{{output}}", "{{criteria_block}}"]).map(
                      (ph) => (
                        <code
                          key={ph}
                          className="ml-1 rounded bg-white px-1 py-0.5 font-mono text-[11px] text-ink-700"
                        >
                          {ph}
                        </code>
                      ),
                    )}
                    . Leaving a field blank also falls back to the default.
                  </p>
                  <Textarea
                    label="System prompt"
                    rows={3}
                    value={form.judge_system_prompt}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, judge_system_prompt: event.target.value }))
                    }
                  />
                  <Textarea
                    label="User prompt template"
                    rows={10}
                    value={form.judge_user_template}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, judge_user_template: event.target.value }))
                    }
                    hint="Keep {{criteria_block}} in the template so the rubric stays in sync with the checkboxes above."
                  />
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={resetPromptToDefault}
                      disabled={!judgeDefaults.data}
                    >
                      Reset to default
                    </Button>
                  </div>
                </div>
              </details>
            </div>
          )}
            </>
          )}

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
              {generatorModels.length === 0 ? (
                <p className="text-sm text-ink-500">
                  No Ollama models detected. Pull at least one model and refresh.
                </p>
              ) : (
                generatorModels.map((model) => {
                  const active = form.selected_models.includes(model.name);
                  return (
                    <button
                      type="button"
                      key={model.name}
                      onClick={() => toggleModel(model.name)}
                      className={
                        active
                          ? "rounded-lg bg-accent-600 px-3 py-2 text-sm font-medium text-white shadow-sm"
                          : "rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100"
                      }
                    >
                      <ModelLabel
                        name={model.name}
                        nameClassName={active ? "text-white" : undefined}
                        providerClassName={active ? "text-white/75" : undefined}
                      />
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
                <th className="px-2 py-2">Mode</th>
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
                    <Badge tone={run.evaluation_mode === "benchmark" ? "info" : "neutral"}>
                      {run.evaluation_mode === "benchmark" ? "Benchmark" : "Judge"}
                    </Badge>
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex flex-wrap gap-1">
                      {run.selected_models.map((model) => (
                        <Badge key={model} tone="info">
                          <ModelLabel name={model} layout="inline" nameClassName="font-mono text-xs" />
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-2 py-3 text-xs text-ink-600">
                    {run.judge_model ? (
                      <div className="flex flex-col gap-0.5">
                        <Badge tone="neutral">{run.judge_model}</Badge>
                        {run.judge_provider && run.judge_provider !== "ollama" && (
                          <span className="text-[10px] uppercase tracking-wide text-ink-400">
                            via {run.judge_provider}
                          </span>
                        )}
                      </div>
                    ) : (
                      "—"
                    )}
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
                        <Button variant="secondary" size="sm" onClick={() => void handleRestart(run)}>
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
