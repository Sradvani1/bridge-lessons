import { calculateDuplicateScore, type DeclarerSide, type Doubling, type Strain } from "./bridge-scoring"
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

export type GamePairs = {
  ns: string[]
  ew: string[]
}

export type StoredGame = {
  status: GameStatus
  pairs: GamePairs
  directorUid: string
  tables: Record<string, string>
}

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

export function parseStoredResult(raw: unknown): StoredResult | null {
  if (!isRecord(raw)) return null

  const boardNumber = intIn(raw, "boardNumber", 1, 12)
  const round = intIn(raw, "round", 0, 2)
  const table = intIn(raw, "table", 1, 3)
  const nsPairIndex = intIn(raw, "nsPairIndex", 0, 2)
  const ewPairIndex = intIn(raw, "ewPairIndex", 0, 2)
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

  if (!isTableNumber(table) || !isRoundIndex(round) || nsPairIndex !== table - 1 || ewPairIndex !== eastWestPairAt(table, round) - 1 || !boardNumbersAt(table, round).includes(boardNumber)) {
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
  if (!isRecord(raw.pairs)) return null
  const pairs: GamePairs = { ns: [], ew: [] }
  for (const direction of ["ns", "ew"] as const) {
    const list = raw.pairs[direction]
    if (!Array.isArray(list) || list.length !== 3) return null
    for (const item of list) {
      const parsedLabel = label(item)
      if (parsedLabel === null) return null
      pairs[direction].push(parsedLabel)
    }
  }

  const tables: Record<string, string> = {}
  if (!isRecord(raw.tables)) return null
  const tableEntries = Object.entries(raw.tables)
  const usesCurrentTableOwnership = tableEntries.every(([key, value]) => ["1", "2", "3"].includes(key) && uid(value))
  if (usesCurrentTableOwnership) {
    for (const [table, value] of tableEntries) tables[table] = value as string
  } else {
    // Games created before exclusive table ownership remain viewable.
    for (const [key, value] of tableEntries) {
      const parsedUid = uid(key)
      const table = typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 3 ? value : null
      if (!parsedUid || table === null || tables[String(table)]) return null
      tables[String(table)] = parsedUid
    }
  }

  return { status, pairs, directorUid, tables }
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
