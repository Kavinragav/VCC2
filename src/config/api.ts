/// <reference types="vite/client" />

const configuredBaseUrl = import.meta.env?.VITE_API_BASE_URL;

/**
 * Determines whether the current browser origin already hosts the Express backend (`server.ts`).
 * - localhost / 127.0.0.1 (local development & preview)
 * - *.run.app (AI Studio Dev & Shared App preview containers)
 * - *.onrender.com (Render full-stack service serving both dist/ and /api/*)
 */
function isSameOriginBackendHost(): boolean {
  if (typeof window === "undefined" || !window.location) {
    return false;
  }
  const host = window.location.hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host.endsWith(".run.app") ||
    host.endsWith(".onrender.com")
  );
}

export const API_BASE_URL: string = (() => {
  if (isSameOriginBackendHost()) {
    return "";
  }
  if (typeof configuredBaseUrl === "string" && configuredBaseUrl.trim() !== "") {
    return configuredBaseUrl.trim().replace(/\/+$/, "");
  }
  return import.meta.env?.PROD ? "https://vcc2.onrender.com" : "";
})();

export function buildApiUrl(path: string): string {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

/**
 * Safely parses a Fetch Response as JSON without throwing SyntaxError on HTML 404/502 pages.
 */
export async function safeResponseJson<T = any>(
  res: Response
): Promise<T> {
  const text = await res.text();
  if (!text) {
    return {} as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return {
      success: false,
      message:
        res.status === 404
          ? `Backend endpoint not found (HTTP 404 at ${res.url || "server"}). Please ensure the latest backend code is deployed to Render.`
          : `Unexpected server response (HTTP ${res.status}).`,
      rawText: text.slice(0, 200),
    } as unknown as T;
  }
}

/**
 * Resilient fetch wrapper that calls buildApiUrl(path) and automatically falls back
 * to same-origin `/api/...` (or https://vcc2.onrender.com) if the primary URL fails or 404s.
 */
export async function apiFetch(
  path: string,
  init?: RequestInit
): Promise<Response> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const primaryUrl = buildApiUrl(normalizedPath);

  try {
    const res = await fetch(primaryUrl, init);
    if (res.status === 404 && primaryUrl !== normalizedPath) {
      // Try same-origin fallback in case this host serves /api/* directly
      try {
        const fallbackRes = await fetch(normalizedPath, init);
        if (fallbackRes.status !== 404) {
          return fallbackRes;
        }
      } catch {
        // Ignore fallback error and return original response
      }
    }
    return res;
  } catch (primaryErr) {
    if (primaryUrl !== normalizedPath) {
      return fetch(normalizedPath, init);
    }
    throw primaryErr;
  }
}
