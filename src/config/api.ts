/// <reference types="vite/client" />

const configuredBaseUrl = import.meta.env?.VITE_API_BASE_URL;

export const API_BASE_URL: string =
  typeof configuredBaseUrl === "string" && configuredBaseUrl.trim() !== ""
    ? configuredBaseUrl.trim().replace(/\/+$/, "")
    : import.meta.env?.PROD
    ? "https://vcc2.onrender.com"
    : "";

export function buildApiUrl(path: string): string {
  if (!path) return path;
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}
