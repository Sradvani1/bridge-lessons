export type HowellTableCount = 2 | 3

export type HowellAssignment = {
  table: number
  round: number
  nsPairIndex: number
  ewPairIndex: number
  boardNumbers: number[]
}

const PAIRINGS: Record<HowellTableCount, readonly (readonly [number, number][])[]> = {
  2: [
    [[0, 3], [1, 2]],
    [[0, 2], [3, 1]],
    [[0, 1], [2, 3]],
  ],
  3: [
    [[5, 0], [2, 3], [4, 1]],
    [[5, 1], [3, 4], [0, 2]],
    [[5, 2], [4, 0], [1, 3]],
    [[5, 3], [0, 1], [2, 4]],
    [[5, 4], [1, 2], [3, 0]],
  ],
}

const BOARDS_PER_ROUND: Record<HowellTableCount, number> = { 2: 2, 3: 3 }

// The 3-table schedule follows the printed Baron Barclay 6-pair movement cards.
const BOARD_GROUPS: Record<HowellTableCount, readonly number[][]> = {
  2: [[0, 0], [1, 1], [2, 2]],
  3: [[0, 1, 3], [1, 2, 3], [2, 1, 0], [3, 2, 0], [4, 4, 4]],
}

export function isHowellTableCount(value: number): value is HowellTableCount {
  return value === 2 || value === 3
}

export function howellRoundCount(tableCount: HowellTableCount): number {
  return PAIRINGS[tableCount].length
}

export function howellPairCount(tableCount: HowellTableCount): number {
  return tableCount * 2
}

export function howellBoardCount(tableCount: HowellTableCount): number {
  return howellRoundCount(tableCount) * BOARDS_PER_ROUND[tableCount]
}

export function howellResultCount(tableCount: HowellTableCount): number {
  return tableCount * howellBoardCount(tableCount)
}

export function howellAssignments(tableCount: HowellTableCount): HowellAssignment[] {
  return PAIRINGS[tableCount].flatMap((pairings, round) => pairings.map(([nsPairIndex, ewPairIndex], tableIndex) => {
    const boardsPerRound = BOARDS_PER_ROUND[tableCount]
    const firstBoard = BOARD_GROUPS[tableCount][round][tableIndex] * boardsPerRound + 1
    return { table: tableIndex + 1, round, nsPairIndex, ewPairIndex, boardNumbers: Array.from({ length: boardsPerRound }, (_, index) => firstBoard + index) }
  }))
}

export function howellAssignmentAt(tableCount: HowellTableCount, table: number, round: number): HowellAssignment | null {
  return howellAssignments(tableCount).find((assignment) => assignment.table === table && assignment.round === round) ?? null
}

export function isHowellAssignment(
  tableCount: HowellTableCount,
  table: number,
  round: number,
  nsPairIndex: number,
  ewPairIndex: number,
  boardNumber: number,
): boolean {
  const assignment = howellAssignmentAt(tableCount, table, round)
  return assignment !== null
    && assignment.nsPairIndex === nsPairIndex
    && assignment.ewPairIndex === ewPairIndex
    && assignment.boardNumbers.includes(boardNumber)
}
