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
    const boardsByPair = Array.from({ length: howellPairCount(tableCount) }, () => new Set<number>())
    for (const assignment of assignments) {
      opponents.add([assignment.nsPairIndex, assignment.ewPairIndex].sort((left, right) => left - right).join("-"))
      for (const board of assignment.boardNumbers) {
        boardUses.set(board, (boardUses.get(board) ?? 0) + 1)
        boardsByPair[assignment.nsPairIndex].add(board)
        boardsByPair[assignment.ewPairIndex].add(board)
      }
    }

    assert.equal(opponents.size, (howellPairCount(tableCount) * (howellPairCount(tableCount) - 1)) / 2)
    assert.deepEqual([...boardUses.values()], Array(howellBoardCount(tableCount)).fill(tableCount))
    for (const boards of boardsByPair) assert.deepEqual([...boards].sort((left, right) => left - right), Array.from({ length: howellBoardCount(tableCount) }, (_, index) => index + 1))
  }
})

test("parses only results that match a Howell movement card", () => {
  const game = parseStoredGame({ status: "playing", movement: "howell", tableCount: 2, pairs: ["Pair 1", "Pair 2", "Pair 3", "Pair 4"], directorUid: "director", tables: {} })
  assert.ok(game && game.movement === "howell")
  assert.ok(parseStoredResult({ boardNumber: 1, round: 0, table: 1, nsPairIndex: 0, ewPairIndex: 3, kind: "passed-out", updatedBy: "table-one", updatedAt: 1 }, game))
  assert.equal(parseStoredResult({ boardNumber: 1, round: 0, table: 1, nsPairIndex: 0, ewPairIndex: 2, kind: "passed-out", updatedBy: "table-one", updatedAt: 1 }, game), null)
})

test("combines Howell scores when pairs change direction", () => {
  const assignments = howellAssignments(3).filter((assignment) => assignment.boardNumbers.includes(1))
  const results: StoredResult[] = assignments.map((assignment, index) => ({
    boardNumber: 1,
    round: assignment.round,
    table: assignment.table,
    nsPairIndex: assignment.nsPairIndex,
    ewPairIndex: assignment.ewPairIndex,
    kind: "manual",
    manualScore: [100, 50, -50][index],
    updatedBy: "director",
    updatedAt: 1,
  }))
  const standings = computeHowellStandings(results, ["Pair 1", "Pair 2", "Pair 3", "Pair 4", "Pair 5", "Pair 6"])
  assert.equal(standings.reduce((total, row) => total + row.boardsPlayed, 0), 6)
  assert.equal(standings.find((row) => row.pairIndex === 0)?.totalMatchpoints, 4)
})
