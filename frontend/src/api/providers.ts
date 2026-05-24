import { apiGet, apiPost } from "./client";
import type { JudgeProviderInfo, ProviderListModelsResponse } from "../types";

export function listProviders() {
  return apiGet<JudgeProviderInfo[]>("/api/providers");
}

/**
 * Validate the API key and fetch the list of models the user can run as a judge.
 *
 * The key is sent in the request body (over localhost) and is never stored
 * server-side. Errors from the upstream provider are surfaced as `ApiError`
 * with the structured `{code, message}` envelope in `error.payload.detail`.
 */
export function listProviderModels(provider: string, apiKey: string | null | undefined) {
  return apiPost<ProviderListModelsResponse>(`/api/providers/${provider}/models`, {
    api_key: apiKey ?? null,
  });
}
