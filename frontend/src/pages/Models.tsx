import { listOllamaModels } from "../api/models";
import ModelLabel from "../components/ModelLabel";
import { Badge, Card, EmptyState, ErrorState, LoadingState } from "../components/ui";
import { useAsync } from "../hooks/useAsync";

function formatSize(bytes?: number | null): string {
  if (!bytes) return "—";
  const gb = bytes / 1024 ** 3;
  return `${gb.toFixed(2)} GB`;
}

export default function Models() {
  const { data, loading, error, reload } = useAsync(() => listOllamaModels(), []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Models</h1>
          <p className="mt-1 text-sm text-ink-500">
            Local models served by Ollama at <span className="font-mono">localhost:11434</span>.
          </p>
        </div>
        <button
          onClick={() => void reload()}
          className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-100"
        >
          Refresh
        </button>
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}

      {data && !data.available && (
        <Card title="Ollama not reachable" description="The backend could not reach the local Ollama server.">
          <p className="text-sm text-ink-600">
            Make sure Ollama is installed and running. Try one of the following:
          </p>
          <pre className="mt-3 rounded-lg bg-ink-900 px-4 py-3 font-mono text-xs leading-relaxed text-ink-100">
{`ollama serve

# in another terminal, pull a model:
ollama pull llama3.2:3b
ollama pull qwen2.5:3b`}
          </pre>
          {data.error && <p className="mt-3 text-xs text-red-600">{data.error}</p>}
        </Card>
      )}

      {data && data.available && data.models.length === 0 && (
        <EmptyState
          title="No models installed"
          description="Run `ollama pull <model>` to add a local model, then refresh."
        />
      )}

      {data && data.available && data.models.length > 0 && (
        <Card title={`${data.models.length} local model${data.models.length === 1 ? "" : "s"}`}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400">
              <tr>
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Size</th>
                <th className="px-2 py-2">Modified</th>
                <th className="px-2 py-2">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {data.models.map((model) => {
                const details = (model.details ?? {}) as Record<string, unknown>;
                return (
                  <tr key={model.name}>
                    <td className="px-2 py-3">
                      <ModelLabel name={model.name} align="start" />
                    </td>
                    <td className="px-2 py-3 text-ink-600">{formatSize(model.size)}</td>
                    <td className="px-2 py-3 text-xs text-ink-500">
                      {model.modified_at ? new Date(model.modified_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-2 py-3 text-xs text-ink-500">
                      <div className="flex flex-wrap gap-1">
                        {details.family && <Badge tone="info">{String(details.family)}</Badge>}
                        {details.parameter_size && (
                          <Badge tone="neutral">{String(details.parameter_size)}</Badge>
                        )}
                        {details.quantization_level && (
                          <Badge tone="warning">{String(details.quantization_level)}</Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
