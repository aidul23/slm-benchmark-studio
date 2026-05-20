import { apiDelete, apiGet, apiUpload } from "./client";
import type { Dataset, DatasetDetail, DatasetUploadResponse } from "../types";

export function listDatasets() {
  return apiGet<Dataset[]>("/api/datasets");
}

export function getDataset(id: number) {
  return apiGet<DatasetDetail>(`/api/datasets/${id}`);
}

export function deleteDataset(id: number) {
  return apiDelete<{ ok: boolean }>(`/api/datasets/${id}`);
}

export function uploadDataset(file: File, name?: string, description?: string) {
  const formData = new FormData();
  formData.append("file", file);
  if (name) formData.append("name", name);
  if (description) formData.append("description", description);
  return apiUpload<DatasetUploadResponse>("/api/datasets/upload", formData);
}
