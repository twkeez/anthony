import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { readGa4ReportMetricTotals } from "../lib/google/ga4";

describe("readGa4ReportMetricTotals", () => {
  it("prefers totals[0] when present", () => {
    const v = readGa4ReportMetricTotals({
      totals: [{ metricValues: [{ value: "12" }, { value: "3.5" }] }],
      rows: [{ metricValues: [{ value: "99" }] }],
    });
    assert.deepEqual(v, [12, 3.5]);
  });

  it("falls back to rows[0] when totals empty", () => {
    const v = readGa4ReportMetricTotals({
      rows: [{ metricValues: [{ value: "100" }, { value: "0" }] }],
    });
    assert.deepEqual(v, [100, 0]);
  });

  it("returns empty array when no metrics", () => {
    assert.deepEqual(readGa4ReportMetricTotals({}), []);
  });
});
