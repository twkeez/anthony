/** Basecamp mapper is off in production unless `ENABLE_BASECAMP_MAPPER=1` is set (internal dev tool). */
export function isBasecampMapperRouteEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_BASECAMP_MAPPER === "1";
}

export function assertBasecampMapperAllowed(): void {
  if (!isBasecampMapperRouteEnabled()) {
    throw new Error(
      "Basecamp mapper is disabled. Set ENABLE_BASECAMP_MAPPER=1 in production, or use a non-production build.",
    );
  }
}
