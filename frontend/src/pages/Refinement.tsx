import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { createPrompt, getPrompt, listPrompts } from "../api/prompts";
import { getResults, getRun, listRuns, updateRun } from "../api/runs";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Select,
  Textarea,
} from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import type { BenchmarkRun, PromptTemplate, ResultRow } from "../types";

export default function Refinement() {
  const runs = useAsync(() => listRuns(), []);
  const prompts = useAsync(() => listPrompts(), []);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [worstRows, setWorstRows] = useState<ResultRow[]>([]);
  const [runDetail, setRunDetail] = useState<BenchmarkRun | null>(null);
  const [basePrompt, setBasePrompt] = useState<PromptTemplate | null>(null);

  const [newName, setNewName] = useState("Refined prompt");
  const [newSystem, setNewSystem] = useState("");
  const [newTemplate, setNewTemplate] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);

  const [runNotes, setRunNotes] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);

  const completedRuns = useMemo(
    () => (runs.data ?? []).filter((run) => run.status === "completed"),
    [runs.data],
  );

  useEffect(() => {
    if (selectedRunId == null && completedRuns.length > 0) {
      setSelectedRunId(completedRuns[0].id);
    }
  }, [completedRuns, selectedRunId]);

  useEffect(() => {
    if (selectedRunId == null) return;
    void (async () => {
      try {
        const [detail, rows] = await Promise.all([
          getRun(selectedRunId),
          getResults(selectedRunId),
        ]);
        setRunDetail(detail);
        setRunNotes(detail.notes ?? "");

        const scored = rows
          .filter((row) => row.judge && row.judge.overall != null)
          .sort((a, b) => (a.judge?.overall ?? 5) - (b.judge?.overall ?? 5))
          .slice(0, 12);
        setWorstRows(scored);

        const base = await getPrompt(detail.prompt_template_id);
        setBasePrompt(base);
        setNewSystem(base.system_prompt ?? "");
        setNewTemplate(base.template);
        setNewName(`${base.name} (refined)`);
        setNewNotes("");
      } catch (err) {
        console.error(err);
      }
    })();
  }, [selectedRunId]);

  async function handleSaveNew(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    try {
      const created = await createPrompt({
        name: newName,
        system_prompt: newSystem,
        template: newTemplate,
        notes: newNotes,
        version: basePrompt ? basePrompt.version + 1 : 1,
      });
      setSavedId(created.id);
      await prompts.reload();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveNotes() {
    if (selectedRunId == null) return;
    setNotesSaving(true);
    try {
      const updated = await updateRun(selectedRunId, { notes: runNotes });
      setRunDetail(updated);
    } finally {
      setNotesSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Refinement</h1>
        <p className="mt-1 text-sm text-ink-500">
          Close the loop: review failures, capture learnings, and ship an improved prompt template.
        </p>
      </div>

      {runs.loading && <LoadingState />}
      {runs.error && <ErrorState message={runs.error} />}
      {runs.data && completedRuns.length === 0 && (
        <EmptyState
          title="No completed runs"
          description="Finish a benchmark run with judge scoring to unlock refinement."
          action={
            <Link className="text-sm font-medium text-accent-600" to="/runs">
              Go to runs →
            </Link>
          }
        />
      )}

      {completedRuns.length > 0 && (
        <>
          <Card title="Select a run">
            <Select
              value={selectedRunId ?? ""}
              onChange={(event) => setSelectedRunId(Number(event.target.value))}
            >
              {completedRuns.map((run) => (
                <option key={run.id} value={run.id}>
                  {run.name} · {new Date(run.created_at).toLocaleString()}
                </option>
              ))}
            </Select>
          </Card>

          {runDetail && (
            <Card title="Run notes" description="Capture what you learned from this run.">
              <Textarea
                rows={3}
                value={runNotes}
                onChange={(event) => setRunNotes(event.target.value)}
              />
              <div className="mt-3 flex justify-end">
                <Button onClick={handleSaveNotes} disabled={notesSaving}>
                  {notesSaving ? "Saving..." : "Save notes"}
                </Button>
              </div>
            </Card>
          )}

          <Card title="Lowest-scoring examples" description="Sorted by judge overall score, ascending.">
            {worstRows.length === 0 ? (
              <EmptyState title="No judge scores" description="Run with a judge model to see failures here." />
            ) : (
              <ul className="space-y-3">
                {worstRows.map((row) => (
                  <li key={row.output_id} className="rounded-xl border border-ink-100 bg-ink-50 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="danger">
                        overall {row.judge?.overall != null ? row.judge.overall.toFixed(2) : "—"}
                      </Badge>
                      <Badge tone="info">{row.model_name}</Badge>
                      {row.category && <Badge tone="warning">{row.category}</Badge>}
                      {row.difficulty && <Badge tone="neutral">{row.difficulty}</Badge>}
                    </div>
                    <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                      <Section label="Input" text={row.input} />
                      <Section label="Reference" text={row.reference ?? "—"} />
                      <Section label="Output" text={row.output ?? "—"} />
                    </div>
                    {row.judge?.reason && (
                      <div className="mt-3 text-xs italic text-ink-600">{row.judge.reason}</div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card
            title="Create improved prompt"
            description={
              basePrompt
                ? `Forked from "${basePrompt.name}" v${basePrompt.version}`
                : "Pick a run to seed this form."
            }
          >
            <form onSubmit={handleSaveNew} className="space-y-4">
              <Input
                label="Name"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                required
              />
              <Textarea
                label="System prompt"
                rows={3}
                value={newSystem}
                onChange={(event) => setNewSystem(event.target.value)}
              />
              <Textarea
                label="User template"
                rows={8}
                value={newTemplate}
                onChange={(event) => setNewTemplate(event.target.value)}
                required
              />
              <Textarea
                label="Refinement notes"
                rows={3}
                value={newNotes}
                onChange={(event) => setNewNotes(event.target.value)}
                placeholder="What did you change and why?"
              />
              {saveError && <ErrorState message={saveError} />}
              {savedId && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  Saved! Head to{" "}
                  <Link to="/prompts" className="font-medium underline">
                    Prompts
                  </Link>{" "}
                  or start a new run to compare.
                </div>
              )}
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save as new prompt"}
              </Button>
            </form>
          </Card>
        </>
      )}
    </div>
  );
}

function Section({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-ink-400">{label}</div>
      <p className="mt-1 whitespace-pre-wrap text-xs text-ink-800">{text}</p>
    </div>
  );
}
