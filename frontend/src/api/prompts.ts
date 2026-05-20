import { apiDelete, apiGet, apiPost, apiPut } from "./client";
import type { PromptTemplate } from "../types";

export interface PromptInput {
  name: string;
  template: string;
  system_prompt?: string | null;
  version?: number;
  notes?: string | null;
}

export function listPrompts() {
  return apiGet<PromptTemplate[]>("/api/prompts");
}

export function getPrompt(id: number) {
  return apiGet<PromptTemplate>(`/api/prompts/${id}`);
}

export function createPrompt(payload: PromptInput) {
  return apiPost<PromptTemplate>("/api/prompts", payload);
}

export function updatePrompt(id: number, payload: Partial<PromptInput>) {
  return apiPut<PromptTemplate>(`/api/prompts/${id}`, payload);
}

export function deletePrompt(id: number) {
  return apiDelete<{ ok: boolean }>(`/api/prompts/${id}`);
}

export function previewPrompt(payload: {
  template: string;
  system_prompt?: string | null;
  sample_input: string;
  sample_reference?: string | null;
  sample_category?: string | null;
  sample_difficulty?: string | null;
}) {
  return apiPost<{ system_prompt?: string | null; rendered_prompt: string }>(
    "/api/prompts/preview",
    payload,
  );
}
