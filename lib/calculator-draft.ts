import type { BoardVulnerability, DeclarerSide, Doubling, Strain } from "@/lib/bridge-scoring"

export type ResultKind = "contract" | "passed-out" | "manual"
export type RankingMethod = "matchpoints" | "cross-imps" | "datum-imps"

export type DraftRow = {
  id: string
  label: string
  kind: ResultKind
  level: string
  strain: Strain
  declarer: DeclarerSide
  tricks: string
  doubling: Doubling
  manualScore: string
}

export type CalculatorDraft = {
  vulnerability: BoardVulnerability
  rankingMethod: RankingMethod
  datumValue: string
  rows: DraftRow[]
}

const vulnerabilities = new Set<BoardVulnerability>(["none", "ns", "ew", "both"])
const rankingMethods = new Set<RankingMethod>(["matchpoints", "cross-imps", "datum-imps"])
const resultKinds = new Set<ResultKind>(["contract", "passed-out", "manual"])
const strains = new Set<Strain>(["C", "D", "H", "S", "NT"])
const declarers = new Set<DeclarerSide>(["ns", "ew"])
const doublings = new Set<Doubling>(["none", "doubled", "redoubled"])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function text(value: unknown, maxLength: number, pattern: RegExp) {
  return typeof value === "string" && value.length <= maxLength && pattern.test(value) ? value : ""
}

function normalizeRow(value: unknown, index: number): DraftRow | null {
  if (!isRecord(value) || typeof value.id !== "string" || value.id.length === 0 || value.id.length > 40) return null
  if (!resultKinds.has(value.kind as ResultKind)) return null
  if (!strains.has(value.strain as Strain) || !declarers.has(value.declarer as DeclarerSide) || !doublings.has(value.doubling as Doubling)) return null

  return {
    id: value.id,
    label: text(value.label, 80, /^[\s\S]*$/) || `NS Pair ${index + 1}`,
    kind: value.kind as ResultKind,
    level: text(value.level, 1, /^[1-7]?$/),
    strain: value.strain as Strain,
    declarer: value.declarer as DeclarerSide,
    tricks: text(value.tricks, 2, /^(?:[0-9]|1[0-3])?$/),
    doubling: value.doubling as Doubling,
    manualScore: text(value.manualScore, 8, /^-?\d*$/),
  }
}

export function normalizeCalculatorDraft(value: unknown): CalculatorDraft | null {
  if (!isRecord(value) || !vulnerabilities.has(value.vulnerability as BoardVulnerability) || !rankingMethods.has(value.rankingMethod as RankingMethod) || !Array.isArray(value.rows)) return null
  const rows: DraftRow[] = []
  for (const [index, rowValue] of value.rows.slice(0, 12).entries()) {
    const row = normalizeRow(rowValue, index)
    if (!row) return null
    rows.push(row)
  }
  if (rows.length < 2) return null
  const uniqueIds = new Set(rows.map((row) => row.id))
  if (uniqueIds.size !== rows.length) return null

  return {
    vulnerability: value.vulnerability as BoardVulnerability,
    rankingMethod: value.rankingMethod as RankingMethod,
    datumValue: text(value.datumValue, 8, /^-?\d*$/),
    rows,
  }
}
