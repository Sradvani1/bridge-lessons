import assert from "node:assert/strict"
import test from "node:test"
import { arePairNamesComplete, PAIR_PRESETS, parseStoredGame } from "../lib/game-data"

test("requires every pair name to be non-blank", () => {
  assert.equal(arePairNamesComplete(["Ava & Leo", "Mia", "Noah"]), true)
  assert.equal(arePairNamesComplete(["Ava & Leo", "Ava & Leo", "Mia"]), true)
  assert.equal(arePairNamesComplete(["Ava", "", "Mia"]), false)
  assert.equal(arePairNamesComplete(["Ava", "   ", "Mia"]), false)
  assert.equal(arePairNamesComplete([]), false)
})

test("keeps every preset usable as-is", () => {
  assert.ok(PAIR_PRESETS.length > 0)
  for (const preset of PAIR_PRESETS) {
    assert.ok(preset.trim().length > 0)
    assert.ok(preset.length <= 60)
  }
  assert.equal(arePairNamesComplete(PAIR_PRESETS), true)
})

test("rejects stored games with blank pair names", () => {
  assert.equal(
    parseStoredGame({ status: "playing", pairs: { ns: ["Ava", "", "Mia"], ew: ["A", "B", "C"] }, directorUid: "director", tables: {} }),
    null,
  )
  assert.equal(
    parseStoredGame({ status: "playing", movement: "howell", tableCount: 2, pairs: ["A", "B", "C", ""], directorUid: "director", tables: {} }),
    null,
  )
})
