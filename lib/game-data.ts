import { calculateDuplicateScore, type DeclarerSide, type Doubling, type Strain } from "./bridge-scoring"
import { howellAssignmentAt, howellAssignments, howellBoardCount, howellPairCount, howellRoundCount, isHowellAssignment, isHowellTableCount, type HowellTableCount } from "./howell"
import { boardNumbersAt, boardVulnerability, eastWestPairAt, isRoundIndex, isTableNumber, type GameStatus } from "./mitchell"

export type ResultKind = "contract" | "passed-out" | "manual"

export type StoredResult = {
  boardNumber: number
  round: number
  table: number
  nsPairIndex: number
  ewPairIndex: number
  kind: ResultKind
  level?: number
  strain?: Strain
  doubling?: Doubling
  declarer?: DeclarerSide
  tricks?: number
  manualScore?: number
  updatedBy: string
  updatedAt: number
}

export type MitchellPairs = {
  ns: string[]
  ew: string[]
}

type GameBase = {
  status: GameStatus
  directorUid: string
  pairClaims: Record<string, string>
  /** Printed pair numbers sitting out (max 1). Missing on legacy games. */
  absentPairs: string[]
  lastActivityAt?: number
}

export type MitchellGame = GameBase & { movement?: "mitchell"; pairs: MitchellPairs }
export type HowellGame = GameBase & { movement: "howell"; tableCount: HowellTableCount; pairs: string[] }
export type StoredGame = MitchellGame | HowellGame

