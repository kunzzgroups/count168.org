import test from "node:test";
import assert from "node:assert/strict";

import { resolveSubmittedRemoveWordChips } from "./removeWordChips.js";

test("includes an uncommitted draft when the process form is submitted", () => {
  assert.equal(resolveSubmittedRemoveWordChips("", "TEST"), "TEST");
});

test("merges the draft with existing chips without duplicates", () => {
  assert.equal(resolveSubmittedRemoveWordChips("FIRST;TEST", "test"), "FIRST;TEST");
  assert.equal(resolveSubmittedRemoveWordChips("FIRST", "SECOND"), "FIRST;SECOND");
});
