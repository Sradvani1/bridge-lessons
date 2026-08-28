import { competitionRanks, rankBoardResults, type BoardResult } from "./bridge-scoring"
import { MAX_TOTAL_MATCHPOINTS } from "./mitchell"
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

const PAIR_COUNT = 3

function zeros(): number[] {
  return [0, 0, 0]
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

  const nsTotals = zeros()
  const ewTotals = zeros()
  const nsPlayed = zeros()
  const ewPlayed = zeros()

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

export function matchpointPercentage(totalMatchpoints: number): number {
  return Math.round((totalMatchpoints / MAX_TOTAL_MATCHPOINTS) * 1000) / 10
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
    const matchpointsByTable = new Map(rankBoardResults(boardResults.map((entry) => ({ id: String(entry.table), label: "", nsScore: deriveNsScore(entry) ?? 0 }))).map((entry) => [Number(entry.id), entry.matchpoints]))
    for (const result of boardResults) {
      const score = deriveNsScore(result)
      if (score === null) continue
      const matchpoints = matchpointsByTable.get(result.table) ?? 0
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

export const TOTAL_PAIR_COUNT = PAIR_COUNT
