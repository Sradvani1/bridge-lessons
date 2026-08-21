export type BoardVulnerability = "none" | "ns" | "ew" | "both"
export type DeclarerSide = "ns" | "ew"
export type Strain = "C" | "D" | "H" | "S" | "NT"
export type Doubling = "none" | "doubled" | "redoubled"

export type ContractInput = {
  passedOut: boolean
  level: number
  strain: Strain
  declarer: DeclarerSide
  tricks: number
  doubling: Doubling
  vulnerability: BoardVulnerability
}

export type ScoreBreakdown = {
  nsScore: number
  contractPoints: number
  bonusPoints: number
  overtrickPoints: number
  penaltyPoints: number
  isVulnerable: boolean
}

export type ScoreCalculation =
  | { ok: true; value: ScoreBreakdown }
  | { ok: false; error: string }

export type BoardResult = {
  id: string
  label: string
  nsScore: number
}

export type RankedBoardResult = BoardResult & {
  matchpoints: number
  matchpointPercent: number | null
  matchpointRank: number
  crossImps: number
  crossImpAverage: number | null
  crossImpRank: number
  datumImps: number | null
  datumImpRank: number | null
}

const strainPoints: Record<Exclude<Strain, "NT">, number> = {
  C: 20,
  D: 20,
  H: 30,
  S: 30,
}

const multiplier: Record<Doubling, number> = {
  none: 1,
  doubled: 2,
  redoubled: 4,
}

const strains = ["C", "D", "H", "S", "NT"] as const
const declarerSides = ["ns", "ew"] as const
const doublings = ["none", "doubled", "redoubled"] as const
const vulnerabilities = ["none", "ns", "ew", "both"] as const

function isOneOf<T extends string>(value: string, values: readonly T[]): value is T {
  return values.includes(value as T)
}

function isVulnerable(vulnerability: BoardVulnerability, declarer: DeclarerSide) {
  return vulnerability === "both" || vulnerability === declarer
}

function undertrickPenalty(undertricks: number, vulnerable: boolean, doubling: Doubling) {
  if (doubling === "none") {
    return undertricks * (vulnerable ? 100 : 50)
  }

  let doubledPenalty: number
  if (vulnerable) {
    doubledPenalty = 200 + (undertricks - 1) * 300
  } else {
    doubledPenalty = 100
    if (undertricks > 1) doubledPenalty += Math.min(undertricks - 1, 2) * 200
    if (undertricks > 3) doubledPenalty += (undertricks - 3) * 300
  }

  return doubling === "redoubled" ? doubledPenalty * 2 : doubledPenalty
}

