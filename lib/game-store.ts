import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore"
import { getDb, requireUserId } from "./firebase"
import {
  parseStoredGame,
  parseStoredResult,
  mitchellResultCountForGame,
  pairIndicesForNumber,
  resultDocumentId,
  type StoredGame,
  type StoredResult,
} from "./game-data"
import { howellResultCount, type HowellTableCount } from "./howell"
import type { MitchellBoardsPerRound, MitchellTableCount } from "./mitchell"

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
const CODE_LENGTH = 6
const ACTIVE_GAME_TIMEOUT_MS = 2 * 60 * 60 * 1000

export class GameStoreError extends Error {}

/** True for Firestore permission-denied failures (never shown verbatim in UI). */
export function isPermissionDenied(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false
  if ((error as { code?: unknown }).code === "permission-denied") return true
  const message = error instanceof Error ? error.message : String(error)
  return message.includes("Missing or insufficient permissions")
}

/** Re-read a single canonical result (used to verify on save denial). */
export async function fetchResult(
  gameId: string,
  boardNumber: number,
  nsPairIndex: number,
  game: StoredGame,
): Promise<StoredResult | null> {
  const db = await getDb()
  const snapshot = await getDoc(doc(db, "games", gameId, "results", resultDocumentId(boardNumber, nsPairIndex)))
  if (!snapshot.exists()) return null
  return parseStoredResult(snapshot.data(), game)
}

const ACTIVE_GAME_PATH = ["active-game", "current"] as const

export type ActiveGame = { gameId: string; directorUid: string }

function generateCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("")
}

export type NewGame =
  | { movement: "mitchell"; tableCount: MitchellTableCount; boardsPerRound: MitchellBoardsPerRound; pairs: { ns: string[]; ew: string[] } }
  | { movement: "howell"; tableCount: HowellTableCount; pairs: string[] }

export async function createGame(game: NewGame): Promise<{ gameId: string; code: string }> {
  const db = await getDb()
  const directorUid = await requireUserId()

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode()
    const gameId = doc(collection(db, "games")).id
    try {
      await runTransaction(db, async (transaction) => {
        const codeRef = doc(db, "codes", code)
        const activeGameRef = doc(db, ...ACTIVE_GAME_PATH)
        const [codeSnapshot, activeGameSnapshot] = await Promise.all([transaction.get(codeRef), transaction.get(activeGameRef)])
        if (codeSnapshot.exists()) throw new GameStoreError("Game code collision.")
        if (activeGameSnapshot.exists()) {
          const existingGameRef = doc(db, "games", activeGameSnapshot.data().gameId)
          const existingGame = await transaction.get(existingGameRef)
          const existingData = existingGame.data()
          const lastActivityAt = typeof existingData?.lastActivityAt === "number" ? existingData.lastActivityAt : existingData?.createdAt
          const inactive = existingData?.status !== "playing" || (typeof lastActivityAt === "number" && Date.now() - lastActivityAt >= ACTIVE_GAME_TIMEOUT_MS)
          if (!inactive) throw new GameStoreError("A duplicate game is already in progress. Join it with the director's code.")
          if (existingData?.status === "playing") transaction.update(existingGameRef, { status: "cancelled" })
        }
        const now = Date.now()
        transaction.set(doc(db, "games", gameId), {
          status: "playing",
          ...game,
          directorUid,
          pairClaims: {},
          resultCount: 0,
          createdAt: now,
          lastActivityAt: now,
        })
        transaction.set(codeRef, { gameId })
        transaction.set(activeGameRef, { gameId, directorUid })
      })
      return { gameId, code }
    } catch (error) {
      if (error instanceof GameStoreError && error.message.includes("already in progress")) throw error
      if (attempt === 4) throw error
    }
  }

  throw new GameStoreError("Could not create the game.")
}

export async function findGameIdByCode(code: string): Promise<string | null> {
  if (!/^[A-Z2-9]{6}$/.test(code)) return null
  const db = await getDb()
  const snapshot = await getDoc(doc(db, "codes", code))
  const data = snapshot.data()
  const gameId = typeof data?.gameId === "string" ? data.gameId : null
  if (!gameId) return null

  const gameSnapshot = await getDoc(doc(db, "games", gameId))
  return gameSnapshot.exists() ? gameId : null
}

export async function claimPair(gameId: string, pairNumber: string): Promise<void> {
  const db = await getDb()
  const uid = await requireUserId()
  try {
    await updateDoc(doc(db, "games", gameId), { [`pairClaims.${pairNumber}`]: uid, lastActivityAt: Date.now() })
  } catch (error) {
    throw new GameStoreError("Could not claim this pair.", { cause: error })
  }
}

export async function releasePair(gameId: string, pairNumber: string): Promise<void> {
  const db = await getDb()
  try {
    await updateDoc(doc(db, "games", gameId), { [`pairClaims.${pairNumber}`]: deleteField(), lastActivityAt: Date.now() })
  } catch (error) {
    throw new GameStoreError("Could not release this pair.", { cause: error })
  }
}

