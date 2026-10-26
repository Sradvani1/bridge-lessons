import type { BoardVulnerability } from "./bridge-scoring"

export type MitchellTableCount = 2 | 3 | 4 | 5

/**
 * Sizes the app can create. Mitchell rotations only line up fairly with an
 * odd table count; even counts replay boards for East-West pairs, so 2 and 4
 * are readable (legacy games) but never offered for new games.
 */
export const CREATABLE_MITCHELL_TABLE_COUNTS = [3, 5] as const
export type CreatableMitchellTableCount = (typeof CREATABLE_MITCHELL_TABLE_COUNTS)[number]
export type MitchellBoardsPerRound = 3 | 4

export function isMitchellTableCount(value: number): value is MitchellTableCount {
  return value === 2 || value === 3 || value === 4 || value === 5
}

export function isMitchellBoardsPerRound(value: number): value is MitchellBoardsPerRound {
  return value === 3 || value === 4
}

/** Rounds equal tables in a full Mitchell movement. */
export function mitchellRoundCount(tableCount: MitchellTableCount): number {
  return tableCount
}

/** Distinct boards in play: every table-round group contributes boardsPerRound boards. */
export function mitchellBoardCount(tableCount: MitchellTableCount, boardsPerRound: MitchellBoardsPerRound): number {
  return tableCount * boardsPerRound
}

/** One filed result per table per round per board. */
export function mitchellResultCount(tableCount: MitchellTableCount, boardsPerRound: MitchellBoardsPerRound): number {
  return tableCount * tableCount * boardsPerRound
}

export function mitchellMaxBoardMatchpoints(tableCount: MitchellTableCount): number {
  return (tableCount - 1) * 2
}

export function mitchellMaxTotalMatchpoints(tableCount: MitchellTableCount, boardsPerRound: MitchellBoardsPerRound): number {
  return mitchellBoardCount(tableCount, boardsPerRound) * mitchellMaxBoardMatchpoints(tableCount)
}

const VULNERABILITY_CYCLE: BoardVulnerability[] = [
  "none", "ns", "ew", "both",
  "ns", "ew", "both", "none",
  "ew", "both", "none", "ns",
  "both", "none", "ns", "ew",
]

const DEALER_CYCLE = ["North", "East", "South", "West"] as const

export type Dealer = (typeof DEALER_CYCLE)[number]

// Vulnerability and dealership repeat every 16 / 4 boards by the laws of bridge,
// so any positive board number maps into the cycle (needed past board 16).
function isScoringBoardNumber(boardNumber: number): boolean {
  return Number.isInteger(boardNumber) && boardNumber >= 1
}

export function boardVulnerability(boardNumber: number): BoardVulnerability | null {
  return isScoringBoardNumber(boardNumber) ? VULNERABILITY_CYCLE[(boardNumber - 1) % VULNERABILITY_CYCLE.length] : null
}

export function boardDealer(boardNumber: number): Dealer | null {
  return isScoringBoardNumber(boardNumber) ? DEALER_CYCLE[(boardNumber - 1) % DEALER_CYCLE.length] : null
}

export type TableNumber = 1 | 2 | 3 | 4 | 5
export type RoundIndex = 0 | 1 | 2 | 3 | 4

export function isTableNumber(value: number, tableCount: MitchellTableCount = 3): value is TableNumber {
  return Number.isInteger(value) && value >= 1 && value <= tableCount
}

export function isRoundIndex(value: number, roundCount: number = 3): value is RoundIndex {
  return Number.isInteger(value) && value >= 0 && value < roundCount
}

function wrap(value: number, mod: number): number {
  return ((value % mod) + mod) % mod
}

/** 1-based East-West pair number seated at a table in a round. */
export function eastWestPairAt(table: TableNumber, round: RoundIndex, tableCount: MitchellTableCount = 3): number {
  return wrap(table - round - 1, tableCount) + 1
}

export function northSouthPairAt(table: TableNumber): number {
  return table
}

/** Boards played at a table in a round. Groups rotate so every board is played once per round. */
export function boardNumbersAt(
  table: TableNumber,
  round: RoundIndex,
  tableCount: MitchellTableCount = 3,
  boardsPerRound: MitchellBoardsPerRound = 4,
): number[] {
  const group = wrap(table + round - 1, tableCount)
  const first = group * boardsPerRound + 1
  return Array.from({ length: boardsPerRound }, (_, i) => first + i)
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
