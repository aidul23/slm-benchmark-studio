import { useEffect, useState } from "react";

import {
  createPrompt,
  deletePrompt,
  listPrompts,
  previewPrompt,
  updatePrompt,
} from "../api/prompts";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Textarea,
} from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import type { PromptTemplate } from "../types";

const SAMPLE_INPUT =
  "Summarize: The camera is great but battery life is poor and the screen flickers occasionally.";

const VARIABLE_HINT =
  "Available variables: {{input}}, {{reference}}, {{category}}, {{difficulty}}";

interface PromptFormState {
  id?: number;
  name: string;
  system_prompt: string;
  template: string;
  notes: string;
}

const emptyForm: PromptFormState = {
  name: "New prompt template",
  system_prompt: "You are a helpful assistant. Follow the task exactly and answer clearly.",
  template: "{{input}}",
  notes: "",
};

export default function Prompts() {
  const { data, loading, error, reload } = useAsync(() => listPrompts(), []);
  const [form, setForm] = useState<PromptFormState>(emptyForm);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<string>("");
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    if (form.template) {
      void runPreview(form);
    }
  }, [form.template, form.system_prompt]);

  async function runPreview(state: PromptFormState) {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const result = await previewPrompt({
        template: state.template,
        system_prompt: state.system_prompt,
        sample_input: SAMPLE_INPUT,
        sample_reference: "Good camera, poor battery, occasional screen flicker.",
        sample_category: "summarization",
        sample_difficulty: "easy",
      });
      setPreview(result.rendered_prompt);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : String(err));
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setSaveError(null);
    setSaving(true);
    try {
      if (form.id) {
        await updatePrompt(form.id, {
          name: form.name,
          system_prompt: form.system_prompt,
          template: form.template,
          notes: form.notes,
        });
      } else {
        await createPrompt({
          name: form.name,
          system_prompt: form.system_prompt,
          template: form.template,
          notes: form.notes,
        });
      }
      setForm(emptyForm);
      await reload();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function startEditing(template: PromptTemplate) {
    setForm({
      id: template.id,
      name: template.name,
      system_prompt: template.system_prompt ?? "",
      template: template.template,
      notes: template.notes ?? "",
    });
  }

  async function handleDelete(template: PromptTemplate) {
    if (!confirm(`Delete prompt "${template.name}"?`)) return;
    await deletePrompt(template.id);
    if (form.id === template.id) setForm(emptyForm);
    await reload();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink-900">Prompt templates</h1>
        <p className="mt-1 text-sm text-ink-500">
          Identical prompts across every model — change the wording here to compare iterations fairly.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <Card
            title={form.id ? "Edit prompt" : "New prompt"}
            description={VARIABLE_HINT}
            actions={
              form.id ? (
                <Button variant="ghost" size="sm" onClick={() => setForm(emptyForm)}>
                  Cancel
                </Button>
              ) : undefined
            }
          >
            <form onSubmit={handleSave} className="space-y-4">
              <Input
                label="Name"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                required
              />
              <Textarea
                label="System prompt"
                rows={3}
                value={form.system_prompt}
                onChange={(event) => setForm((prev) => ({ ...prev, system_prompt: event.target.value }))}
              />
              <Textarea
                label="User template"
                rows={8}
                value={form.template}
                onChange={(event) => setForm((prev) => ({ ...prev, template: event.target.value }))}
                required
              />
              <Textarea
                label="Notes"
                rows={3}
                value={form.notes}
                placeholder="Why does this template exist? What is it tuned for?"
                onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              />
              {saveError && <ErrorState message={saveError} />}
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : form.id ? "Save changes" : "Create prompt"}
              </Button>
            </form>
          </Card>
        </div>

        <div className="xl:col-span-2">
          <Card title="Rendered preview" description="Using a built-in sample example.">
            {previewLoading && <LoadingState label="Rendering..." />}
            {previewError && <ErrorState message={previewError} />}
            {!previewLoading && !previewError && (
              <div className="space-y-3">
                {form.system_prompt && (
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-ink-400">System</div>
                    <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-ink-50 px-3 py-2 font-mono text-xs leading-relaxed text-ink-800">
                      {form.system_prompt}
                    </pre>
                  </div>
                )}
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-ink-400">User</div>
                  <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-ink-50 px-3 py-2 font-mono text-xs leading-relaxed text-ink-800">
                    {preview || "—"}
                  </pre>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}

      {data && data.length === 0 && (
        <EmptyState title="No prompt templates yet" description="Save the form above to create one." />
      )}

      {data && data.length > 0 && (
        <Card title="Saved prompts" description={`${data.length} template${data.length === 1 ? "" : "s"}`}>
          <ul className="divide-y divide-ink-100">
            {data.map((template) => (
              <li key={template.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <div className="font-medium text-ink-800">{template.name}</div>
                  <div className="mt-1 text-xs text-ink-500">
                    v{template.version} · {new Date(template.created_at).toLocaleString()}
                  </div>
                  {template.notes && (
                    <p className="mt-2 max-w-2xl text-xs text-ink-500">{template.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">v{template.version}</Badge>
                  <Button variant="secondary" size="sm" onClick={() => startEditing(template)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDelete(template)}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
