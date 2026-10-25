import { competitionRanks, rankBoardResults, type BoardResult } from "./bridge-scoring"
import { mitchellMaxTotalMatchpoints, type MitchellBoardsPerRound, type MitchellTableCount } from "./mitchell"
import { howellBoardCount, type HowellTableCount } from "./howell"
import { deriveNsScore, type StoredResult } from "./game-data"

export type StandingsRow = {
  pairIndex: number
  label: string
  totalMatchpoints: number
  boardsPlayed: number
  place: number
}

export type Standings = {
  ns: StandingsRow[]
  ew: StandingsRow[]
}

function zeros(count: number): number[] {
  return Array.from({ length: count }, () => 0)
}

function matchpointsByPair(entries: readonly { pairIndex: number; score: number }[]): Map<number, number> {
  const rows: BoardResult[] = entries.map((entry) => ({
    id: String(entry.pairIndex),
    label: "",
    nsScore: entry.score,
  }))
  const map = new Map<number, number>()
  for (const ranked of rankBoardResults(rows)) {
    map.set(Number(ranked.id), ranked.matchpoints)
  }
  return map
}

function buildRows(labels: readonly string[], totals: readonly number[], played: readonly number[]): StandingsRow[] {
  const places = competitionRanks([...totals])
  return labels.map((label, pairIndex) => ({
    pairIndex,
    label,
    totalMatchpoints: totals[pairIndex],
    boardsPlayed: played[pairIndex],
    place: places[pairIndex],
  }))
}

export function computeStandings(
  results: readonly StoredResult[],
  pairs: { ns: string[]; ew: string[] },
): Standings {
  const byBoard = new Map<number, StoredResult[]>()
  for (const result of results) {
    if (deriveNsScore(result) === null) continue
    const existing = byBoard.get(result.boardNumber)
    if (existing) existing.push(result)
    else byBoard.set(result.boardNumber, [result])
  }

  const pairCount = pairs.ns.length
  const nsTotals = zeros(pairCount)
  const ewTotals = zeros(pairCount)
  const nsPlayed = zeros(pairCount)
  const ewPlayed = zeros(pairCount)

  for (const boardResults of byBoard.values()) {
    const nsEntries = boardResults.flatMap((result) => {
      const score = deriveNsScore(result)
      return score === null ? [] : [{ pairIndex: result.nsPairIndex, score }]
    })
    for (const [pairIndex, matchpoints] of matchpointsByPair(nsEntries)) {
      nsTotals[pairIndex] += matchpoints
      nsPlayed[pairIndex] += 1
    }

    const ewEntries = boardResults.flatMap((result) => {
      const score = deriveNsScore(result)
      return score === null ? [] : [{ pairIndex: result.ewPairIndex, score: -score }]
    })
    for (const [pairIndex, matchpoints] of matchpointsByPair(ewEntries)) {
      ewTotals[pairIndex] += matchpoints
      ewPlayed[pairIndex] += 1
    }
  }

  return {
    ns: buildRows(pairs.ns, nsTotals, nsPlayed),
    ew: buildRows(pairs.ew, ewTotals, ewPlayed),
  }
}

export function matchpointPercentage(
  totalMatchpoints: number,
  tableCount: MitchellTableCount = 3,
  boardsPerRound: MitchellBoardsPerRound = 4,
): number {
  return Math.round((totalMatchpoints / mitchellMaxTotalMatchpoints(tableCount, boardsPerRound)) * 1000) / 10
}

export function computeHowellStandings(results: readonly StoredResult[], pairs: readonly string[]): StandingsRow[] {
  const byBoard = new Map<number, StoredResult[]>()
  for (const result of results) {
    if (deriveNsScore(result) === null) continue
    const boardResults = byBoard.get(result.boardNumber) ?? []
    boardResults.push(result)
    byBoard.set(result.boardNumber, boardResults)
  }

  const totals = Array.from({ length: pairs.length }, () => 0)
  const played = Array.from({ length: pairs.length }, () => 0)
  for (const boardResults of byBoard.values()) {
    // A Howell board can return to the same table in a later round, so table
    // number alone is not a unique result identity.
    const matchpointsByResult = new Map(rankBoardResults(boardResults.map((entry) => ({ id: `${entry.table}-${entry.nsPairIndex}`, label: "", nsScore: deriveNsScore(entry) ?? 0 }))).map((entry) => [entry.id, entry.matchpoints]))
    for (const result of boardResults) {
      const score = deriveNsScore(result)
      if (score === null) continue
      const matchpoints = matchpointsByResult.get(`${result.table}-${result.nsPairIndex}`) ?? 0
      totals[result.nsPairIndex] += matchpoints
      totals[result.ewPairIndex] += (boardResults.length - 1) * 2 - matchpoints
      played[result.nsPairIndex] += 1
      played[result.ewPairIndex] += 1
    }
  }
  return buildRows(pairs, totals, played)
}

export function howellMatchpointPercentage(totalMatchpoints: number, tableCount: HowellTableCount): number {
  const maximum = howellBoardCount(tableCount) * (tableCount - 1) * 2
  return Math.round((totalMatchpoints / maximum) * 1000) / 10
}

