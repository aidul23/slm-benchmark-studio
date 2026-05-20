export type RunStatus = "pending" | "running" | "completed" | "failed";

export interface OllamaModel {
  name: string;
  size?: number | null;
  modified_at?: string | null;
  details?: Record<string, unknown> | null;
}

export interface OllamaModelsResponse {
  available: boolean;
  models: OllamaModel[];
  error?: string | null;
}

export interface Dataset {
  id: number;
  name: string;
  description?: string | null;
  created_at: string;
  example_count: number;
}

export interface DatasetExample {
  id: number;
  dataset_id: number;
  external_id?: string | null;
  input: string;
  reference?: string | null;
  category?: string | null;
  difficulty?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface DatasetDetail extends Dataset {
  examples: DatasetExample[];
}

export interface DatasetUploadResponse {
  dataset: Dataset;
  parsed: number;
  skipped: number;
  errors: string[];
}

export interface PromptTemplate {
  id: number;
  name: string;
  template: string;
  system_prompt?: string | null;
  version: number;
  created_at: string;
  notes?: string | null;
}

export interface BenchmarkRun {
  id: number;
  name: string;
  dataset_id: number;
  prompt_template_id: number;
  selected_models: string[];
  judge_model?: string | null;
  status: RunStatus;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
  progress_total: number;
  progress_done: number;
  current_phase?: string | null;
  current_activity?: string | null;
  export_path?: string | null;
  error?: string | null;
  config?: Record<string, unknown> | null;
  notes?: string | null;
}

export interface JudgeScore {
  judge_model?: string | null;
  correctness?: number | null;
  factuality?: number | null;
  completeness?: number | null;
  conciseness?: number | null;
  instruction_following?: number | null;
  overall?: number | null;
  reason?: string | null;
  parse_error?: string | null;
  human_score?: number | null;
  human_notes?: string | null;
  accepted_judge_score?: boolean | null;
}

export interface ResultRow {
  output_id: number;
  run_id: number;
  example_id: number;
  external_id?: string | null;
  model_name: string;
  input: string;
  reference?: string | null;
  output?: string | null;
  rendered_prompt?: string | null;
  latency_ms?: number | null;
  tokens_per_second?: number | null;
  prompt_eval_count?: number | null;
  eval_count?: number | null;
  category?: string | null;
  difficulty?: string | null;
  error?: string | null;
  judge?: JudgeScore | null;
}

export interface ModelSummary {
  model_name: string;
  count: number;
  error_count: number;
  parse_error_count: number;
  avg_latency_ms?: number | null;
  p50_latency_ms?: number | null;
  p95_latency_ms?: number | null;
  avg_tokens_per_second?: number | null;
  avg_correctness?: number | null;
  avg_factuality?: number | null;
  avg_completeness?: number | null;
  avg_conciseness?: number | null;
  avg_instruction_following?: number | null;
  avg_overall?: number | null;
}

export interface RunSummary {
  run_id: number;
  total_examples: number;
  total_outputs: number;
  by_model: ModelSummary[];
  by_category: Record<string, { count: number; avg_overall: number; avg_latency_ms: number }>;
  by_difficulty: Record<string, { count: number; avg_overall: number; avg_latency_ms: number }>;
  worst_examples: ResultRow[];
}

export interface InsightsOverview {
  total_datasets: number;
  total_runs: number;
  total_outputs: number;
  best_model_by_overall?: { model_name: string; avg_overall: number | null } | null;
  fastest_model_by_latency?: { model_name: string; avg_latency_ms: number | null } | null;
  recent_runs: Array<{
    id: number;
    name: string;
    status: RunStatus;
    created_at: string | null;
    progress_done: number;
    progress_total: number;
  }>;
  by_model: ModelSummary[];
}

export interface RunCreatePayload {
  name: string;
  dataset_id: number;
  prompt_template_id: number;
  selected_models: string[];
  judge_model?: string | null;
  temperature: number;
  max_tokens: number;
  repeats: number;
  notes?: string | null;
}
