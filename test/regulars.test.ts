import assert from "node:assert/strict"
import test from "node:test"
import { PAIR_PRESETS } from "../lib/game-data"
import { cleanRegularName, dedupeRegulars, defaultRegulars, loadRegulars, saveRegulars } from "../lib/regulars"

function mockStorage(options: { failOnWrite?: boolean; initial?: string } = {}) {
  const store = new Map<string, string>()
  if (options.initial !== undefined) store.set("bridge-regulars", options.initial)
  const globals = globalThis as { window?: unknown }
  const previous = globals.window
  globals.window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        if (options.failOnWrite) throw new Error("storage denied")
        store.set(key, value)
      },
    },
  }
  return () => {
    if (previous === undefined) delete globals.window
    else globals.window = previous
  }
}

test("seeds new devices with the built-in names", () => {
  const restore = mockStorage()
  try {
    assert.deepEqual(loadRegulars(), PAIR_PRESETS)
  } finally {
    restore()
  }
})

test("returns the built-in names when storage is unavailable", () => {
  assert.deepEqual(loadRegulars(), PAIR_PRESETS)
})

test("seed copies do not alias the built-in list", () => {
  const restore = mockStorage()
  try {
    const loaded = loadRegulars()
    loaded.push("Extra Pair")
    assert.equal(PAIR_PRESETS.includes("Extra Pair"), false)
    assert.deepEqual(defaultRegulars(), PAIR_PRESETS)
  } finally {
    restore()
  }
})

test("cleans single names", () => {
  assert.equal(cleanRegularName("  Mary and Mrunal  "), "Mary and Mrunal")
  assert.equal(cleanRegularName("   "), null)
  assert.equal(cleanRegularName(""), null)
  assert.equal(cleanRegularName(42), null)
  assert.equal(cleanRegularName("x".repeat(80)), "x".repeat(60))
})

test("dedupes case-insensitively and drops blanks", () => {
  assert.deepEqual(dedupeRegulars(["Mary and Mrunal", "mary AND mrunal", "  ", "New Pair", "", 42]), ["Mary and Mrunal", "New Pair"])
})

test("round-trips the list through storage", () => {
  const restore = mockStorage()
  try {
    assert.deepEqual(saveRegulars(["  Alpha  ", "alpha", "Beta", ""]), ["Alpha", "Beta"])
    assert.deepEqual(loadRegulars(), ["Alpha", "Beta"])
  } finally {
    restore()
  }
})

test("falls back to defaults on corrupt storage", () => {
  const restore = mockStorage({ initial: "not-json{{" })
  try {
    assert.deepEqual(loadRegulars(), PAIR_PRESETS)
  } finally {
    restore()
  }
})

test("falls back to defaults when storage holds a non-list", () => {
  const restore = mockStorage({ initial: JSON.stringify({ names: ["Alpha"] }) })
  try {
    assert.deepEqual(loadRegulars(), PAIR_PRESETS)
  } finally {
    restore()
  }
})

test("keeps working for the session when writes are refused", () => {
  const restore = mockStorage({ failOnWrite: true })
  try {
    assert.deepEqual(saveRegulars(["Alpha"]), ["Alpha"])
  } finally {
    restore()
  }
})

test("an emptied list stays empty instead of reseeding", () => {
  const restore = mockStorage()
  try {
    assert.deepEqual(saveRegulars([]), [])
    assert.deepEqual(loadRegulars(), [])
  } finally {
    restore()
  }
})
