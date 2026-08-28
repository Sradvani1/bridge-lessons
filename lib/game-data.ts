import { calculateDuplicateScore, type DeclarerSide, type Doubling, type Strain } from "./bridge-scoring"
import { howellPairCount, isHowellAssignment, isHowellTableCount, type HowellTableCount } from "./howell"
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
  tables: Record<string, string>
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
  return typeof value === "string" && value.length <= 60 ? value : null
}

export function resultDocumentId(boardNumber: number, nsPairIndex: number): string {
  return `board-${boardNumber}-ns-${nsPairIndex}`
}

export function parseStoredResult(raw: unknown, game?: StoredGame): StoredResult | null {
  if (!isRecord(raw)) return null

  const tableCount = game?.movement === "howell" ? game.tableCount : 3
  const boardNumber = intIn(raw, "boardNumber", 1, game?.movement === "howell" ? tableCount === 2 ? 6 : 10 : 12)
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
    const tables = parseTables(raw.tables, tableCount)
    return tables ? { status, pairs, directorUid, tables, movement, tableCount } : null
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

  const tables = parseTables(raw.tables, 3)
  return tables ? { status, pairs, directorUid, tables, ...(movement === "mitchell" ? { movement } : {}) } : null
}

function parseTables(raw: unknown, tableCount: number): Record<string, string> | null {
  const tables: Record<string, string> = {}
  if (!isRecord(raw)) return null
  const tableEntries = Object.entries(raw)
  if (!tableEntries.every(([key, value]) => Number.isInteger(Number(key)) && Number(key) >= 1 && Number(key) <= tableCount && uid(value))) return null
  for (const [table, value] of tableEntries) tables[table] = value as string
  return tables
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
