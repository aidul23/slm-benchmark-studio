import { useRef, useState } from "react";
import { Link } from "react-router-dom";

import { deleteDataset, listDatasets, uploadDataset } from "../api/datasets";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
} from "../components/ui";
import { useAsync } from "../hooks/useAsync";

export default function Datasets() {
  const { data, loading, error, reload } = useAsync(() => listDatasets(), []);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function handleUpload(event: React.FormEvent) {
    event.preventDefault();
    setUploadError(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setUploadError("Choose a .jsonl file to upload.");
      return;
    }
    setUploading(true);
    try {
      await uploadDataset(file, name || undefined, description || undefined);
      setName("");
      setDescription("");
      if (fileRef.current) fileRef.current.value = "";
      await reload();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Delete this dataset and all of its examples?")) return;
    await deleteDataset(id);
    await reload();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Datasets</h1>
          <p className="mt-1 text-sm text-ink-500">
            Upload representative JSONL data and curate examples for benchmarking.
          </p>
        </div>
      </div>

      <Card title="Upload JSONL" description="Each line must be a JSON object with at least an 'input' field.">
        <form onSubmit={handleUpload} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Input
            label="Name (optional)"
            placeholder="customer-support-eval"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <Input
            label="Description (optional)"
            placeholder="Mixed sentiment + summarization tasks"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <div className="md:col-span-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium text-ink-700">JSONL file</span>
              <input
                ref={fileRef}
                type="file"
                accept=".jsonl,application/json,text/plain"
                className="block w-full cursor-pointer rounded-lg border border-dashed border-ink-300 bg-white px-3 py-6 text-sm text-ink-600 file:mr-4 file:rounded-md file:border-0 file:bg-accent-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-accent-700"
              />
            </label>
          </div>
          {uploadError && <div className="md:col-span-2"><ErrorState message={uploadError} /></div>}
          <div className="md:col-span-2">
            <Button type="submit" disabled={uploading}>
              {uploading ? "Uploading..." : "Upload dataset"}
            </Button>
          </div>
        </form>
      </Card>

      {loading && <LoadingState />}
      {error && <ErrorState message={error} />}

      {data && data.length === 0 && (
        <EmptyState
          title="No datasets yet"
          description="Upload a JSONL file above to create your first benchmark dataset."
        />
      )}

      {data && data.length > 0 && (
        <Card title="Your datasets" description={`${data.length} dataset${data.length === 1 ? "" : "s"} loaded`}>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-ink-400">
              <tr>
                <th className="px-2 py-2">Name</th>
                <th className="px-2 py-2">Examples</th>
                <th className="px-2 py-2">Created</th>
                <th className="px-2 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {data.map((dataset) => (
                <tr key={dataset.id}>
                  <td className="px-2 py-3">
                    <Link to={`/datasets/${dataset.id}`} className="font-medium text-ink-800 hover:text-accent-700">
                      {dataset.name}
                    </Link>
                    {dataset.description && (
                      <div className="text-xs text-ink-500">{dataset.description}</div>
                    )}
                  </td>
                  <td className="px-2 py-3">
                    <Badge tone="info">{dataset.example_count}</Badge>
                  </td>
                  <td className="px-2 py-3 text-xs text-ink-500">
                    {new Date(dataset.created_at).toLocaleString()}
                  </td>
                  <td className="px-2 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => handleDelete(dataset.id)}>
                      Delete
                    </Button>
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