export async function finishGame(gameId: string): Promise<void> {
  const db = await getDb()
  const directorUid = await requireUserId()
  try {
    const gameRef = doc(db, "games", gameId)
    const gameSnapshot = await getDoc(gameRef)
    const game = parseStoredGame(gameSnapshot.data())
    const expectedResultCount = game?.movement === "howell" ? howellResultCount(game.tableCount) : game ? mitchellResultCountForGame(game) : 36
    const resultSnapshots = await getDocs(collection(db, "games", gameId, "results"))
    if (!game || resultSnapshots.size !== expectedResultCount || resultSnapshots.docs.some((result) => !parseStoredResult(result.data(), game))) {
      throw new GameStoreError(`Enter all ${expectedResultCount} valid results before revealing the game.`)
    }
    await runTransaction(db, async (transaction) => {
      const activeGameRef = doc(db, ...ACTIVE_GAME_PATH)
      const [activeGame, liveGame] = await Promise.all([transaction.get(activeGameRef), transaction.get(gameRef)])
      if (liveGame.data()?.status === "finished") return
      if (activeGame.data()?.gameId !== gameId || activeGame.data()?.directorUid !== directorUid) throw new GameStoreError("This is not the active game for this director.")
      if (liveGame.data()?.status !== "playing") throw new GameStoreError("This game is no longer available to finish.")
      transaction.update(gameRef, { status: "finished" })
      transaction.delete(activeGameRef)
    })
  } catch (error) {
    throw new GameStoreError("Could not finish and reveal this game.", { cause: error })
  }
}

export async function cancelGame(gameId: string): Promise<void> {
  const db = await getDb()
  const directorUid = await requireUserId()
  try {
    await runTransaction(db, async (transaction) => {
      const activeGameRef = doc(db, ...ACTIVE_GAME_PATH)
      const activeGame = await transaction.get(activeGameRef)
      if (activeGame.data()?.gameId !== gameId || activeGame.data()?.directorUid !== directorUid) {
        throw new GameStoreError("This is not the active game for this director.")
      }
      transaction.update(doc(db, "games", gameId), { status: "cancelled" })
      transaction.delete(activeGameRef)
    })
  } catch (error) {
    throw new GameStoreError("Could not cancel this game.", { cause: error })
  }
}

export async function fetchActiveGame(): Promise<ActiveGame | null> {
  const db = await getDb()
  const snapshot = await getDoc(doc(db, ...ACTIVE_GAME_PATH))
  const data = snapshot.data()
  const gameId = data?.gameId
  const directorUid = data?.directorUid
  return typeof gameId === "string" && typeof directorUid === "string" ? { gameId, directorUid } : null
}

export type ResultInput = Omit<StoredResult, "updatedBy" | "updatedAt">

export async function saveResult(gameId: string, input: ResultInput): Promise<void> {
  const db = await getDb()
  const uid = await requireUserId()
  const payload: StoredResult = {
    ...input,
    updatedBy: uid,
    updatedAt: Date.now(),
  }
  const resultRef = doc(db, "games", gameId, "results", resultDocumentId(input.boardNumber, input.nsPairIndex))
  const gameRef = doc(db, "games", gameId)

  // Two separate writes: the score first, then a best-effort activity
  // heartbeat. A combined batch evaluates both security paths in one request
  // and exceeds the per-request expression budget on large movements — and a
  // heartbeat hiccup must never fail a scorekeeper's save.
  try {
    await setDoc(resultRef, payload)
  } catch (error) {
    throw new GameStoreError("Could not save this result.", { cause: error })
  }
  try {
    await updateDoc(gameRef, { lastActivityAt: Date.now() })
  } catch (error) {
    console.warn("[bridge:save-result-heartbeat]", error)
  }
}

export async function fetchGame(gameId: string): Promise<StoredGame | null> {
  const db = await getDb()
  const snapshot = await getDoc(doc(db, "games", gameId))
  return snapshot.exists() ? parseStoredGame(snapshot.data()) : null
}

export type ResultsView =
  | { viewer: "director-or-finished" }
  | { viewer: "pair"; pairNumber: string }

/**
 * Pairs may only fetch rows they participate in while the game is live, so the
 * queries carry matching filters. Howell pairs play both sides across rounds
 * and need two single-field queries merged client-side (no composite index).
 * Results are sorted client-side to keep Firestore free of composite indexes.
 */
export async function fetchResults(
  gameId: string,
  view: ResultsView,
  game: StoredGame,
): Promise<StoredResult[]> {
  const db = await getDb()
  const resultsRef = collection(db, "games", gameId, "results")
  if (view.viewer === "director-or-finished") {
    const snapshot = await getDocs(resultsRef)
    return sortedResults(snapshot, game)
  }
  const indices = pairIndicesForNumber(game, view.pairNumber)
  if (!indices) return []
  const queries =
    game.movement === "howell"
      ? [
          query(resultsRef, where("nsPairIndex", "==", Number(view.pairNumber) - 1)),
          query(resultsRef, where("ewPairIndex", "==", Number(view.pairNumber) - 1)),
        ]
      : indices.nsPairIndex >= 0
        ? [query(resultsRef, where("nsPairIndex", "==", indices.nsPairIndex))]
        : [query(resultsRef, where("ewPairIndex", "==", indices.ewPairIndex))]
  const seen = new Map<string, StoredResult>()
  for (const resultsQuery of queries) {
    const snapshot = await getDocs(resultsQuery)
    for (const entry of parseSnapshots(snapshot, game)) {
      seen.set(`${entry.boardNumber}-ns-${entry.nsPairIndex}`, entry)
    }
  }
  return [...seen.values()].sort((left, right) =>
    left.boardNumber - right.boardNumber || left.nsPairIndex - right.nsPairIndex,
  )
}

function parseSnapshots(
  snapshot: { forEach: (callback: (entry: { data: () => unknown }) => void) => void },
  game: StoredGame,
): StoredResult[] {
  const results: StoredResult[] = []
  snapshot.forEach((entry) => {
    const parsed = parseStoredResult(entry.data(), game)
    if (parsed) results.push(parsed)
  })
  return results
}

function sortedResults(
  snapshot: { forEach: (callback: (entry: { data: () => unknown }) => void) => void },
  game: StoredGame,
): StoredResult[] {
  const results = parseSnapshots(snapshot, game)
  results.sort((left, right) =>
    left.boardNumber - right.boardNumber || left.nsPairIndex - right.nsPairIndex,
  )
  return results
}
