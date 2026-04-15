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

/**
 * Account-wide people directory (`GET /people.json`). Same production gate as the mapper, or set
 * `ENABLE_BASECAMP_DIRECTORY=1` alone if you only want this listing in production.
 */
export function isBasecampPeopleDirectoryEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.ENABLE_BASECAMP_MAPPER === "1" ||
    process.env.ENABLE_BASECAMP_DIRECTORY === "1"
  );
}
