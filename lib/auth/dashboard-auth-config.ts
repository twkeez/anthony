/** HttpOnly cookie set after successful `/api/auth/login`. */
export const DASHBOARD_SESSION_COOKIE = "ap_dashboard";

/** When both are set (secret min length), dashboard + API routes require a valid session or cron bearer. */
export function dashboardAuthEnabled(): boolean {
  const password = process.env.DASHBOARD_PASSWORD?.trim() ?? "";
  const secret = process.env.DASHBOARD_SESSION_SECRET?.trim() ?? "";
  return password.length > 0 && secret.length >= 16;
}
