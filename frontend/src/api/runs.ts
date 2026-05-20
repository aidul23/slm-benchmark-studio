import { apiDelete, apiGet, apiPatch, apiPost, apiUrl } from "./client";
import type {
  BenchmarkRun,
  ResultRow,
  RunCreatePayload,
  RunSummary,
} from "../types";

export function listRuns() {
  return apiGet<BenchmarkRun[]>("/api/runs");
}

export function getRun(id: number) {
  return apiGet<BenchmarkRun>(`/api/runs/${id}`);
}

export function createRun(payload: RunCreatePayload) {
  return apiPost<BenchmarkRun>("/api/runs", payload);
}

export function startRun(id: number) {
  return apiPost<BenchmarkRun>(`/api/runs/${id}/start`);
}

export function deleteRun(id: number) {
  return apiDelete<{ ok: boolean }>(`/api/runs/${id}`);
}

export function getResults(id: number) {
  return apiGet<ResultRow[]>(`/api/runs/${id}/results`);
}

export function getSummary(id: number) {
  return apiGet<RunSummary>(`/api/runs/${id}/summary`);
}

export function updateRun(id: number, payload: { notes?: string | null }) {
  return apiPatch<BenchmarkRun>(`/api/runs/${id}`, payload);
}

export function submitHumanReview(
  runId: number,
  outputId: number,
  payload: { human_score?: number | null; human_notes?: string | null; accepted_judge_score?: boolean | null },
) {
  return apiPost<{ ok: boolean }>(`/api/runs/${runId}/outputs/${outputId}/review`, payload);
}

export function exportRunCsvUrl(id: number): string {
  return apiUrl(`/api/runs/${id}/export.csv`);
}
