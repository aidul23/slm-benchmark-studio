const PARTICIPANT_STORAGE_KEY = "slm-workshop-participant";
const ADMIN_STORAGE_KEY = "slm-workshop-admin-key";

export function normalizeParticipantId(raw: string): string {
  let value = raw.trim().toLowerCase();
  value = value.replace(/[^a-z0-9_-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (value.length < 2 || value.length > 32) {
    throw new Error("Name must be 2–32 characters (letters, numbers, hyphen, underscore).");
  }
  return value;
}

export function getStoredParticipantId(): string | null {
  return localStorage.getItem(PARTICIPANT_STORAGE_KEY);
}

export function setStoredParticipantId(id: string): void {
  localStorage.setItem(PARTICIPANT_STORAGE_KEY, id);
}

export function clearStoredParticipantId(): void {
  localStorage.removeItem(PARTICIPANT_STORAGE_KEY);
}

export function getStoredAdminKey(): string | null {
  return sessionStorage.getItem(ADMIN_STORAGE_KEY);
}

export function setStoredAdminKey(key: string | null): void {
  if (key && key.trim()) {
    sessionStorage.setItem(ADMIN_STORAGE_KEY, key.trim());
  } else {
    sessionStorage.removeItem(ADMIN_STORAGE_KEY);
  }
}

export function getWorkshopHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const participantId = getStoredParticipantId();
  const adminKey = getStoredAdminKey();
  if (participantId) {
    headers["X-Participant-Id"] = participantId;
  }
  if (adminKey) {
    headers["X-Workshop-Admin-Key"] = adminKey;
  }
  return headers;
}
