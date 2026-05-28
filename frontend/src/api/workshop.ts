import { apiGet } from "./client";

export interface WorkshopStatus {
  workshop_mode: boolean;
}

export function getWorkshopStatus() {
  return apiGet<WorkshopStatus>("/api/workshop/status");
}
