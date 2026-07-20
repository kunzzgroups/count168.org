import test from "node:test";
import assert from "node:assert/strict";

import {
  bindSummaryFormulaContext,
  clearSummaryFormulaContext,
} from "../lib/summaryFormulaContext.js";
import { parseReferenceFormula } from "./summaryFormulaReference.js";

function dataCell(value) {
  return { type: "data", value };
}

function headerCell(value) {
  return { type: "header", value };
}

/**
 * Build a minimal captured table:
 *   row A = AW07 with cols 3 (-227.95) and 14 (-15.60)
 *   row B = AW9966 with col 3 (-718.39)
 */
function buildTable() {
  const aw07 = [
    headerCell("A"),
    dataCell("AW07"),
    dataCell("0"), // display col 2 / data col 1
    dataCell("-227.95"), // display col 3 / data col 2
  ];
  // Pad so display column 14 exists (data column index 13 → row slot 14)
  while (aw07.length < 15) {
    aw07.push(dataCell("0"));
  }
  aw07[14] = dataCell("-15.60"); // display col 14

  const aw9966 = [
    headerCell("B"),
    dataCell("AW9966"),
    dataCell("0"),
    dataCell("-718.39"), // display col 3
  ];

  return { rows: [aw07, aw9966] };
}

test("parseReferenceFormula keeps $N indices valid after [other,col] expansion", () => {
  bindSummaryFormulaContext({ tableData: buildTable() });
  try {
    const formula = "$14-[AW9966,3]/$3";
    const expanded = parseReferenceFormula(formula, "AW07", "", 0);
    assert.equal(expanded, "(-15.60)-(-718.39)/(-227.95)");
    assert.equal(expanded.includes("$-"), false);
  } finally {
    clearSummaryFormulaContext();
  }
});

test("parseReferenceFormula handles other-row ref before own-row $N without slash", () => {
  bindSummaryFormulaContext({ tableData: buildTable() });
  try {
    const formula = "$14-[AW9966,3]$3";
    const expanded = parseReferenceFormula(formula, "AW07", "", 0);
    assert.equal(expanded, "(-15.60)-(-718.39)(-227.95)");
    assert.equal(expanded.includes("$"), false);
  } finally {
    clearSummaryFormulaContext();
  }
});
