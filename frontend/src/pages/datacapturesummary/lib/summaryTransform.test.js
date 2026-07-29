import test from "node:test";
import assert from "node:assert/strict";

import {
  applyTextTransformations,
  applyTransformationsToTableData,
} from "./summaryTransform.js";

test("remove word does not carve short codes out of longer product ids", () => {
  assert.equal(applyTextTransformations("XX1234", "XX123,XX1234", "", ""), "");
  assert.equal(applyTextTransformations("XX1235", "XX123,XX1234", "", ""), "XX1235");
  assert.equal(applyTextTransformations("XX123", "XX123,XX1234", "", ""), "");
  assert.equal(applyTextTransformations("AAAA", "XX123,XX1234", "", ""), "AAAA");
});

test("remove word clears starred product codes without leaving digit leftovers", () => {
  assert.equal(applyTextTransformations("*XX123", "XX123,XX1234", "", ""), "*");
  assert.equal(applyTextTransformations("*XX1234", "XX123,XX1234", "", ""), "*");
  assert.equal(applyTextTransformations("*XX1235", "XX123,XX1234", "", ""), "*XX1235");
});

test("remove word still strips whole English tokens inside a phrase", () => {
  assert.equal(applyTextTransformations("PLAYER FREE BET", "FREE,BONUS", "", ""), "PLAYER  BET");
});

test("remove word still strips Chinese tokens inside a Chinese phrase", () => {
  assert.equal(applyTextTransformations("玩家免费投注", "免费", "", ""), "玩家投注");
});

test("remove word strips Excel apostrophe chips before matching", () => {
  assert.equal(applyTextTransformations("XX123", "'XX123,'XX1234", "", ""), "");
  assert.equal(applyTextTransformations("XX1235", "'XX123,'XX1234", "", ""), "XX1235");
});

test("table transform matches screenshot regression (AAAA kept, short codes removed, XX1235 kept)", () => {
  const tableData = {
    rows: ["AAAA", "XX123", "XX1234", "XX1235"].map((value) => [{ type: "data", value }]),
  };
  const out = applyTransformationsToTableData(tableData, "XX123,XX1234", "", "");
  assert.deepEqual(
    out.rows.map((row) => row[0].value),
    ["AAAA", "", "", "XX1235"],
  );
});
