import assert from "node:assert/strict"
import test from "node:test"
import { boardDealer, boardNumbersAt, boardVulnerability, canReadResult, eastWestPairAt, mitchellBoardCount, mitchellResultCount } from "../lib/mitchell"
import { computeStandings } from "../lib/standings"
import { allAssignments, assignmentForPair, mitchellResultCountForGame, pairBoardCount, parseStoredGame, parseStoredResult, type MitchellGame, type StoredGame, type StoredResult } from "../lib/game-data"

function asMitchell(game: StoredGame | null): MitchellGame {
  assert.ok(game && "boardsPerRound" in game)
  return game
}

test("maps all Mitchell table and round assignments", () => {
  assert.deepEqual(boardNumbersAt(1, 0), [1, 2, 3, 4])
  assert.deepEqual(boardNumbersAt(1, 1), [5, 6, 7, 8])
  assert.deepEqual(boardNumbersAt(1, 2), [9, 10, 11, 12])
  assert.deepEqual([eastWestPairAt(1, 1), eastWestPairAt(2, 1), eastWestPairAt(3, 1)], [3, 1, 2])
  const seenBoards = new Map<number, number>()
  for (const table of [1, 2, 3] as const) for (const round of [0, 1, 2] as const) for (const board of boardNumbersAt(table, round)) seenBoards.set(board, (seenBoards.get(board) ?? 0) + 1)
  assert.deepEqual([...seenBoards.values()], Array(12).fill(3))
})

test("covers every board once per round for every table and board count", () => {
  for (const tableCount of [2, 3, 4] as const) {
    for (const boardsPerRound of [3, 4] as const) {
      const seenBoards = new Map<number, number>()
      for (let table = 1; table <= tableCount; table += 1) {
        const ewPairs = new Set<number>()
        for (let round = 0; round < tableCount; round += 1) {
          const boards = boardNumbersAt(table as 1 | 2 | 3 | 4, round as 0 | 1 | 2 | 3, tableCount, boardsPerRound)
          assert.equal(boards.length, boardsPerRound)
          for (const board of boards) seenBoards.set(board, (seenBoards.get(board) ?? 0) + 1)
          ewPairs.add(eastWestPairAt(table as 1 | 2 | 3 | 4, round as 0 | 1 | 2 | 3, tableCount))
        }
        // Every East-West pair visits every table across the rounds.
        assert.deepEqual([...ewPairs].sort(), Array.from({ length: tableCount }, (_, index) => index + 1))
      }
      const boardCount = mitchellBoardCount(tableCount, boardsPerRound)
      assert.deepEqual([...seenBoards.keys()].sort((a, b) => a - b), Array.from({ length: boardCount }, (_, index) => index + 1))
      assert.deepEqual([...seenBoards.values()], Array(boardCount).fill(tableCount))
      assert.equal(mitchellResultCount(tableCount, boardsPerRound), tableCount * boardCount)
    }
  }
})

