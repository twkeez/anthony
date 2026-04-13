/**
 * True when Search Console / Webmasters API rejected the call for access reasons (common in bulk sync).
 */
export function isSearchConsoleAccessDenied(e: unknown): boolean {
  if (!e || typeof e !== "object") return false;
  const o = e as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  if (n(o.code) === 403 || n(o.status) === 403) return true;

  const cause = o.cause as Record<string, unknown> | undefined;
  if (cause) {
    if (n(cause.code) === 403) return true;
    if (String(cause.status ?? "").toLowerCase() === "forbidden") return true;
  }

  const msg = `${String(o.message ?? "")} ${String(cause?.message ?? "")}`.toLowerCase();
  return (
    msg.includes("sufficient permission") ||
    msg.includes("permission for site") ||
    msg.includes("user does not have")
  );
}
