import assert from "node:assert/strict"
import test from "node:test"
import { arePairNamesComplete, parseStoredGame } from "../lib/game-data"

test("requires every pair name to be non-blank", () => {
  assert.equal(arePairNamesComplete(["Ava & Leo", "Mia", "Noah"]), true)
  assert.equal(arePairNamesComplete(["Ava & Leo", "Ava & Leo", "Mia"]), true)
  assert.equal(arePairNamesComplete(["Ava", "", "Mia"]), false)
  assert.equal(arePairNamesComplete(["Ava", "   ", "Mia"]), false)
  assert.equal(arePairNamesComplete([]), false)
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
