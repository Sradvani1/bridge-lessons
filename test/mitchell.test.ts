import assert from "node:assert/strict"
import test from "node:test"
import { boardDealer, boardNumbersAt, boardVulnerability, canReadResult, eastWestPairAt } from "../lib/mitchell"
import { computeStandings } from "../lib/standings"
import { parseStoredGame, parseStoredResult, type StoredResult } from "../lib/game-data"

test("maps all Mitchell table and round assignments", () => {
  assert.deepEqual(boardNumbersAt(1, 0), [1, 2, 3, 4])
  assert.deepEqual(boardNumbersAt(1, 1), [5, 6, 7, 8])
  assert.deepEqual(boardNumbersAt(1, 2), [9, 10, 11, 12])
  assert.deepEqual([eastWestPairAt(1, 1), eastWestPairAt(2, 1), eastWestPairAt(3, 1)], [3, 1, 2])
  const seenBoards = new Map<number, number>()
  for (const table of [1, 2, 3] as const) for (const round of [0, 1, 2] as const) for (const board of boardNumbersAt(table, round)) seenBoards.set(board, (seenBoards.get(board) ?? 0) + 1)
  assert.deepEqual([...seenBoards.values()], Array(12).fill(3))
})

test("uses the standard dealer and vulnerability chart", () => {
  assert.equal(boardVulnerability(1), "none")
  assert.equal(boardVulnerability(4), "both")
  assert.equal(boardVulnerability(7), "both")
  assert.equal(boardVulnerability(12), "ns")
  assert.equal(boardDealer(1), "North")
  assert.equal(boardDealer(4), "West")
})

test("keeps live results private until reveal", () => {
  assert.equal(canReadResult("playing", { kind: "table", table: 1 }, 0), true)
  assert.equal(canReadResult("playing", { kind: "table", table: 1 }, 1), false)
  assert.equal(canReadResult("playing", { kind: "spectator" }, 0), false)
  assert.equal(canReadResult("finished", { kind: "spectator" }, 2), true)
})

test("aggregates Mitchell matchpoints by direction", () => {
  const results: StoredResult[] = [
    { boardNumber: 1, round: 0, table: 1, nsPairIndex: 0, ewPairIndex: 0, kind: "contract", level: 4, strain: "S", declarer: "ns", tricks: 10, doubling: "none", updatedBy: "a", updatedAt: 1 },
    { boardNumber: 1, round: 2, table: 2, nsPairIndex: 1, ewPairIndex: 2, kind: "contract", level: 3, strain: "NT", declarer: "ns", tricks: 9, doubling: "none", updatedBy: "b", updatedAt: 1 },
    { boardNumber: 1, round: 1, table: 3, nsPairIndex: 2, ewPairIndex: 1, kind: "passed-out", updatedBy: "c", updatedAt: 1 },
  ]
  const standings = computeStandings(results, { ns: ["NS 1", "NS 2", "NS 3"], ew: ["EW 1", "EW 2", "EW 3"] })
  assert.deepEqual(standings.ns.map((row) => row.totalMatchpoints), [4, 2, 0])
  assert.deepEqual(standings.ew.map((row) => row.totalMatchpoints), [0, 4, 2])
  assert.equal(standings.ns[0].boardsPlayed, 1)
})

test("rejects malformed stored results", () => {
  assert.equal(parseStoredResult({ boardNumber: 1, kind: "contract" }), null)
})

test("rejects results that do not match the Mitchell movement", () => {
  assert.equal(parseStoredResult({ boardNumber: 5, round: 0, table: 1, nsPairIndex: 0, ewPairIndex: 0, kind: "passed-out", updatedBy: "a", updatedAt: 1 }), null)
  assert.equal(parseStoredResult({ boardNumber: 1, round: 0, table: 1, nsPairIndex: 0, ewPairIndex: 1, kind: "passed-out", updatedBy: "a", updatedAt: 1 }), null)
})

test("reads exclusive table ownership and legacy finished games", () => {
  const base = { status: "finished", pairs: { ns: ["NS 1", "NS 2", "NS 3"], ew: ["EW 1", "EW 2", "EW 3"] }, directorUid: "director" }
  assert.deepEqual(parseStoredGame({ ...base, tables: { "1": "table-one" } })?.tables, { "1": "table-one" })
  assert.deepEqual(parseStoredGame({ ...base, tables: { "table-one": 1 } })?.tables, { "1": "table-one" })
})

test("reads cancelled games", () => {
  assert.equal(parseStoredGame({ status: "cancelled", pairs: { ns: ["NS 1", "NS 2", "NS 3"], ew: ["EW 4", "EW 5", "EW 6"] }, directorUid: "director", tables: {} })?.status, "cancelled")
})
