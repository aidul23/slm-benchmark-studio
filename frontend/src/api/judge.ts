import { apiGet } from "./client";
import type { JudgeDefaults } from "../types";

/** Fetch the rubric catalog + default prompts. Cached on first load. */
export function getJudgeDefaults() {
  return apiGet<JudgeDefaults>("/api/judge/defaults");
}
