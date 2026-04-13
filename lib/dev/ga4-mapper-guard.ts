/** GA4 Mapper is off in production unless `ENABLE_GA4_MAPPER=1` is set (internal dev tool). */
export function isGa4MapperRouteEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_GA4_MAPPER === "1";
}

export function assertGa4MapperAllowed(): void {
  if (!isGa4MapperRouteEnabled()) {
    throw new Error("GA4 Mapper is disabled. Set ENABLE_GA4_MAPPER=1 in production, or use a non-production build.");
  }
}