test("derives matching pair totals for every game size", () => {
  for (const tableCount of [2, 3, 4] as const) {
    for (const boardsPerRound of [3, 4] as const) {
      const game = asMitchell(parseStoredGame({
        status: "playing",
        movement: "mitchell",
        tableCount,
        boardsPerRound,
        pairs: {
          ns: Array.from({ length: tableCount }, (_, index) => `NS ${index + 1}`),
          ew: Array.from({ length: tableCount }, (_, index) => `EW ${index + 1}`),
        },
        directorUid: "director",
        pairClaims: {},
      }))
      assert.equal(mitchellResultCountForGame(game), tableCount * tableCount * boardsPerRound)
      assert.equal(pairBoardCount(game), tableCount * boardsPerRound)
      assert.equal(allAssignments(game).length, tableCount * tableCount)
      // Every printed pair number resolves to a table assignment each round.
      const pairCount = tableCount * 2
      for (let pairNumber = 1; pairNumber <= pairCount; pairNumber += 1) {
        for (let round = 0; round < tableCount; round += 1) {
          assert.ok(assignmentForPair(game, String(pairNumber), round))
        }
      }
    }
  }
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

test("tolerates a pair dealt the same board twice without crashing", () => {
  // Regression: an invalid movement filed East-West pair 3 on board 9 in two
  // rounds, which used to throw inside rankBoardResults and blank the room.
  const results: StoredResult[] = [
    { boardNumber: 9, round: 0, table: 3, nsPairIndex: 2, ewPairIndex: 2, kind: "passed-out", updatedBy: "a", updatedAt: 1 },
    { boardNumber: 9, round: 1, table: 2, nsPairIndex: 1, ewPairIndex: 0, kind: "passed-out", updatedBy: "b", updatedAt: 2 },
    { boardNumber: 9, round: 2, table: 1, nsPairIndex: 0, ewPairIndex: 2, kind: "passed-out", updatedBy: "c", updatedAt: 3 },
  ]
  const standings = computeStandings(results, { ns: ["NS 1", "NS 2", "NS 3", "NS 4"], ew: ["EW 1", "EW 2", "EW 3", "EW 4"] })
  // Three distinct North-South plays tie for 2 matchpoints each; the replayed
  // East-West pair counts only its first play in a two-way tie for 1 each.
  assert.deepEqual(standings.ns.map((row) => row.totalMatchpoints), [2, 2, 2, 0])
  assert.deepEqual(standings.ew.map((row) => row.totalMatchpoints), [1, 0, 1, 0])
})

test("rejects malformed stored results", () => {
  assert.equal(parseStoredResult({ boardNumber: 1, kind: "contract" }), null)
})

test("rejects results that do not match the Mitchell movement", () => {
  assert.equal(parseStoredResult({ boardNumber: 5, round: 0, table: 1, nsPairIndex: 0, ewPairIndex: 0, kind: "passed-out", updatedBy: "a", updatedAt: 1 }), null)
  assert.equal(parseStoredResult({ boardNumber: 1, round: 0, table: 1, nsPairIndex: 0, ewPairIndex: 1, kind: "passed-out", updatedBy: "a", updatedAt: 1 }), null)
})

test("reads exclusive pair ownership", () => {
  const base = { status: "finished", pairs: { ns: ["NS 1", "NS 2", "NS 3"], ew: ["EW 1", "EW 2", "EW 3"] }, directorUid: "director" }
  assert.deepEqual(parseStoredGame({ ...base, pairClaims: { "1": "pair-one" } })?.pairClaims, { "1": "pair-one" })
  assert.deepEqual(parseStoredGame({ ...base, tables: { "1": "legacy-table" } })?.pairClaims, {})
  assert.equal(parseStoredGame({ ...base, pairClaims: { "pair-one": 1 } }), null)
})

test("defaults legacy Mitchell games to three tables and four boards", () => {
  const game = asMitchell(parseStoredGame({ status: "playing", pairs: { ns: ["NS 1", "NS 2", "NS 3"], ew: ["EW 4", "EW 5", "EW 6"] }, directorUid: "director", pairClaims: {} }))
  assert.equal(game.tableCount, 3)
  assert.equal(game.boardsPerRound, 4)
  assert.equal(mitchellResultCountForGame(game), 36)
})

test("rejects Mitchell games with mismatched sizes", () => {
  const pairs = { ns: ["NS 1", "NS 2"], ew: ["EW 3", "EW 4"] }
  assert.equal(parseStoredGame({ status: "playing", movement: "mitchell", tableCount: 3, boardsPerRound: 4, pairs, directorUid: "director", pairClaims: {} }), null)
  assert.equal(parseStoredGame({ status: "playing", movement: "mitchell", tableCount: 2, boardsPerRound: 5, pairs, directorUid: "director", pairClaims: {} }), null)
  assert.equal(parseStoredGame({ status: "playing", movement: "mitchell", tableCount: 5, boardsPerRound: 4, pairs, directorUid: "director", pairClaims: {} }), null)
})

test("reads cancelled games", () => {
  assert.equal(parseStoredGame({ status: "cancelled", pairs: { ns: ["NS 1", "NS 2", "NS 3"], ew: ["EW 4", "EW 5", "EW 6"] }, directorUid: "director", pairClaims: {} })?.status, "cancelled")
})
