import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createTypeAheadState,
  isTypeAheadKey,
  matchTypeAheadIndex,
  resetTypeAheadState,
} from "./typeAheadMatch.js";

describe("typeAheadMatch", () => {
  it("isTypeAheadKey accepts single printable chars", () => {
    assert.equal(isTypeAheadKey("a"), true);
    assert.equal(isTypeAheadKey("1"), true);
    assert.equal(isTypeAheadKey(" "), false);
    assert.equal(isTypeAheadKey("Enter"), false);
    assert.equal(isTypeAheadKey("ArrowDown"), false);
  });

  it("jumps to first label starting with typed prefix", () => {
    const state = createTypeAheadState();
    const labels = ["Alpha", "Beta", "Charlie", "Delta"];
    assert.equal(matchTypeAheadIndex(labels, "c", state), 2);
    assert.equal(matchTypeAheadIndex(labels, "h", state), 2);
  });

  it("cycles same letter across matching options", () => {
    const state = createTypeAheadState();
    const labels = ["Apple", "Apricot", "Banana"];
    assert.equal(matchTypeAheadIndex(labels, "a", state), 0);
    assert.equal(matchTypeAheadIndex(labels, "a", state), 1);
    assert.equal(matchTypeAheadIndex(labels, "a", state), 0);
  });

  it("resetTypeAheadState clears buffer", () => {
    const state = createTypeAheadState();
    matchTypeAheadIndex(["Foo", "Bar"], "f", state);
    resetTypeAheadState(state);
    assert.equal(state.buffer, "");
    assert.equal(state.lastIndex, -1);
  });
});
