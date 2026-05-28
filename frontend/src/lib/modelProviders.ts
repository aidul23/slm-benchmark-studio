/** Known model families → company / org that created the weights. */

export type ModelProviderId =
  | "meta"
  | "google"
  | "mistral"
  | "microsoft"
  | "alibaba"
  | "openai"
  | "anthropic"
  | "deepseek"
  | "ollama";

export interface ModelProviderInfo {
  id: ModelProviderId;
  label: string;
  /** Primary brand color for chart bars (Artificial Analysis–style). */
  color: string;
}

const PROVIDERS: Record<ModelProviderId, ModelProviderInfo> = {
  meta: { id: "meta", label: "Meta", color: "#0866FF" },
  google: { id: "google", label: "Google", color: "#34A853" },
  mistral: { id: "mistral", label: "Mistral AI", color: "#FA5200" },
  microsoft: { id: "microsoft", label: "Microsoft", color: "#0078D4" },
  alibaba: { id: "alibaba", label: "Alibaba", color: "#FF6A00" },
  openai: { id: "openai", label: "OpenAI", color: "#000000" },
  anthropic: { id: "anthropic", label: "Anthropic", color: "#D97757" },
  deepseek: { id: "deepseek", label: "DeepSeek", color: "#4D6BFE" },
  ollama: { id: "ollama", label: "Local (Ollama)", color: "#64748B" },
};

/** Best-effort guess from an Ollama model tag or API model id. */
export function inferModelProvider(modelName: string): ModelProviderInfo {
  const n = modelName.toLowerCase();

  if (/claude|anthropic/.test(n)) return PROVIDERS.anthropic;
  if (/gpt-|chatgpt|openai|^o[134][\-:]/.test(n)) return PROVIDERS.openai;
  if (/gemini|gemma|google\//.test(n)) return PROVIDERS.google;
  if (/llama|codellama|llava/.test(n)) return PROVIDERS.meta;
  if (/qwen|qwq/.test(n)) return PROVIDERS.alibaba;
  if (/mistral|mixtral|codestral|ministral/.test(n)) return PROVIDERS.mistral;
  if (/\bphi[-\d]|phi3|phi4|microsoft\//.test(n)) return PROVIDERS.microsoft;
  if (/deepseek/.test(n)) return PROVIDERS.deepseek;

  return PROVIDERS.ollama;
}

/** Chart styling for a model row — provider color + id for the logo tick. */
export function modelChartStyle(modelName: string): ModelProviderInfo {
  return inferModelProvider(modelName);
}

/** Shorten long Ollama tags for cramped chart axes. */
export function shortModelName(name: string, max = 14): string {
  if (name.length <= max) return name;
  const colon = name.indexOf(":");
  if (colon > 0 && colon < max) return name.slice(0, max - 1) + "…";
  return name.slice(0, max - 1) + "…";
}

export function providerFromJudgeKey(key: string): ModelProviderInfo | null {
  switch (key) {
    case "openai":
      return PROVIDERS.openai;
    case "anthropic":
      return PROVIDERS.anthropic;
    case "gemini":
      return PROVIDERS.google;
    case "ollama":
      return PROVIDERS.ollama;
    default:
      return null;
  }
}
