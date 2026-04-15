import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseReportBlocksFromJson } from "../lib/data/reports";

describe("parseReportBlocksFromJson", () => {
  it("parses valid blocks", () => {
    const blocks = parseReportBlocksFromJson([
      { id: "a", type: "summary", title: "T", content: "Body" },
    ]);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0]?.id, "a");
    assert.equal(blocks[0]?.type, "summary");
  });

  it("drops invalid rows", () => {
    const blocks = parseReportBlocksFromJson([
      { id: "", type: "summary", title: "x", content: "" },
      null,
      { id: "ok", type: "ads", title: "Ads", content: "c" },
    ]);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0]?.id, "ok");
  });
});
