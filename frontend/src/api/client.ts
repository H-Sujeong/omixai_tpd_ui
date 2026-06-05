/**
 * Thin fetch wrapper. All endpoints route through Vite's /api proxy in dev.
 */

const BASE = "";

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

export async function apiGet<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const qs = params
    ? "?" + new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== null && v !== "")
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : "";
  const res = await fetch(`${BASE}${path}${qs}`, {
    headers: { Accept: "application/json" },
    credentials: "include",
  });
  if (!res.ok) {
    // Read the body ONCE, then try to parse as JSON. Calling res.json() and
    // then res.text() on failure throws "body stream already read".
    const raw = await res.text();
    let body: unknown;
    try { body = raw ? JSON.parse(raw) : undefined; } catch { body = raw; }
    throw new ApiError(res.status, `${res.status} ${res.statusText}`, body);
  }
  return res.json() as Promise<T>;
}

/** POST a JSON body (auth login/logout etc.); sends the session cookie. */
export async function apiPostJson<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    credentials: "include",
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const raw = await res.text();
    let b: unknown;
    try { b = raw ? JSON.parse(raw) : undefined; } catch { b = raw; }
    throw new ApiError(res.status, `${res.status} ${res.statusText}`, b);
  }
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const qs = params
    ? "?" + new URLSearchParams(
        Object.entries(params)
          .filter(([, v]) => v !== undefined && v !== null && v !== "")
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : "";
  const res = await fetch(`${BASE}${path}${qs}`, {
    method: "POST",
    headers: { Accept: "application/json" },
    credentials: "include",
  });
  if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export function fileUrl(relative: string): string {
  // Backend returns paths like '/api/v1/files/...'. Vite proxies /api in dev.
  return relative;
}
