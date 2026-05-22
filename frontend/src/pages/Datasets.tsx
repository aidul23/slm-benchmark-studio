import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { getBenchmarkCatalog, importBenchmark } from "../api/benchmarks";
import { deleteDataset, listDatasets, uploadDataset } from "../api/datasets";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Select,
} from "../components/ui";
import { useAsync } from "../hooks/useAsync";
import type { BenchmarkImportResponse, BenchmarkInfo } from "../types";

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

      <BenchmarkImportCard onImported={reload} />

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

function BenchmarkImportCard({ onImported }: { onImported: () => Promise<void> | void }) {
  const catalog = useAsync(() => getBenchmarkCatalog(), []);
  const benchmarks = useMemo(() => catalog.data?.benchmarks ?? [], [catalog.data]);

  const [benchmarkKey, setBenchmarkKey] = useState<string>("");
  const [subset, setSubset] = useState<string>("");
  const [split, setSplit] = useState<string>("");
  const [limit, setLimit] = useState<number>(100);
  const [shuffle, setShuffle] = useState<boolean>(true);
  const [name, setName] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [result, setResult] = useState<BenchmarkImportResponse | null>(null);

  const selected: BenchmarkInfo | undefined = useMemo(
    () => benchmarks.find((b) => b.key === benchmarkKey),
    [benchmarks, benchmarkKey],
  );

  // Pick a sensible default benchmark as soon as the catalog loads.
  useEffect(() => {
    if (benchmarkKey || benchmarks.length === 0) return;
    const first = benchmarks[0];
    setBenchmarkKey(first.key);
    setSubset(first.default_subset ?? first.subsets[0]?.key ?? "");
    setSplit(first.default_split);
    setLimit(first.suggested_limit);
  }, [benchmarks, benchmarkKey]);

  // When the user changes benchmark, reset subset/split/limit to its defaults.
  useEffect(() => {
    if (!selected) return;
    setSubset(selected.default_subset ?? selected.subsets[0]?.key ?? "");
    setSplit(selected.default_split);
    setLimit((prev) => Math.min(prev || selected.suggested_limit, selected.max_limit));
  }, [selected]);

  async function handleImport(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setImportError(null);
    setImporting(true);
    try {
      const safeLimit = Math.max(1, Math.min(Number(limit) || selected.suggested_limit, selected.max_limit));
      const response = await importBenchmark({
        benchmark: selected.key,
        subset: subset || null,
        split: split || null,
        limit: safeLimit,
        shuffle,
        name: name || null,
      });
      setResult(response);
      await onImported();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  return (
    <Card
      title="Import a standard benchmark"
      description="Pull MMLU or HellaSwag straight from HuggingFace and turn it into a scoreable dataset."
    >
      {catalog.loading && <LoadingState label="Loading benchmark catalog..." />}
      {catalog.error && <ErrorState message={catalog.error} />}

      {benchmarks.length > 0 && (
        <form onSubmit={handleImport} className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Select
            label="Benchmark"
            value={benchmarkKey}
            onChange={(event) => setBenchmarkKey(event.target.value)}
          >
            {benchmarks.map((bm) => (
              <option key={bm.key} value={bm.key}>
                {bm.name}
              </option>
            ))}
          </Select>

          <Select
            label="Subset"
            value={subset}
            onChange={(event) => setSubset(event.target.value)}
            hint={selected?.subsets.find((s) => s.key === subset)?.description ?? undefined}
            disabled={!selected || selected.subsets.length === 0}
          >
            {(selected?.subsets ?? []).map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </Select>

          <Select
            label="Split"
            value={split}
            onChange={(event) => setSplit(event.target.value)}
            disabled={!selected}
          >
            {(selected?.splits ?? []).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>

          <Input
            label={`Number of examples (max ${selected?.max_limit ?? 1000})`}
            type="number"
            min={1}
            max={selected?.max_limit ?? 1000}
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value || 0))}
            hint={selected ? `Suggested: ${selected.suggested_limit}` : undefined}
          />

          <Input
            label="Dataset name (optional)"
            placeholder="auto-generated, e.g. mmlu-all-test-n100"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />

          <label className="flex items-center gap-2 self-end text-sm text-ink-700">
            <input
              type="checkbox"
              checked={shuffle}
              onChange={(event) => setShuffle(event.target.checked)}
              className="h-4 w-4 rounded border-ink-300"
            />
            Shuffle (sample a varied subset)
          </label>

          {selected && (
            <div className="md:col-span-2 rounded-lg border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-800">
              {selected.description}
              {selected.docs_url && (
                <>
                  {" "}
                  <a
                    href={selected.docs_url}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium underline"
                  >
                    Source ↗
                  </a>
                </>
              )}
            </div>
          )}

          {importError && <div className="md:col-span-2"><ErrorState message={importError} /></div>}

          {result && (
            <div className="md:col-span-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              <div className="font-medium">
                Imported {result.imported} example{result.imported === 1 ? "" : "s"} into{" "}
                <Link
                  to={`/datasets/${result.dataset.id}`}
                  className="underline"
                >
                  {result.dataset.name}
                </Link>
                .
              </div>
              {result.warnings.length > 0 && (
                <ul className="mt-1 list-disc pl-4 text-emerald-700">
                  {result.warnings.slice(0, 5).map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="md:col-span-2 flex items-center justify-between gap-3">
            <p className="text-xs text-ink-500">
              Imports run in generation mode (Ollama doesn't expose log-likelihoods). Pair with the
              "MCQ benchmark" prompt for best results.
            </p>
            <Button type="submit" disabled={!selected || importing}>
              {importing ? "Importing..." : "Import benchmark"}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
