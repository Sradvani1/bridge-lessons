import assert from "node:assert/strict"
import test from "node:test"
import { parseStoredGame, parseStoredResult, type StoredResult } from "../lib/game-data"
import { howellAssignments, howellBoardCount, howellPairCount, howellResultCount } from "../lib/howell"
import { computeHowellStandings } from "../lib/standings"

test("maps complete two- and three-table Howell movements", () => {
  for (const tableCount of [2, 3] as const) {
    const assignments = howellAssignments(tableCount)
    assert.equal(assignments.length, tableCount * (howellPairCount(tableCount) - 1))
    assert.equal(howellResultCount(tableCount), tableCount * howellBoardCount(tableCount))

    const opponents = new Set<string>()
    const boardUses = new Map<number, number>()
    const boardsPlayedByPair = Array(howellPairCount(tableCount)).fill(0)
    for (const assignment of assignments) {
      opponents.add([assignment.nsPairIndex, assignment.ewPairIndex].sort((left, right) => left - right).join("-"))
      for (const board of assignment.boardNumbers) {
        boardUses.set(board, (boardUses.get(board) ?? 0) + 1)
        boardsPlayedByPair[assignment.nsPairIndex] += 1
        boardsPlayedByPair[assignment.ewPairIndex] += 1
      }
    }

    assert.equal(opponents.size, (howellPairCount(tableCount) * (howellPairCount(tableCount) - 1)) / 2)
    assert.deepEqual([...boardUses.values()], Array(howellBoardCount(tableCount)).fill(tableCount))
    assert.deepEqual(boardsPlayedByPair, Array(howellPairCount(tableCount)).fill(howellBoardCount(tableCount)))
  }
})

test("matches the photographed three-table Baron Barclay Howell cards", () => {
  assert.deepEqual(howellAssignments(3), [
    { table: 1, round: 0, nsPairIndex: 5, ewPairIndex: 0, boardNumbers: [1, 2, 3] },
    { table: 2, round: 0, nsPairIndex: 2, ewPairIndex: 3, boardNumbers: [4, 5, 6] },
    { table: 3, round: 0, nsPairIndex: 4, ewPairIndex: 1, boardNumbers: [10, 11, 12] },
    { table: 1, round: 1, nsPairIndex: 5, ewPairIndex: 1, boardNumbers: [4, 5, 6] },
    { table: 2, round: 1, nsPairIndex: 3, ewPairIndex: 4, boardNumbers: [7, 8, 9] },
    { table: 3, round: 1, nsPairIndex: 0, ewPairIndex: 2, boardNumbers: [10, 11, 12] },
    { table: 1, round: 2, nsPairIndex: 5, ewPairIndex: 2, boardNumbers: [7, 8, 9] },
    { table: 2, round: 2, nsPairIndex: 4, ewPairIndex: 0, boardNumbers: [4, 5, 6] },
    { table: 3, round: 2, nsPairIndex: 1, ewPairIndex: 3, boardNumbers: [1, 2, 3] },
    { table: 1, round: 3, nsPairIndex: 5, ewPairIndex: 3, boardNumbers: [10, 11, 12] },
    { table: 2, round: 3, nsPairIndex: 0, ewPairIndex: 1, boardNumbers: [7, 8, 9] },
    { table: 3, round: 3, nsPairIndex: 2, ewPairIndex: 4, boardNumbers: [1, 2, 3] },
    { table: 1, round: 4, nsPairIndex: 5, ewPairIndex: 4, boardNumbers: [13, 14, 15] },
    { table: 2, round: 4, nsPairIndex: 1, ewPairIndex: 2, boardNumbers: [13, 14, 15] },
    { table: 3, round: 4, nsPairIndex: 3, ewPairIndex: 0, boardNumbers: [13, 14, 15] },
  ])
})

test("matches the photographed two-table Howell cards", () => {
  assert.deepEqual(howellAssignments(2), [
    { table: 1, round: 0, nsPairIndex: 0, ewPairIndex: 1, boardNumbers: [1, 2, 3, 4] },
    { table: 2, round: 0, nsPairIndex: 2, ewPairIndex: 3, boardNumbers: [1, 2, 3, 4] },
    { table: 1, round: 1, nsPairIndex: 0, ewPairIndex: 2, boardNumbers: [5, 6, 7, 8] },
    { table: 2, round: 1, nsPairIndex: 1, ewPairIndex: 3, boardNumbers: [5, 6, 7, 8] },
    { table: 1, round: 2, nsPairIndex: 0, ewPairIndex: 3, boardNumbers: [9, 10, 11, 12] },
    { table: 2, round: 2, nsPairIndex: 1, ewPairIndex: 2, boardNumbers: [9, 10, 11, 12] },
  ])
})

test("parses only results that match a Howell movement card", () => {
  const game = parseStoredGame({ status: "playing", movement: "howell", tableCount: 2, pairs: ["Pair 1", "Pair 2", "Pair 3", "Pair 4"], directorUid: "director", tables: {} })
  assert.ok(game && game.movement === "howell")
  assert.ok(parseStoredResult({ boardNumber: 1, round: 0, table: 1, nsPairIndex: 0, ewPairIndex: 1, kind: "passed-out", updatedBy: "table-one", updatedAt: 1 }, game))
  assert.equal(parseStoredResult({ boardNumber: 1, round: 0, table: 1, nsPairIndex: 0, ewPairIndex: 2, kind: "passed-out", updatedBy: "table-one", updatedAt: 1 }, game), null)
})

test("combines Howell scores when pairs change direction", () => {
  const results: StoredResult[] = howellAssignments(3).flatMap((assignment) => assignment.boardNumbers.map((boardNumber) => ({
    boardNumber,
    round: assignment.round,
    table: assignment.table,
    nsPairIndex: assignment.nsPairIndex,
    ewPairIndex: assignment.ewPairIndex,
    kind: "manual",
    manualScore: 0,
    updatedBy: "director",
    updatedAt: 1,
  })))
  const standings = computeHowellStandings(results, ["Pair 1", "Pair 2", "Pair 3", "Pair 4", "Pair 5", "Pair 6"])
  assert.equal(standings.reduce((total, row) => total + row.boardsPlayed, 0), 90)
  assert.equal(standings.find((row) => row.pairIndex === 0)?.boardsPlayed, 15)
  assert.equal(standings.find((row) => row.pairIndex === 0)?.totalMatchpoints, 30)
})
