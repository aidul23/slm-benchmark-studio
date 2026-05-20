import { Link, useParams } from "react-router-dom";

import { getDataset } from "../api/datasets";
import { Badge, Card, EmptyState, ErrorState, LoadingState } from "../components/ui";
import { useAsync } from "../hooks/useAsync";

export default function DatasetDetail() {
  const params = useParams();
  const id = Number(params.id);
  const { data, loading, error } = useAsync(() => getDataset(id), [id]);

  return (
    <div className="space-y-6">
      <div>
        <Link to="/datasets" className="text-sm text-accent-600 hover:text-accent-700">
          ← All datasets
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-ink-900">{data?.name ?? "Dataset"}</h1>
        {data?.description && <p className="mt-1 text-sm text-ink-500">{data.description}</p>}
      </div>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}

      {data && data.examples.length === 0 && (
        <EmptyState
          title="No examples"
          description="This dataset is empty. Upload a new JSONL file to populate it."
        />
      )}

      {data && data.examples.length > 0 && (
        <Card
          title={`${data.examples.length} examples`}
          description="Showing input, reference answer, and metadata."
        >
          <div className="space-y-4">
            {data.examples.map((example) => (
              <div key={example.id} className="rounded-xl border border-ink-100 bg-ink-50 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-ink-500">
                    {example.external_id ?? `#${example.id}`}
                  </span>
                  {example.category && <Badge tone="info">{example.category}</Badge>}
                  {example.difficulty && <Badge tone="warning">{example.difficulty}</Badge>}
                </div>
                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-ink-400">Input</div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink-800">{example.input}</p>
                  </div>
                  <div>
                    <div className="text-xs font-medium uppercase tracking-wide text-ink-400">Reference</div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-ink-800">
                      {example.reference ?? <span className="text-ink-400">—</span>}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
