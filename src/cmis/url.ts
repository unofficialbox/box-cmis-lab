/** URL and query helpers for CMIS Browser Binding. */

/**
 * Map a configured service URL to a browser-fetchable URL.
 * Local connector hosts are rewritten to the Vite `/cmis` proxy to avoid CORS.
 */
export function resolveServiceUrlForBrowser(serviceUrl: string): string {
  const trimmed = serviceUrl.trim().replace(/\/+$/, "") || "/cmis";
  if (trimmed.startsWith("/")) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const localHost = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (localHost && (url.port === "8080" || url.port === "")) {
      const path = url.pathname.replace(/\/+$/, "") || "/cmis";
      return path;
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

export function joinUrl(base: string, ...segments: string[]): string {
  const trimmedBase = base.replace(/\/+$/, "");
  const parts = segments
    .filter((s) => s.length > 0)
    .map((s) => s.replace(/^\/+|\/+$/g, ""));
  if (parts.length === 0) {
    return trimmedBase;
  }
  return `${trimmedBase}/${parts.join("/")}`;
}

export function buildQueryString(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export function encodeObjectIdPath(objectId: string): string {
  return encodeURIComponent(objectId);
}
