import { getWorkshopHeaders } from "../lib/participant";

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

function buildHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { ...getWorkshopHeaders(), ...extra };
}

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

async function handle<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text();
    let payload: unknown = text;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        // keep raw text
      }
    }
    const detail =
      (payload as { detail?: unknown })?.detail ??
      (typeof payload === "string" ? payload : response.statusText);
    const message = typeof detail === "string" ? detail : JSON.stringify(detail);
    throw new ApiError(message || `Request failed (${response.status})`, response.status, payload);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }
  return (await response.text()) as unknown as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "GET",
    headers: buildHeaders({ Accept: "application/json" }),
  });
  return handle<T>(response);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: buildHeaders({
      "Content-Type": "application/json",
      Accept: "application/json",
    }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handle<T>(response);
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "PUT",
    headers: buildHeaders({
      "Content-Type": "application/json",
      Accept: "application/json",
    }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handle<T>(response);
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "PATCH",
    headers: buildHeaders({
      "Content-Type": "application/json",
      Accept: "application/json",
    }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return handle<T>(response);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "DELETE",
    headers: buildHeaders(),
  });
  return handle<T>(response);
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: buildHeaders(),
    body: formData,
  });
  return handle<T>(response);
}

export function apiUrl(path: string): string {
  return `${BASE_URL}${path}`;
}