export function calculateDuplicateScore(input: ContractInput): ScoreCalculation {
  if (!isOneOf(input.strain, strains)) return { ok: false, error: "Contract strain is invalid." }
  if (!isOneOf(input.declarer, declarerSides)) return { ok: false, error: "Declarer side is invalid." }
  if (!isOneOf(input.doubling, doublings)) return { ok: false, error: "Doubling status is invalid." }
  if (!isOneOf(input.vulnerability, vulnerabilities)) return { ok: false, error: "Board vulnerability is invalid." }

  if (input.passedOut) {
    return {
      ok: true,
      value: {
        nsScore: 0,
        contractPoints: 0,
        bonusPoints: 0,
        overtrickPoints: 0,
        penaltyPoints: 0,
        isVulnerable: isVulnerable(input.vulnerability, input.declarer),
      },
    }
  }

  if (!Number.isInteger(input.level) || input.level < 1 || input.level > 7) {
    return { ok: false, error: "Contract level must be between 1 and 7." }
  }
  if (!Number.isInteger(input.tricks) || input.tricks < 0 || input.tricks > 13) {
    return { ok: false, error: "Tricks made must be between 0 and 13." }
  }

  const vulnerable = isVulnerable(input.vulnerability, input.declarer)
  const requiredTricks = input.level + 6
  const made = input.tricks >= requiredTricks

  if (!made) {
    const penaltyPoints = undertrickPenalty(requiredTricks - input.tricks, vulnerable, input.doubling)
    const score = input.declarer === "ns" ? -penaltyPoints : penaltyPoints
    return {
      ok: true,
      value: {
        nsScore: score,
        contractPoints: 0,
        bonusPoints: 0,
        overtrickPoints: 0,
        penaltyPoints: -penaltyPoints,
        isVulnerable: vulnerable,
      },
    }
  }

  const undoubledContractPoints =
    input.strain === "NT" ? 40 + (input.level - 1) * 30 : strainPoints[input.strain] * input.level
  const contractPoints = undoubledContractPoints * multiplier[input.doubling]
  const gameBonus = contractPoints >= 100 ? (vulnerable ? 500 : 300) : 50
  const slamBonus = input.level === 6 ? (vulnerable ? 750 : 500) : input.level === 7 ? (vulnerable ? 1500 : 1000) : 0
  const insultBonus = input.doubling === "doubled" ? 50 : input.doubling === "redoubled" ? 100 : 0
  const overtricks = input.tricks - requiredTricks
  const undoubledOvertrick = input.strain === "C" || input.strain === "D" ? 20 : 30
  const overtrickPoints =
    input.doubling === "none"
      ? overtricks * undoubledOvertrick
      : overtricks * (vulnerable ? 200 : 100) * (input.doubling === "redoubled" ? 2 : 1)
  const bonusPoints = gameBonus + slamBonus + insultBonus
  const declarerScore = contractPoints + bonusPoints + overtrickPoints

  return {
    ok: true,
    value: {
      nsScore: input.declarer === "ns" ? declarerScore : -declarerScore,
      contractPoints,
      bonusPoints,
      overtrickPoints,
      penaltyPoints: 0,
      isVulnerable: vulnerable,
    },
  }
}

export function scoreToImps(scoreDifference: number) {
  if (!Number.isFinite(scoreDifference)) {
    throw new RangeError("IMP conversion requires a finite score difference.")
  }

  const difference = Math.abs(scoreDifference)
  const thresholds = [10, 40, 80, 120, 160, 210, 260, 310, 360, 420, 490, 590, 740, 890, 1090, 1290, 1490, 1740, 1990, 2240, 2490, 2990, 3490, 3990]
  let imps = thresholds.findIndex((threshold) => difference <= threshold)
  if (imps === -1) imps = 24
  return Math.sign(scoreDifference) * imps
}

function competitionRanks(values: readonly number[]) {
  return values.map((value) => 1 + values.filter((other) => other > value).length)
}

export function rankBoardResults(results: readonly BoardResult[], datum: number | null = null): RankedBoardResult[] {
  const ids = new Set<string>()
  for (const result of results) {
    if (ids.has(result.id)) throw new Error("Board result IDs must be unique.")
    if (!Number.isInteger(result.nsScore)) throw new RangeError("Board result scores must be whole numbers.")
    ids.add(result.id)
  }
  if (datum !== null && !Number.isInteger(datum)) {
    throw new RangeError("Datum score must be a whole number.")
  }

  const matchpointMaximum = (results.length - 1) * 2
  const matchpoints = results.map((result) =>
    results.reduce((total, other) => total + (result.nsScore > other.nsScore ? 2 : result.nsScore === other.nsScore ? 1 : 0), -1),
  )
  const crossImps = results.map((result) =>
    results.reduce((total, other) => (other.id === result.id ? total : total + scoreToImps(result.nsScore - other.nsScore)), 0),
  )
  const datumImps = datum === null ? null : results.map((result) => scoreToImps(result.nsScore - datum))
  const matchpointRanks = competitionRanks(matchpoints)
  const crossImpRanks = competitionRanks(crossImps)
  const datumImpRanks = datumImps === null ? null : competitionRanks(datumImps)

  return results.map((result, index) => ({
    ...result,
    matchpoints: matchpoints[index],
    matchpointPercent: matchpointMaximum > 0 ? (matchpoints[index] / matchpointMaximum) * 100 : null,
    matchpointRank: matchpointRanks[index],
    crossImps: crossImps[index],
    crossImpAverage: results.length > 1 ? crossImps[index] / (results.length - 1) : null,
    crossImpRank: crossImpRanks[index],
    datumImps: datumImps?.[index] ?? null,
    datumImpRank: datumImpRanks?.[index] ?? null,
  }))
}
