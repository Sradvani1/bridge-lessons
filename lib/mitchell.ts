import type { BoardVulnerability } from "./bridge-scoring"

export const TABLE_COUNT = 3
export const ROUND_COUNT = 3
export const BOARDS_PER_ROUND = 4
export const BOARD_COUNT = ROUND_COUNT * BOARDS_PER_ROUND
export const MAX_BOARD_MATCHPOINTS = (TABLE_COUNT - 1) * 2
export const MAX_TOTAL_MATCHPOINTS = BOARD_COUNT * MAX_BOARD_MATCHPOINTS

const VULNERABILITY_CYCLE: BoardVulnerability[] = [
  "none", "ns", "ew", "both",
  "ns", "ew", "both", "none",
  "ew", "both", "none", "ns",
  "both", "none", "ns", "ew",
]

const DEALER_CYCLE = ["North", "East", "South", "West"] as const

export type Dealer = (typeof DEALER_CYCLE)[number]

function isBoardNumber(boardNumber: number): boolean {
  return Number.isInteger(boardNumber) && boardNumber >= 1 && boardNumber <= BOARD_COUNT
}

export function boardVulnerability(boardNumber: number): BoardVulnerability | null {
  return isBoardNumber(boardNumber) ? VULNERABILITY_CYCLE[(boardNumber - 1) % VULNERABILITY_CYCLE.length] : null
}

export function boardDealer(boardNumber: number): Dealer | null {
  return isBoardNumber(boardNumber) ? DEALER_CYCLE[(boardNumber - 1) % DEALER_CYCLE.length] : null
}

export type TableNumber = 1 | 2 | 3
export type RoundIndex = 0 | 1 | 2

export function isTableNumber(value: number): value is TableNumber {
  return Number.isInteger(value) && value >= 1 && value <= TABLE_COUNT
}

export function isRoundIndex(value: number): value is RoundIndex {
  return Number.isInteger(value) && value >= 0 && value < ROUND_COUNT
}

function wrap3(value: number): number {
  return ((value % TABLE_COUNT) + TABLE_COUNT) % TABLE_COUNT
}

export function eastWestPairAt(table: TableNumber, round: RoundIndex): number {
  return wrap3(table - round - 1) + 1
}

export function northSouthPairAt(table: TableNumber): number {
  return table
}

export function boardNumbersAt(table: TableNumber, round: RoundIndex): number[] {
  const group = wrap3(table + round - 1)
  const first = group * BOARDS_PER_ROUND + 1
  return Array.from({ length: BOARDS_PER_ROUND }, (_, i) => first + i)
}

export type GameStatus = "playing" | "finished" | "cancelled"

export type Viewer =
  | { kind: "director" }
  | { kind: "table"; table: TableNumber }
  | { kind: "spectator" }

export function canReadResult(status: GameStatus, viewer: Viewer, nsPairIndex: number): boolean {
  if (viewer.kind === "director") return true
  if (status === "finished") return true
  return viewer.kind === "table" && viewer.table - 1 === nsPairIndex
}

export function canWriteResults(status: GameStatus, viewer: Viewer): boolean {
  if (viewer.kind === "director") return true
  return status === "playing" && viewer.kind === "table"
}
