import assert from "node:assert/strict"
import test from "node:test"
import { isOnline, OFFLINE_MESSAGE } from "../lib/online"

test("treats server environments as online", () => {
  assert.equal(isOnline(), true)
  assert.ok(OFFLINE_MESSAGE.length > 0)
})

test("honors an explicit offline browser flag", () => {
  const globals = globalThis as { navigator?: { onLine: boolean } }
  const previous = globals.navigator
  globals.navigator = { onLine: false }
  try {
    assert.equal(isOnline(), false)
  } finally {
    if (previous === undefined) delete globals.navigator
    else globals.navigator = previous
  }
})
