import { apiGet } from "./client";
import type { InsightsOverview } from "../types";

export function getInsightsOverview() {
  return apiGet<InsightsOverview>("/api/insights/overview");
}
