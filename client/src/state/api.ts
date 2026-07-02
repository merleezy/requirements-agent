/*
 * Minimal fetch wrapper for the Express backend. All client requests go
 * through here so the session header and the server's uniform error shape
 * ({ error: { code, message } }) are handled in one place.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface ApiOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  sessionId?: string;
  /* The user's OpenRouter key, attached per request only (spec: key handling).
   * It travels in a header to be forwarded upstream and is never stored
   * server-side. */
  apiKey?: string;
  body?: unknown;
  signal?: AbortSignal;
}

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.sessionId) headers["x-session-id"] = options.sessionId;
  if (options.apiKey) headers["x-openrouter-key"] = options.apiKey;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const code = data?.error?.code ?? "UNKNOWN";
    const message = data?.error?.message ?? `Request failed (${res.status})`;
    throw new ApiError(res.status, code, message);
  }
  return data as T;
}
