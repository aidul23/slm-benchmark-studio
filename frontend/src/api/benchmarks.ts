import { apiGet, apiPost } from "./client";
import type {
  BenchmarkCatalog,
  BenchmarkImportPayload,
  BenchmarkImportResponse,
} from "../types";

export function getBenchmarkCatalog() {
  return apiGet<BenchmarkCatalog>("/api/benchmarks/catalog");
}

export function importBenchmark(payload: BenchmarkImportPayload) {
  return apiPost<BenchmarkImportResponse>("/api/benchmarks/import", payload);
}