const strains = new Set<Strain>(["C", "D", "H", "S", "NT"])
const declarers = new Set<DeclarerSide>(["ns", "ew"])
const doublings = new Set<Doubling>(["none", "doubled", "redoubled"])
const kinds = new Set<ResultKind>(["contract", "passed-out", "manual"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function intIn(raw: Record<string, unknown>, key: string, min: number, max: number): number | null {
  const value = raw[key]
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null
}

function enumIn<T extends string>(raw: Record<string, unknown>, key: string, allowed: ReadonlySet<T>): T | null {
  const value = raw[key]
  return typeof value === "string" && allowed.has(value as T) ? (value as T) : null
}

function uid(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 64 ? value : null
}

function label(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= 60 ? value : null
}

export function arePairNamesComplete(names: readonly string[]): boolean {
  return names.length > 0 && names.every((name) => name.trim().length > 0)
}

export const PAIR_PRESETS = [
  "Mary and Mrunal",
  "Bhupinder and Praveen",
  "Neepa and Kausik",
  "Ravinder and Prahlad",
  "Pankaj and Meeta",
  "Martha and Ling",
  "Genaro and Lubna",
  "Milan and Dinesh",
]

export function pairCountForGame(game: StoredGame): number {
  return game.movement === "howell" ? howellPairCount(game.tableCount) : 6
}

/** Printed pair numbers "1".."N" with display labels from director-entered names. */
export function pairListForGame(game: StoredGame): { pairNumber: string; label: string }[] {
  if (game.movement === "howell") {
    return game.pairs.map((label, index) => ({ pairNumber: String(index + 1), label }))
  }
  return [
    ...game.pairs.ns.map((label, index) => ({ pairNumber: String(index + 1), label })),
    ...game.pairs.ew.map((label, index) => ({ pairNumber: String(index + 4), label })),
  ]
}

/** Zero-based pair indices for a printed pair number. Mitchell pairs are NS- or EW-only. */
export function pairIndicesForNumber(
  game: StoredGame,
  pairNumber: string,
): { nsPairIndex: number; ewPairIndex: number } | null {
  const pairCount = pairCountForGame(game)
  if (!/^[1-9]$/.test(pairNumber)) return null
  const picker = Number(pairNumber)
  if (!Number.isInteger(picker) || picker < 1 || picker > pairCount) return null
  if (game.movement === "howell") return { nsPairIndex: picker - 1, ewPairIndex: picker - 1 }
  return picker <= 3
    ? { nsPairIndex: picker - 1, ewPairIndex: -1 }
    : { nsPairIndex: -1, ewPairIndex: picker - 4 }
}

export function pairNumberForUid(game: StoredGame, userId: string | null): string | null {
  if (!userId) return null
  const found = Object.entries(game.pairClaims).find(([, claimedUid]) => claimedUid === userId)
  return found ? found[0] : null
}

export type PairAssignment = {
  table: number
  round: number
  nsPairIndex: number
  ewPairIndex: number
  direction: "ns" | "ew"
  boardNumbers: number[]
}

/**
 * Where a pair plays in a round. Phones follow pairs: both pairs seated at a
 * table derive the same table + boards, so either can save and first-write-wins.
 */
export function assignmentForPair(game: StoredGame, pairNumber: string, round: number): PairAssignment | null {
  if (game.movement === "howell") {
    const pairIndex = Number(pairNumber) - 1
    if (!Number.isInteger(pairIndex) || pairIndex < 0 || pairIndex >= howellPairCount(game.tableCount)) return null
    const found = howellAssignments(game.tableCount).find(
      (candidate) => candidate.round === round && (candidate.nsPairIndex === pairIndex || candidate.ewPairIndex === pairIndex),
    )
    if (!found) return null
    return { ...found, direction: found.nsPairIndex === pairIndex ? "ns" : "ew" }
  }
  const indices = pairIndicesForNumber(game, pairNumber)
  if (!indices || !isRoundIndex(round)) return null
  if (indices.nsPairIndex >= 0) {
    const table = (indices.nsPairIndex + 1) as 1 | 2 | 3
    return {
      table,
      round,
      nsPairIndex: indices.nsPairIndex,
      ewPairIndex: eastWestPairAt(table, round) - 1,
      direction: "ns",
      boardNumbers: boardNumbersAt(table, round),
    }
  }
  const ewNumber = indices.ewPairIndex + 1
  const table = ([1, 2, 3] as const).find((candidate) => eastWestPairAt(candidate, round) === ewNumber)
  if (!table) return null
  return {
    table,
    round,
    nsPairIndex: table - 1,
    ewPairIndex: indices.ewPairIndex,
    direction: "ew",
    boardNumbers: boardNumbersAt(table, round),
  }
}

/** Boards one pair plays in a full game (used for per-pair progress). */
export function pairBoardCount(game: StoredGame): number {
  if (game.movement === "howell") return howellBoardCount(game.tableCount)
  return 12
}

export function pairLabel(game: StoredGame, pairNumber: string): string {
  return pairListForGame(game).find((pair) => pair.pairNumber === pairNumber)?.label ?? `Pair ${pairNumber}`
}

function parseAbsentPairs(raw: unknown, pairCount: number): string[] | null {
  if (raw === undefined) return []
  if (!Array.isArray(raw) || raw.length > 1) return null
  const absentPairs: string[] = []
  for (const item of raw) {
    if (typeof item !== "string" || !/^[1-9]$/.test(item)) return null
    const picker = Number(item)
    if (!Number.isInteger(picker) || picker < 1 || picker > pairCount) return null
    absentPairs.push(item)
  }
  return absentPairs
}

/** Printed pair number sitting out, or null. Capped at one absence. */
export function absentPairNumber(game: StoredGame): string | null {
  return game.absentPairs.length > 0 ? game.absentPairs[0] : null
}

export type ResultSlot = {
  table: number
  round: number
  nsPairIndex: number
  ewPairIndex: number
  boardNumbers: number[]
}

/** Every scoring slot in a full game, before absences. */
export function allAssignments(game: StoredGame): ResultSlot[] {
  if (game.movement === "howell") return howellAssignments(game.tableCount).map(({ table, round, nsPairIndex, ewPairIndex, boardNumbers }) => ({ table, round, nsPairIndex, ewPairIndex, boardNumbers }))
  const slots: ResultSlot[] = []
  for (const table of [1, 2, 3] as const) {
    for (const round of [0, 1, 2] as const) {
      slots.push({ table, round, nsPairIndex: table - 1, ewPairIndex: eastWestPairAt(table, round) - 1, boardNumbers: boardNumbersAt(table, round) })
    }
  }
  return slots
}

function slotInvolvesPair(game: StoredGame, slot: ResultSlot, pairNumber: string): boolean {
  if (game.movement === "howell") {
    const pairIndex = Number(pairNumber) - 1
    return slot.nsPairIndex === pairIndex || slot.ewPairIndex === pairIndex
  }
  const indices = pairIndicesForNumber(game, pairNumber)
  if (!indices) return false
  return indices.nsPairIndex >= 0
    ? slot.nsPairIndex === indices.nsPairIndex
    : slot.ewPairIndex === indices.ewPairIndex
}

/** Slots that must be filed: all assignments except the absent pair's tables. */
export function expectedSlots(game: StoredGame): ResultSlot[] {
  const ghost = absentPairNumber(game)
  if (!ghost) return allAssignments(game)
  return allAssignments(game).filter((slot) => !slotInvolvesPair(game, slot, ghost))
}

/** Expected slots with unfiled boards (grouped by table and round). */
export function missingResultSlots(game: StoredGame, results: StoredResult[]): ResultSlot[] {
  const missing: ResultSlot[] = []
  for (const slot of expectedSlots(game)) {
    const missingBoards = slot.boardNumbers.filter((board) => !results.some((result) => result.boardNumber === board && result.nsPairIndex === slot.nsPairIndex))
    if (missingBoards.length > 0) missing.push({ ...slot, boardNumbers: missingBoards })
  }
  return missing.sort((left, right) => left.round - right.round || left.table - right.table)
}

/** Whether a pair sits out a round (their table-round involves the absentee). */
export function sitsOutRound(game: StoredGame, pairNumber: string, round: number): boolean {
  const ghost = absentPairNumber(game)
  if (!ghost) return false
  if (ghost === pairNumber) return true
  const mine = assignmentForPair(game, pairNumber, round)
  const theirs = assignmentForPair(game, ghost, round)
  return Boolean(mine && theirs && mine.table === theirs.table)
}

/** Boards one pair must file across the game, skipping sit-out rounds. */
export function pairExpectedBoards(game: StoredGame, pairNumber: string): number {
  const roundCount = game.movement === "howell" ? howellRoundCount(game.tableCount) : 3
  let total = 0
  for (let round = 0; round < roundCount; round += 1) {
    if (sitsOutRound(game, pairNumber, round)) continue
    total += assignmentForPair(game, pairNumber, round)?.boardNumbers.length ?? 0
  }
  return total
}

/** First round with unfiled boards at a table (for director corrections). */
export function firstIncompleteRoundForTable(game: StoredGame, table: number, results: StoredResult[]): number | null {
  const roundCount = game.movement === "howell" ? howellRoundCount(game.tableCount) : 3
  for (let round = 0; round < roundCount; round += 1) {
    const boards = game.movement === "howell"
      ? howellAssignmentAt(game.tableCount, table, round)?.boardNumbers ?? []
      : isTableNumber(table) && isRoundIndex(round) ? boardNumbersAt(table, round) : []
    const nsPairIndex = game.movement === "howell"
      ? howellAssignmentAt(game.tableCount, table, round)?.nsPairIndex ?? -1
      : table - 1
    if (boards.some((board) => !results.some((result) => result.boardNumber === board && result.nsPairIndex === nsPairIndex))) return round
  }
  return null
}

export function resultDocumentId(boardNumber: number, nsPairIndex: number): string {
  return `board-${boardNumber}-ns-${nsPairIndex}`
}

export function parseStoredResult(raw: unknown, game?: StoredGame): StoredResult | null {
  if (!isRecord(raw)) return null

  const tableCount = game?.movement === "howell" ? game.tableCount : 3
  const boardNumber = intIn(raw, "boardNumber", 1, game?.movement === "howell" ? howellBoardCount(tableCount) : 12)
  const round = intIn(raw, "round", 0, game?.movement === "howell" ? tableCount === 2 ? 2 : 4 : 2)
  const table = intIn(raw, "table", 1, tableCount)
  const nsPairIndex = intIn(raw, "nsPairIndex", 0, tableCount * 2 - 1)
  const ewPairIndex = intIn(raw, "ewPairIndex", 0, tableCount * 2 - 1)
  const updatedBy = uid(raw.updatedBy)
  const updatedAt = intIn(raw, "updatedAt", 0, Number.MAX_SAFE_INTEGER)
  const kind = enumIn(raw, "kind", kinds)
  if (
    boardNumber === null || round === null || table === null ||
    nsPairIndex === null || ewPairIndex === null ||
    updatedBy === null || updatedAt === null || kind === null
  ) {
    return null
  }

  const validMovement = game?.movement === "howell"
    ? isHowellAssignment(game.tableCount, table, round, nsPairIndex, ewPairIndex, boardNumber)
    : isTableNumber(table) && isRoundIndex(round) && nsPairIndex === table - 1 && ewPairIndex === eastWestPairAt(table, round) - 1 && boardNumbersAt(table, round).includes(boardNumber)
  if (!validMovement) {
    return null
  }

  const base: StoredResult = {
    boardNumber,
    round,
    table,
    nsPairIndex,
    ewPairIndex,
    kind,
    updatedBy,
    updatedAt,
  }

  if (kind === "contract") {
    if (!Object.keys(raw).every((key) => ["boardNumber", "round", "table", "nsPairIndex", "ewPairIndex", "kind", "level", "strain", "doubling", "declarer", "tricks", "updatedBy", "updatedAt"].includes(key))) return null
    const level = intIn(raw, "level", 1, 7)
    const tricks = intIn(raw, "tricks", 0, 13)
    const strain = enumIn(raw, "strain", strains)
    const doubling = enumIn(raw, "doubling", doublings)
    const declarer = enumIn(raw, "declarer", declarers)
    if (level === null || tricks === null || !strain || !doubling || !declarer) return null
    return { ...base, level, tricks, strain, doubling, declarer }
  }

  if (kind === "manual") {
    if (!Object.keys(raw).every((key) => ["boardNumber", "round", "table", "nsPairIndex", "ewPairIndex", "kind", "manualScore", "updatedBy", "updatedAt"].includes(key))) return null
    const manualScore = intIn(raw, "manualScore", -9999999, 9999999)
    if (manualScore === null) return null
    return { ...base, manualScore }
  }

  return Object.keys(raw).every((key) => ["boardNumber", "round", "table", "nsPairIndex", "ewPairIndex", "kind", "updatedBy", "updatedAt"].includes(key)) ? base : null
}

export function parseStoredGame(raw: unknown): StoredGame | null {
  if (!isRecord(raw)) return null

  const status = raw.status
  if (status !== "playing" && status !== "finished" && status !== "cancelled") return null
  const directorUid = uid(raw.directorUid)
  if (!directorUid) return null
  const lastActivityAt = raw.lastActivityAt === undefined ? undefined : intIn(raw, "lastActivityAt", 0, Number.MAX_SAFE_INTEGER)
  if (lastActivityAt === null) return null
  const movement = raw.movement
  if (movement === "howell") {
    const tableCount = raw.tableCount
    if (typeof tableCount !== "number" || !isHowellTableCount(tableCount) || !Array.isArray(raw.pairs) || raw.pairs.length !== howellPairCount(tableCount)) return null
    const pairs: string[] = []
    for (const item of raw.pairs) {
      const parsedLabel = label(item)
      if (parsedLabel === null) return null
      pairs.push(parsedLabel)
    }
    const pairClaims = parsePairClaims(raw.pairClaims, tableCount * 2)
    if (!pairClaims) return null
    const absentPairs = parseAbsentPairs(raw.absentPairs, tableCount * 2)
    if (!absentPairs) return null
    return { status, pairs, directorUid, pairClaims, absentPairs, movement, tableCount, ...(lastActivityAt === undefined ? {} : { lastActivityAt }) }
  }

  if (movement !== undefined && movement !== "mitchell") return null
  if (!isRecord(raw.pairs)) return null
  const pairs: MitchellPairs = { ns: [], ew: [] }
  for (const direction of ["ns", "ew"] as const) {
    const list = raw.pairs[direction]
    if (!Array.isArray(list) || list.length !== 3) return null
    for (const item of list) {
      const parsedLabel = label(item)
      if (parsedLabel === null) return null
      pairs[direction].push(parsedLabel)
    }
  }

  const pairClaims = parsePairClaims(raw.pairClaims, 6)
  if (!pairClaims) return null
  const absentPairs = parseAbsentPairs(raw.absentPairs, 6)
  if (!absentPairs) return null
  return { status, pairs, directorUid, pairClaims, absentPairs, ...(movement === "mitchell" ? { movement } : {}), ...(lastActivityAt === undefined ? {} : { lastActivityAt }) }
}

function parsePairClaims(raw: unknown, pairCount: number): Record<string, string> | null {
  if (raw === undefined) return {}
  const pairClaims: Record<string, string> = {}
  if (!isRecord(raw)) return null
  const entries = Object.entries(raw)
  if (!entries.every(([key, value]) => Number.isInteger(Number(key)) && Number(key) >= 1 && Number(key) <= pairCount && uid(value))) return null
  for (const [pairNumber, value] of entries) pairClaims[pairNumber] = value as string
  return pairClaims
}

export function deriveNsScore(result: StoredResult): number | null {
  if (result.kind === "passed-out") return 0
  if (result.kind === "manual") return result.manualScore ?? null

  const vulnerability = boardVulnerability(result.boardNumber)
  if (
    result.level === undefined ||
    result.tricks === undefined ||
    !result.strain ||
    !result.doubling ||
    !result.declarer ||
    vulnerability === null
  ) {
    return null
  }

  const calculation = calculateDuplicateScore({
    passedOut: false,
    level: result.level,
    strain: result.strain,
    declarer: result.declarer,
    tricks: result.tricks,
    doubling: result.doubling,
    vulnerability,
  })
  return calculation.ok ? calculation.value.nsScore : null
}
