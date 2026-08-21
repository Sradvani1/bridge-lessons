import assert from "node:assert/strict"
import test from "node:test"
import {
  calculateDuplicateScore,
  rankBoardResults,
  scoreToImps,
  type ContractInput,
} from "../lib/bridge-scoring"

function score(input: Partial<ContractInput>) {
  const calculation = calculateDuplicateScore({
    passedOut: false,
    level: 1,
    strain: "C",
    declarer: "ns",
    tricks: 7,
    doubling: "none",
    vulnerability: "none",
    ...input,
  })
  assert.equal(calculation.ok, true)
  return calculation.value.nsScore
}

test("scores part scores, games, and slams", () => {
  assert.equal(score({ level: 2, strain: "H", tricks: 8 }), 110)
  assert.equal(score({ level: 4, strain: "S", tricks: 10 }), 420)
  assert.equal(score({ level: 3, strain: "NT", tricks: 9, vulnerability: "both" }), 600)
  assert.equal(score({ level: 6, strain: "S", tricks: 12 }), 980)
  assert.equal(score({ level: 7, strain: "NT", tricks: 13, vulnerability: "both" }), 2220)
})

test("scores doubled contracts, overtricks, and penalties", () => {
  assert.equal(score({ level: 4, strain: "H", tricks: 10, doubling: "doubled" }), 590)
  assert.equal(score({ level: 2, strain: "S", tricks: 9, doubling: "doubled" }), 570)
  assert.equal(score({ level: 3, strain: "NT", tricks: 7, doubling: "doubled" }), -300)
  assert.equal(score({ level: 4, strain: "S", tricks: 7, doubling: "doubled", vulnerability: "both" }), -800)
  assert.equal(score({ level: 3, strain: "NT", tricks: 9, doubling: "redoubled" }), 800)
})

test("inverts scores for East-West declarers and handles passed out boards", () => {
  assert.equal(score({ level: 4, strain: "S", declarer: "ew", tricks: 10 }), -420)
  const passedOut = calculateDuplicateScore({
    passedOut: true,
    level: 1,
    strain: "C",
    declarer: "ns",
    tricks: 0,
    doubling: "none",
    vulnerability: "none",
  })
  assert.equal(passedOut.ok, true)
  assert.equal(passedOut.value.nsScore, 0)
})

test("rejects malformed scoring inputs", () => {
  const result = calculateDuplicateScore({
    passedOut: false,
    level: 3,
    strain: "X",
    declarer: "ns",
    tricks: 9,
    doubling: "none",
    vulnerability: "none",
  } as unknown as ContractInput)
  assert.deepEqual(result, { ok: false, error: "Contract strain is invalid." })
  assert.throws(() => scoreToImps(Number.NaN), /finite score difference/)
})

test("calculates matchpoints, Cross-IMPs, and datum IMPs with ties", () => {
  const ranked = rankBoardResults([
    { id: "a", label: "A", nsScore: 420 },
    { id: "b", label: "B", nsScore: 170 },
    { id: "c", label: "C", nsScore: 170 },
  ], 170)

  assert.deepEqual(ranked.map(({ matchpoints, matchpointRank }) => [matchpoints, matchpointRank]), [[4, 1], [1, 2], [1, 2]])
  assert.deepEqual(ranked.map(({ crossImps, crossImpAverage }) => [crossImps, crossImpAverage]), [[12, 6], [-6, -3], [-6, -3]])
  assert.deepEqual(ranked.map(({ datumImps, datumImpRank }) => [datumImps, datumImpRank]), [[6, 1], [0, 2], [0, 2]])
})

test("rejects duplicate IDs and non-integer ranking scores", () => {
  assert.throws(
    () => rankBoardResults([{ id: "same", label: "A", nsScore: 0 }, { id: "same", label: "B", nsScore: 10 }]),
    /IDs must be unique/,
  )
  assert.throws(() => rankBoardResults([{ id: "a", label: "A", nsScore: 1.5 }]), /whole numbers/)
})
