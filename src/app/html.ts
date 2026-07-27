/** Escape helpers for safe HTML string interpolation. */

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function escapeAttr(value: string): string {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
