import test from "node:test";
import assert from "node:assert/strict";

import { syncEditFormSourcePercent } from "./formulaMaintenanceLogic.js";

const editForm = {
  source_percent: "1",
  formula: "123.456789 + 234.567892",
};

test("source edit preserves decimal intermediate states and trailing zeroes", () => {
  const withDecimalPoint = syncEditFormSourcePercent(editForm, "0.");
  assert.equal(withDecimalPoint.source_percent, "0.");

  const withDecimal = syncEditFormSourcePercent(withDecimalPoint, "0.6");
  assert.equal(withDecimal.source_percent, "0.6");

  const withTrailingZero = syncEditFormSourcePercent(withDecimal, "0.60");
  assert.equal(withTrailingZero.source_percent, "0.60");
  assert.equal(withTrailingZero.formula, "123.456789 + 234.567892 * (0.6)");
});

test("source edit preserves an empty value instead of restoring one", () => {
  const cleared = syncEditFormSourcePercent(editForm, "");

  assert.equal(cleared.source_percent, "");
  assert.equal(cleared.formula, "123.456789 + 234.567892");
});

test("source edit accepts a decimal above one", () => {
  const changed = syncEditFormSourcePercent(editForm, "1.5");

  assert.equal(changed.source_percent, "1.5");
  assert.equal(changed.formula, "123.456789 + 234.567892 * (1.5)");
});
