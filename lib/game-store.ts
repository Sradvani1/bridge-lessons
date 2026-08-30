import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore"
import { getDb, requireUserId } from "./firebase"
import {
  parseStoredGame,
  parseStoredResult,
  resultDocumentId,
  type StoredGame,
  type StoredResult,
} from "./game-data"
import { howellResultCount, type HowellTableCount } from "./howell"

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
const CODE_LENGTH = 6
const ACTIVE_GAME_TIMEOUT_MS = 2 * 60 * 60 * 1000

export class GameStoreError extends Error {}

const ACTIVE_GAME_PATH = ["active-game", "current"] as const

export type ActiveGame = { gameId: string; directorUid: string }

function generateCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join("")
}

export type NewGame =
  | { movement: "mitchell"; pairs: { ns: string[]; ew: string[] } }
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
          tables: {},
          resultCount: 0,
          createdAt: now,
          lastActivityAt: now,
        })
        transaction.set(codeRef, { gameId })
        transaction.set(activeGameRef, { gameId, directorUid })
      })
      return { gameId, code }
    } catch (error) {
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

export async function claimTable(gameId: string, table: number): Promise<void> {
  const db = await getDb()
  const uid = await requireUserId()
  try {
    await updateDoc(doc(db, "games", gameId), { [`tables.${table}`]: uid, lastActivityAt: Date.now() })
  } catch (error) {
    throw new GameStoreError("Could not claim this table.", { cause: error })
  }
}

export async function releaseTable(gameId: string, table: number): Promise<void> {
  const db = await getDb()
  try {
    await updateDoc(doc(db, "games", gameId), { [`tables.${table}`]: deleteField(), lastActivityAt: Date.now() })
  } catch (error) {
    throw new GameStoreError("Could not release this table.", { cause: error })
  }
}

export async function finishGame(gameId: string): Promise<void> {
  const db = await getDb()
  const directorUid = await requireUserId()
  try {
    const gameRef = doc(db, "games", gameId)
    const gameSnapshot = await getDoc(gameRef)
    const game = parseStoredGame(gameSnapshot.data())
    const expectedResultCount = game?.movement === "howell" ? howellResultCount(game.tableCount) : 36
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

export function subscribeActiveGame(
  onData: (game: ActiveGame | null) => void,
  onError: (error: Error) => void,
): () => void {
  let cancelled = false
  let unsubscribe = () => {}
  getDb()
    .then((db) => {
      const nextUnsubscribe = onSnapshot(doc(db, ...ACTIVE_GAME_PATH), (snapshot) => {
        const data = snapshot.data()
        const gameId = data?.gameId
        const directorUid = data?.directorUid
        onData(typeof gameId === "string" && typeof directorUid === "string" ? { gameId, directorUid } : null)
      }, onError)
      if (cancelled) nextUnsubscribe()
      else unsubscribe = nextUnsubscribe
    })
    .catch(onError)
  return () => {
    cancelled = true
    unsubscribe()
  }
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

  try {
    const batch = writeBatch(db)
    batch.set(resultRef, payload)
    batch.update(gameRef, { lastActivityAt: Date.now() })
    await batch.commit()
  } catch (error) {
    throw new GameStoreError("Could not save this result.", { cause: error })
  }
}

export function subscribeGame(
  gameId: string,
  onData: (game: StoredGame | null, hasPendingWrites: boolean) => void,
  onError: (error: Error) => void,
): () => void {
  let cancelled = false
  let unsubscribe = () => {}
  getDb()
    .then((db) => {
      const nextUnsubscribe = onSnapshot(
        doc(db, "games", gameId),
        { includeMetadataChanges: true },
        (snapshot) => onData(snapshot.exists() ? parseStoredGame(snapshot.data()) : null, snapshot.metadata.hasPendingWrites),
        onError,
      )
      if (cancelled) nextUnsubscribe()
      else unsubscribe = nextUnsubscribe
    })
    .catch(onError)
  return () => {
    cancelled = true
    unsubscribe()
  }
}

export type ResultsView =
  | { viewer: "director-or-finished" }
  | { viewer: "table"; table: number }

/**
 * Table devices may only fetch their own rows while the game is live, so the
 * query must carry the matching filter. Results are sorted client-side to keep
 * Firestore free of composite indexes.
 */
export function subscribeResults(
  gameId: string,
  view: ResultsView,
  game: StoredGame,
  onData: (results: StoredResult[], hasPendingWrites: boolean) => void,
  onError: (error: Error) => void,
): () => void {
  let cancelled = false
  let unsubscribe = () => {}
  getDb()
    .then((db) => {
      const constraints = view.viewer === "table"
        ? [where(game.movement === "howell" ? "table" : "nsPairIndex", "==", game.movement === "howell" ? view.table : view.table - 1)]
        : []
      const nextUnsubscribe = onSnapshot(
        query(collection(db, "games", gameId, "results"), ...constraints),
        { includeMetadataChanges: true },
        (snapshot) => {
          const results: StoredResult[] = []
          snapshot.forEach((entry) => {
            const parsed = parseStoredResult(entry.data(), game)
            if (parsed) results.push(parsed)
          })
          results.sort((left, right) =>
            left.boardNumber - right.boardNumber || left.nsPairIndex - right.nsPairIndex,
          )
          onData(results, snapshot.metadata.hasPendingWrites)
        },
        onError,
      )
      if (cancelled) nextUnsubscribe()
      else unsubscribe = nextUnsubscribe
    })
    .catch(onError)
  return () => {
    cancelled = true
    unsubscribe()
  }
}
