import { apiGet } from "./client";
import type { OllamaModelsResponse } from "../types";

export function listOllamaModels() {
  return apiGet<OllamaModelsResponse>("/api/ollama/models");
}

export function getOllamaHealth() {
  return apiGet<{ available: boolean; base_url: string }>("/api/ollama/health");
}
