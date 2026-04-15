import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveMetricColumnKey } from "../lib/client-goals/metric-column";

describe("resolveMetricColumnKey", () => {
  it("maps common aliases", () => {
    assert.equal(resolveMetricColumnKey("conversions"), "ads_conversions");
    assert.equal(resolveMetricColumnKey("cpc"), "ads_average_cpc");
    assert.equal(resolveMetricColumnKey("sessions"), "ga4_sessions");
  });

  it("returns null for unknown columns", () => {
    assert.equal(resolveMetricColumnKey("not_a_real_metric"), null);
    assert.equal(resolveMetricColumnKey(""), null);
  });
});
