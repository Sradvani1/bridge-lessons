import assert from "node:assert/strict"
import { after, afterEach, before, test } from "node:test"
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing"
import { collection, deleteField, doc, getDoc, getDocs, query, runTransaction, setDoc, updateDoc, where, writeBatch } from "firebase/firestore"
import { boardNumbersAt, eastWestPairAt, mitchellResultCount, type MitchellBoardsPerRound, type MitchellTableCount } from "../lib/mitchell"
import { howellAssignments, howellResultCount } from "../lib/howell"

const projectId = "demo-bridge"
const gameId = "game-1"
let environment: RulesTestEnvironment

function game(status: "playing" | "finished" = "playing") {
  const createdAt = Date.now()
  return {
    status,
    pairs: { ns: ["NS 1", "NS 2", "NS 3"], ew: ["EW 1", "EW 2", "EW 3"] },
    directorUid: "director",
    pairClaims: {},
    resultCount: 0,
    createdAt,
    lastActivityAt: createdAt,
  }
}

function howellGame(tableCount: 2 | 3) {
  const createdAt = Date.now()
  return {
    status: "playing" as const,
    movement: "howell",
    tableCount,
    pairs: Array.from({ length: tableCount * 2 }, (_, index) => `Pair ${index + 1}`),
    directorUid: "director",
    pairClaims: {},
    resultCount: 0,
    createdAt,
    lastActivityAt: createdAt,
  }
}

function mitchellGame(tableCount: MitchellTableCount, boardsPerRound: MitchellBoardsPerRound = 4) {
  const createdAt = Date.now()
  return {
    status: "playing" as const,
    movement: "mitchell",
    tableCount,
    boardsPerRound,
    pairs: {
      ns: Array.from({ length: tableCount }, (_, index) => `NS ${index + 1}`),
      ew: Array.from({ length: tableCount }, (_, index) => `EW ${index + 1}`),
    },
    directorUid: "director",
    pairClaims: {},
    resultCount: 0,
    createdAt,
    lastActivityAt: createdAt,
  }
}

function result(overrides: Record<string, unknown> = {}) {
  return {
    boardNumber: 1,
    round: 0,
    table: 1,
    nsPairIndex: 0,
    ewPairIndex: 0,
    kind: "passed-out",
    updatedBy: "pair-one",
    updatedAt: 1,
    ...overrides,
  }
}

async function seed(data: Record<string, unknown> = game()) {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "games", gameId), data)
  })
}

async function seedActiveGame() {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "active-game", "current"), { gameId, directorUid: "director" })
  })
}

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await (await import("node:fs/promises")).readFile("firestore.rules", "utf8") },
  })
})

afterEach(async () => environment.clearFirestore())
after(async () => environment.cleanup())

test("allows atomic game and code creation only for the director", async () => {
  const director = environment.authenticatedContext("director").firestore()
  const batch = writeBatch(director)
  batch.set(doc(director, "games", "game-created"), game())
  batch.set(doc(director, "codes", "ABC234"), { gameId: "game-created" })
  batch.set(doc(director, "active-game", "current"), { gameId: "game-created", directorUid: "director" })
  await assertSucceeds(batch.commit())

  const player = environment.authenticatedContext("player").firestore()
  await assertFails(setDoc(doc(player, "codes", "DEF567"), { gameId: "game-created" }))
})

test("allows atomic Howell game creation for the selected table count", async () => {
  const director = environment.authenticatedContext("director").firestore()
  const batch = writeBatch(director)
  batch.set(doc(director, "games", "howell-created"), howellGame(2))
  batch.set(doc(director, "codes", "ABC234"), { gameId: "howell-created" })
  batch.set(doc(director, "active-game", "current"), { gameId: "howell-created", directorUid: "director" })
  await assertSucceeds(batch.commit())
})

test("allows atomic Mitchell game creation with three or five tables", async () => {
  for (const tableCount of [3, 5] as const) {
    for (const boardsPerRound of [3, 4] as const) {
      await environment.clearFirestore()
      const director = environment.authenticatedContext("director").firestore()
      const batch = writeBatch(director)
      batch.set(doc(director, "games", `mitchell-${tableCount}-${boardsPerRound}`), mitchellGame(tableCount, boardsPerRound))
      batch.set(doc(director, "codes", "ABC234"), { gameId: `mitchell-${tableCount}-${boardsPerRound}` })
      batch.set(doc(director, "active-game", "current"), { gameId: `mitchell-${tableCount}-${boardsPerRound}`, directorUid: "director" })
      await assertSucceeds(batch.commit())
    }
  }
})

test("rejects Mitchell games with mismatched tables, boards, or pair names", async () => {
  const director = environment.authenticatedContext("director").firestore()
  const cases: Record<string, unknown>[] = [
    { ...mitchellGame(3, 4), tableCount: 2 },
    { ...mitchellGame(3, 4), tableCount: 4 },
    { ...mitchellGame(3, 4), tableCount: 7 },
    { ...mitchellGame(3, 4), boardsPerRound: 5 },
    { ...mitchellGame(2, 4) },
    { ...mitchellGame(4, 4) },
    { ...mitchellGame(3, 4), pairs: { ns: ["NS 1", "NS 2"], ew: ["EW 1", "EW 2", "EW 3"] } },
    { ...mitchellGame(3, 4), pairs: { ns: ["NS 1", "NS 2", "NS 3", ""], ew: ["EW 1", "EW 2", "EW 3", "EW 4"] } },
  ]
  for (const [index, data] of cases.entries()) {
    await environment.clearFirestore()
    const batch = writeBatch(director)
    batch.set(doc(director, "games", `bad-mitchell-${index}`), data)
    batch.set(doc(director, "codes", "ABC234"), { gameId: `bad-mitchell-${index}` })
    batch.set(doc(director, "active-game", "current"), { gameId: `bad-mitchell-${index}`, directorUid: "director" })
    await assertFails(batch.commit())
  }
})

test("gates pair claims by Mitchell table count", async () => {
  await seed(mitchellGame(2))
  const small = [1, 2, 3, 4, 5].map((n) => environment.authenticatedContext(`small-${n}`).firestore())
  for (const [index, db] of small.entries()) {
    const pairNumber = index + 1
    if (pairNumber <= 4) await assertSucceeds(updateDoc(doc(db, "games", gameId), { [`pairClaims.${pairNumber}`]: `small-${pairNumber}`, lastActivityAt: Date.now() }))
    else await assertFails(updateDoc(doc(db, "games", gameId), { [`pairClaims.${pairNumber}`]: `small-${pairNumber}`, lastActivityAt: Date.now() }))
  }

  await environment.clearFirestore()
  await seed(mitchellGame(4))
  for (let pairNumber = 1; pairNumber <= 8; pairNumber += 1) {
    const db = environment.authenticatedContext(`large-${pairNumber}`).firestore()
    await assertSucceeds(updateDoc(doc(db, "games", gameId), { [`pairClaims.${pairNumber}`]: `large-${pairNumber}`, lastActivityAt: Date.now() }))
  }

  await environment.clearFirestore()
  await seed(mitchellGame(5))
  for (let pairNumber = 1; pairNumber <= 10; pairNumber += 1) {
    const db = environment.authenticatedContext(`huge-${pairNumber}`).firestore()
    await assertSucceeds(updateDoc(doc(db, "games", gameId), { [`pairClaims.${pairNumber}`]: `huge-${pairNumber}`, lastActivityAt: Date.now() }))
  }

  await environment.clearFirestore()
  await seed()
  const legacySeven = environment.authenticatedContext("legacy-seven").firestore()
  await assertFails(updateDoc(doc(legacySeven, "games", gameId), { "pairClaims.7": "legacy-seven", lastActivityAt: Date.now() }))
  const legacyNine = environment.authenticatedContext("legacy-nine").firestore()
  await assertFails(updateDoc(doc(legacyNine, "games", gameId), { "pairClaims.9": "legacy-nine", lastActivityAt: Date.now() }))
})

test("rejects out-of-range rounds and boards on five-table games", async () => {
  await seed(mitchellGame(5, 4))
  const one = environment.authenticatedContext("pair-one").firestore()
  await assertSucceeds(updateDoc(doc(one, "games", gameId), { "pairClaims.1": "pair-one", lastActivityAt: Date.now() }))
  // Pair 1 (North-South 1) plays table 1 every round; round 5 and board 21 are out of range.
  await assertFails(setDoc(doc(one, "games", gameId, "results", "board-1-ns-0"), result({ boardNumber: 1, round: 5, table: 1, nsPairIndex: 0, ewPairIndex: 0, updatedBy: "pair-one" })))
  await assertFails(setDoc(doc(one, "games", gameId, "results", "board-21-ns-0"), result({ boardNumber: 21, round: 4, table: 1, nsPairIndex: 0, ewPairIndex: 1, updatedBy: "pair-one" })))
})

test("rejects a second concurrent game", async () => {
  const director = environment.authenticatedContext("director").firestore()
  const first = writeBatch(director)
  first.set(doc(director, "games", "game-one"), game())
  first.set(doc(director, "codes", "ABC234"), { gameId: "game-one" })
  first.set(doc(director, "active-game", "current"), { gameId: "game-one", directorUid: "director" })
  await assertSucceeds(first.commit())

  const second = writeBatch(director)
  second.set(doc(director, "games", "game-two"), game())
  second.set(doc(director, "codes", "DEF567"), { gameId: "game-two" })
  second.set(doc(director, "active-game", "current"), { gameId: "game-two", directorUid: "director" })
  await assertFails(second.commit())
})

test("replaces an active game after two hours without activity", async () => {
  const staleGame = { ...game(), lastActivityAt: Date.now() - (2 * 60 * 60 * 1000) - 1 }
  await seed(staleGame)
  await seedActiveGame()
  const replacement = environment.authenticatedContext("replacement-director").firestore()
  const replacementGameId = "replacement-game"
  await assertFails(updateDoc(doc(replacement, "games", gameId), { status: "cancelled" }))
  await assertSucceeds(runTransaction(replacement, async (transaction) => {
    const active = await transaction.get(doc(replacement, "active-game", "current"))
    assert.equal(active.data()?.gameId, gameId)
    const now = Date.now()
    const replacementGame = { ...game(), directorUid: "replacement-director", createdAt: now, lastActivityAt: now }
    transaction.update(doc(replacement, "games", gameId), { status: "cancelled" })
    transaction.set(doc(replacement, "games", replacementGameId), replacementGame)
    transaction.set(doc(replacement, "codes", "DEF567"), { gameId: replacementGameId })
    transaction.set(doc(replacement, "active-game", "current"), { gameId: replacementGameId, directorUid: "replacement-director" })
  }))
  const oldPair = environment.authenticatedContext("old-pair").firestore()
  await assertFails(updateDoc(doc(oldPair, "games", gameId), { "pairClaims.1": "old-pair", lastActivityAt: Date.now() }))
})

test("allows signed-in facilitators to read the active game reference", async () => {
  await seed()
  await seedActiveGame()
  const director = environment.authenticatedContext("director").firestore()
  const visitor = environment.authenticatedContext("visitor").firestore()
  await assertSucceeds(getDoc(doc(director, "active-game", "current")))
  await assertSucceeds(getDoc(doc(visitor, "active-game", "current")))
})

test("initializes legacy activity and rejects future timestamps", async () => {
  const legacy: Record<string, unknown> = game()
  delete legacy.lastActivityAt
  await seed(legacy)
  const pairOne = environment.authenticatedContext("pair-one").firestore()
  await assertSucceeds(updateDoc(doc(pairOne, "games", gameId), { "pairClaims.1": "pair-one", lastActivityAt: Date.now() }))

  const future = Date.now() + (10 * 60 * 1000)
  const pairTwo = environment.authenticatedContext("pair-two").firestore()
  await assertFails(updateDoc(doc(pairTwo, "games", gameId), { "pairClaims.2": "pair-two", lastActivityAt: future }))
})

test("rejects a game created with a future activity timestamp", async () => {
  const director = environment.authenticatedContext("director").firestore()
  const batch = writeBatch(director)
  const futureGame = { ...game(), lastActivityAt: Date.now() + (10 * 60 * 1000) }
  batch.set(doc(director, "games", "future-game"), futureGame)
  batch.set(doc(director, "codes", "ABC234"), { gameId: "future-game" })
  batch.set(doc(director, "active-game", "current"), { gameId: "future-game", directorUid: "director" })
  await assertFails(batch.commit())
})

test("requires an atomic active-game release before finishing or cancelling", async () => {
  await seed()
  await seedActiveGame()
  const director = environment.authenticatedContext("director").firestore()
  await assertFails(updateDoc(doc(director, "games", gameId), { status: "finished" }))

  const finish = writeBatch(director)
  finish.update(doc(director, "games", gameId), { status: "finished" })
  finish.delete(doc(director, "active-game", "current"))
  await assertSucceeds(finish.commit())
})

test("allows the director to finish a Howell game", async () => {
  await seed(howellGame(2))
  await seedActiveGame()
  const director = environment.authenticatedContext("director").firestore()
  const finish = writeBatch(director)
  finish.update(doc(director, "games", gameId), { status: "finished" })
  finish.delete(doc(director, "active-game", "current"))
  await assertSucceeds(finish.commit())
})

test("prevents pair devices from changing result totals", async () => {
  await seed({ ...game(), pairClaims: { "1": "pair-one" } })
  const pairOne = environment.authenticatedContext("pair-one").firestore()
  await assertFails(updateDoc(doc(pairOne, "games", gameId), { resultCount: 1, lastActivityAt: Date.now() }))
})

test("allows only one device to claim each pair, and one pair per device", async () => {
  await seed()
  const pairOne = environment.authenticatedContext("pair-one").firestore()
  const pairTwo = environment.authenticatedContext("pair-two").firestore()
  await assertSucceeds(updateDoc(doc(pairOne, "games", gameId), { "pairClaims.1": "pair-one", lastActivityAt: Date.now() }))
  await assertFails(updateDoc(doc(pairTwo, "games", gameId), { "pairClaims.1": "pair-two", lastActivityAt: Date.now() }))
  await assertSucceeds(updateDoc(doc(pairTwo, "games", gameId), { "pairClaims.2": "pair-two", lastActivityAt: Date.now() }))
  await assertFails(updateDoc(doc(pairTwo, "games", gameId), { "pairClaims.3": "pair-two", lastActivityAt: Date.now() }))
})

test("lets a claimant release its own pair and the director release any pair", async () => {
  await seed({ ...game(), pairClaims: { "1": "pair-one", "2": "pair-two" } })
  const pairOne = environment.authenticatedContext("pair-one").firestore()
  const pairTwo = environment.authenticatedContext("pair-two").firestore()
  const director = environment.authenticatedContext("director").firestore()
  // A device cannot release another pair.
  await assertFails(updateDoc(doc(pairOne, "games", gameId), { "pairClaims.2": deleteField(), lastActivityAt: Date.now() }))
  // A device can release its own pair (wrong-tap escape hatch).
  await assertSucceeds(updateDoc(doc(pairOne, "games", gameId), { "pairClaims.1": deleteField(), lastActivityAt: Date.now() }))
  // The director can release any pair.
  await assertSucceeds(updateDoc(doc(director, "games", gameId), { "pairClaims.2": deleteField(), lastActivityAt: Date.now() }))
  // A released device can no longer write.
  await assertFails(setDoc(doc(pairTwo, "games", gameId, "results", "board-1-ns-1"), result({ boardNumber: 1, round: 0, table: 2, nsPairIndex: 1, ewPairIndex: 1, updatedBy: "pair-two" })))
})

test("enforces Howell pair counts and pair-scoped live results", async () => {
  await seed(howellGame(2))
  const pairOne = environment.authenticatedContext("pair-one").firestore()
  const pairTwo = environment.authenticatedContext("pair-two").firestore()
  const pairFive = environment.authenticatedContext("pair-five").firestore()
  await assertSucceeds(updateDoc(doc(pairOne, "games", gameId), { "pairClaims.1": "pair-one", lastActivityAt: Date.now() }))
  await assertSucceeds(updateDoc(doc(pairTwo, "games", gameId), { "pairClaims.2": "pair-two", lastActivityAt: Date.now() }))
  // A two-table Howell game has only four pairs.
  await assertFails(updateDoc(doc(pairFive, "games", gameId), { "pairClaims.5": "pair-five", lastActivityAt: Date.now() }))
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "games", gameId, "results", "board-1-ns-0"), result({ ewPairIndex: 3 }))
  })
  await assertSucceeds(getDocs(query(collection(pairOne, "games", gameId, "results"), where("nsPairIndex", "==", 0))))
  await assertFails(getDocs(query(collection(pairTwo, "games", gameId, "results"), where("nsPairIndex", "==", 0))))
})

test("accepts only scheduled Howell results", async () => {
  await seed(howellGame(3))
  const director = environment.authenticatedContext("director").firestore()
  await assertSucceeds(setDoc(doc(director, "games", gameId, "results", "board-1-ns-5"), result({ nsPairIndex: 5, ewPairIndex: 0, updatedBy: "director" })))
  await assertFails(setDoc(doc(director, "games", gameId, "results", "board-1-ns-5"), result({ nsPairIndex: 5, ewPairIndex: 4, updatedBy: "director" })))
})

test("allows a pair device to write boards it plays, home or away", async () => {
  await seed({ ...howellGame(2), pairClaims: { "2": "pair-two" } })
  const pairTwo = environment.authenticatedContext("pair-two").firestore()
  const write = writeBatch(pairTwo)
  write.set(doc(pairTwo, "games", gameId, "results", "board-5-ns-1"), result({ boardNumber: 5, round: 1, table: 2, nsPairIndex: 1, ewPairIndex: 3, updatedBy: "pair-two" }))
  await assertSucceeds(write.commit())
})

test("allows a claimed pair to read a new result before creating it", async () => {
  await seed({ ...game(), pairClaims: { "1": "pair-one" } })
  const pairOne = environment.authenticatedContext("pair-one").firestore()
  const resultRef = doc(pairOne, "games", gameId, "results", "board-1-ns-0")
  await assertSucceeds(runTransaction(pairOne, async (transaction) => {
    const existing = await transaction.get(resultRef)
    assert.equal(existing.exists(), false)
  }))

  const unclaimed = environment.authenticatedContext("unclaimed").firestore()
  await assertFails(runTransaction(unclaimed, async (transaction) => {
    await transaction.get(doc(unclaimed, "games", gameId, "results", "board-5-ns-0"))
  }))
})

test("rehearses every pair through complete two- and three-table Howell games", async () => {
  for (const tableCount of [2, 3] as const) {
    await environment.clearFirestore()
    await seed(howellGame(tableCount))
    const pairCount = tableCount * 2
    const pairs = Array.from({ length: pairCount }, (_, index) => environment.authenticatedContext(`howell-${tableCount}-pair-${index + 1}`).firestore())
    for (const [index, pairFirestore] of pairs.entries()) await assertSucceeds(updateDoc(doc(pairFirestore, "games", gameId), { [`pairClaims.${index + 1}`]: `howell-${tableCount}-pair-${index + 1}`, lastActivityAt: Date.now() }))
    for (const assignment of howellAssignments(tableCount)) {
      // Either seated pair can save; the North-South phone files it.
      const scorer = pairs[assignment.nsPairIndex]
      const scorerUid = `howell-${tableCount}-pair-${assignment.nsPairIndex + 1}`
      for (const boardNumber of assignment.boardNumbers) {
        await assertSucceeds(setDoc(doc(scorer, "games", gameId, "results", `board-${boardNumber}-ns-${assignment.nsPairIndex}`), result({ boardNumber, round: assignment.round, table: assignment.table, nsPairIndex: assignment.nsPairIndex, ewPairIndex: assignment.ewPairIndex, updatedBy: scorerUid })))
      }
    }
    await environment.withSecurityRulesDisabled(async (context) => {
      const snapshot = await getDocs(collection(context.firestore(), "games", gameId, "results"))
      assert.equal(snapshot.size, howellResultCount(tableCount))
    })
  }
})

test("keeps live results private to the pairs seated at that table", async () => {
  await seed({ ...game(), pairClaims: { "1": "pair-one", "2": "pair-two" } })
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "games", gameId, "results", "board-1-ns-0"), result())
  })
  const pairOne = environment.authenticatedContext("pair-one").firestore()
  const pairTwo = environment.authenticatedContext("pair-two").firestore()
  await assertSucceeds(getDoc(doc(pairOne, "games", gameId, "results", "board-1-ns-0")))
  await assertFails(getDoc(doc(pairTwo, "games", gameId, "results", "board-1-ns-0")))
  await assertSucceeds(getDocs(query(collection(pairOne, "games", gameId, "results"), where("nsPairIndex", "==", 0))))
  await assertFails(getDocs(query(collection(pairTwo, "games", gameId, "results"), where("nsPairIndex", "==", 0))))
})

test("lets East-West pairs read and write their away tables", async () => {
  await seed({ ...game(), pairClaims: { "4": "pair-four" } })
  const pairFour = environment.authenticatedContext("pair-four").firestore()
  // Pair 4 is East-West 1: Round 1 at Table 1 (boards 1-4), Round 2 at Table 3.
  await assertSucceeds(setDoc(doc(pairFour, "games", gameId, "results", "board-2-ns-0"), result({ boardNumber: 2, updatedBy: "pair-four" })))
  await assertSucceeds(getDoc(doc(pairFour, "games", gameId, "results", "board-2-ns-0")))
  // Pair 4 never sits North-South at Table 2.
  await assertFails(setDoc(doc(pairFour, "games", gameId, "results", "board-5-ns-1"), result({ boardNumber: 5, round: 0, table: 2, nsPairIndex: 1, ewPairIndex: 1, updatedBy: "pair-four" })))
})

test("rejects foreign and movement-invalid result writes", async () => {
  await seed({ ...game(), pairClaims: { "1": "pair-one" } })
  const pairOne = environment.authenticatedContext("pair-one").firestore()
  const firstResult = writeBatch(pairOne)
  firstResult.set(doc(pairOne, "games", gameId, "results", "board-1-ns-0"), result())
  await assertSucceeds(firstResult.commit())
  await assertFails(setDoc(doc(pairOne, "games", gameId, "results", "board-5-ns-0"), result({ boardNumber: 5 })))
  await assertFails(setDoc(doc(pairOne, "games", gameId, "results", "board-5-ns-1"), result({ boardNumber: 5, table: 2, nsPairIndex: 1, ewPairIndex: 1 })))
})

test("prevents pair devices from overwriting manual scores and reveals only after finish", async () => {
  await seed({ ...game(), pairClaims: { "1": "pair-one", "2": "pair-two" } })
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "games", gameId, "results", "board-1-ns-0"), result({ kind: "manual", manualScore: 100 }))
  })
  const pairOne = environment.authenticatedContext("pair-one").firestore()
  const pairTwo = environment.authenticatedContext("pair-two").firestore()
  await assertFails(setDoc(doc(pairOne, "games", gameId, "results", "board-1-ns-0"), result()))

  await environment.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), "games", gameId), { status: "finished" })
  })
  await assertSucceeds(getDoc(doc(pairTwo, "games", gameId, "results", "board-1-ns-0")))
})

test("allows pair devices to submit each board only once", async () => {
  await seed({ ...game(), pairClaims: { "1": "pair-one" } })
  const pairOne = environment.authenticatedContext("pair-one").firestore()
  const director = environment.authenticatedContext("director").firestore()
  const resultRef = doc(pairOne, "games", gameId, "results", "board-1-ns-0")
  const firstResult = writeBatch(pairOne)
  firstResult.set(resultRef, result())
  await assertSucceeds(firstResult.commit())
  await assertFails(setDoc(resultRef, result({ updatedAt: 2 })))
  await assertSucceeds(setDoc(doc(director, "games", gameId, "results", "board-1-ns-0"), result({ updatedBy: "director", updatedAt: 2 })))

  await environment.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), "games", gameId), { status: "finished" })
  })
  await assertFails(setDoc(doc(director, "games", gameId, "results", "board-1-ns-0"), result({ updatedBy: "director", updatedAt: 3 })))
})

test("requires the canonical result document ID for directors", async () => {
  await seed()
  const director = environment.authenticatedContext("director").firestore()
  await assertFails(setDoc(doc(director, "games", gameId, "results", "alternate-result"), result({ updatedBy: "director" })))
  const directorResult = writeBatch(director)
  directorResult.set(doc(director, "games", gameId, "results", "board-1-ns-0"), result({ updatedBy: "director" }))
  await assertSucceeds(directorResult.commit())
})

test("rejects arbitrary player changes to a game", async () => {
  await seed()
  const player = environment.authenticatedContext("player").firestore()
  await assertFails(updateDoc(doc(player, "games", gameId), { status: "finished" }))
  await assertFails(updateDoc(doc(player, "games", gameId), { createdAt: 2 }))
  assert.ok(true)
})

test("keeps director identity and game setup immutable", async () => {
  await seed({ ...game(), pairClaims: { "1": "pair-one" } })
  const director = environment.authenticatedContext("director").firestore()
  await assertFails(updateDoc(doc(director, "games", gameId), { directorUid: "replacement" }))
  await assertFails(updateDoc(doc(director, "games", gameId), { "pairs.ns": ["Changed", "NS 2", "NS 3"] }))
  await assertFails(updateDoc(doc(director, "games", gameId), { "pairClaims.1": "replacement" }))
  await assertSucceeds(updateDoc(doc(director, "games", gameId), { "pairClaims.1": deleteField() }))
})

test("rejects malformed game setup during atomic creation", async () => {
  const director = environment.authenticatedContext("director").firestore()
  const batch = writeBatch(director)
  batch.set(doc(director, "games", "bad-game"), { ...game(), pairs: { ns: { "0": "NS 1", "1": "NS 2", "2": "NS 3" }, ew: ["EW 1", "EW 2", "EW 3"] } })
  batch.set(doc(director, "codes", "ABC234"), { gameId: "bad-game" })
  batch.set(doc(director, "active-game", "current"), { gameId: "bad-game", directorUid: "director" })
  await assertFails(batch.commit())
})

test("rejects games with blank pair names during atomic creation", async () => {
  const director = environment.authenticatedContext("director").firestore()
  const blankMitchell = writeBatch(director)
  blankMitchell.set(doc(director, "games", "blank-mitchell"), { ...game(), pairs: { ns: ["Ava", "", "Mia"], ew: ["A", "B", "C"] } })
  blankMitchell.set(doc(director, "codes", "ABC234"), { gameId: "blank-mitchell" })
  blankMitchell.set(doc(director, "active-game", "current"), { gameId: "blank-mitchell", directorUid: "director" })
  await assertFails(blankMitchell.commit())

  const blankHowell = writeBatch(director)
  blankHowell.set(doc(director, "games", "blank-howell"), { ...howellGame(2), pairs: ["A", "B", "C", ""] })
  blankHowell.set(doc(director, "codes", "DEF567"), { gameId: "blank-howell" })
  blankHowell.set(doc(director, "active-game", "current"), { gameId: "blank-howell", directorUid: "director" })
  await assertFails(blankHowell.commit())
})

test("rehearses six pairs through a complete Mitchell game", async () => {
  await seed()
  await seedActiveGame()
  const pairs = [1, 2, 3, 4, 5, 6].map((pairNumber) => environment.authenticatedContext(`pair-${pairNumber}`).firestore())

  for (const [index, pairFirestore] of pairs.entries()) {
    const pairNumber = index + 1
    await assertSucceeds(updateDoc(doc(pairFirestore, "games", gameId), { [`pairClaims.${pairNumber}`]: `pair-${pairNumber}`, lastActivityAt: Date.now() }))
  }

  // Phones travel: North-South phones stay, East-West phones file away tables.
  for (const table of [1, 2, 3] as const) {
    const scorer = pairs[table - 1]
    const scorerUid = `pair-${table}`
    for (const round of [0, 1, 2] as const) {
      for (const boardNumber of boardNumbersAt(table, round)) {
        const nsPairIndex = table - 1
        const resultId = `board-${boardNumber}-ns-${nsPairIndex}`
        const batch = writeBatch(scorer)
        batch.set(doc(scorer, "games", gameId, "results", resultId), result({ boardNumber, round, table, nsPairIndex, ewPairIndex: eastWestPairAt(table, round) - 1, updatedBy: scorerUid }))
        await assertSucceeds(batch.commit())
      }
    }
  }

  // East-West pair 4 plays board 9 at Table 2 Round 1 (North-South pair 2).
  const pairFour = pairs[3]
  await assertSucceeds(getDoc(doc(pairFour, "games", gameId, "results", "board-9-ns-1")))
  await assertFails(setDoc(doc(pairFour, "games", gameId, "results", "board-9-ns-0"), result({ boardNumber: 9, round: 2, table: 1, nsPairIndex: 0, ewPairIndex: 0, updatedBy: "pair-4" })))

})

test("rehearses scorer saves and director finish for every movement", async () => {
  const mitchellSizes: { tableCount: MitchellTableCount; boardsPerRound: MitchellBoardsPerRound }[] = [
    { tableCount: 2, boardsPerRound: 4 },
    { tableCount: 3, boardsPerRound: 4 },
    { tableCount: 3, boardsPerRound: 3 },
    { tableCount: 4, boardsPerRound: 4 },
    { tableCount: 4, boardsPerRound: 3 },
    { tableCount: 5, boardsPerRound: 4 },
    { tableCount: 5, boardsPerRound: 3 },
  ]
  const movements = [
    ...mitchellSizes.map(({ tableCount, boardsPerRound }) => ({
      name: `mitchell-${tableCount}-${boardsPerRound}`,
      tableCount,
      data: mitchellGame(tableCount, boardsPerRound),
      assignments: Array.from({ length: tableCount }, (_, tableIndex) => Array.from({ length: tableCount }, (_, round) => ({
        table: tableIndex + 1,
        round,
        nsPairIndex: tableIndex,
        ewPairIndex: eastWestPairAt((tableIndex + 1) as 1 | 2 | 3 | 4 | 5, round as 0 | 1 | 2 | 3 | 4, tableCount) - 1,
        boardNumbers: boardNumbersAt((tableIndex + 1) as 1 | 2 | 3 | 4 | 5, round as 0 | 1 | 2 | 3 | 4, tableCount, boardsPerRound),
      }))).flat(),
      expectedResults: mitchellResultCount(tableCount, boardsPerRound),
    })),
    ...([2, 3] as const).map((tableCount) => ({ name: `howell-${tableCount}`, tableCount, data: howellGame(tableCount), assignments: howellAssignments(tableCount), expectedResults: howellResultCount(tableCount) })),
  ]

  for (const movement of movements) {
    await environment.clearFirestore()
    await seed(movement.data)
    await seedActiveGame()
    const pairCount = movement.tableCount * 2
    const pairs = Array.from({ length: pairCount }, (_, index) => environment.authenticatedContext(`full-${movement.name}-${index + 1}`).firestore())
    for (const [index, pairFirestore] of pairs.entries()) await assertSucceeds(updateDoc(doc(pairFirestore, "games", gameId), { [`pairClaims.${index + 1}`]: `full-${movement.name}-${index + 1}`, lastActivityAt: Date.now() }))

    // East-West phones file their own away-table boards; other pairs' boards stay private.
    const ewFiledIds = new Set<string>()
    const ewCheck = movement.name.startsWith("mitchell")
      ? (() => {
          const own = movement.assignments.find((assignment) => assignment.ewPairIndex === 0)
          const foreign = movement.assignments.find((assignment) => assignment.ewPairIndex !== 0)
          assert.ok(own && foreign)
          return { own, foreign }
        })()
      : null
    if (ewCheck) {
      const ewPairNumber = movement.tableCount + 1
      const ew = pairs[ewPairNumber - 1]
      const ewUid = `full-${movement.name}-${ewPairNumber}`
      const ownBoard = ewCheck.own.boardNumbers[0]
      const ownId = `board-${ownBoard}-ns-${ewCheck.own.nsPairIndex}`
      await assertSucceeds(setDoc(doc(ew, "games", gameId, "results", ownId), result({ boardNumber: ownBoard, round: ewCheck.own.round, table: ewCheck.own.table, nsPairIndex: ewCheck.own.nsPairIndex, ewPairIndex: 0, kind: "contract", level: 1, strain: "NT", doubling: "none", declarer: "ns", tricks: 7, updatedBy: ewUid, updatedAt: Date.now() })))
      ewFiledIds.add(ownId)
      // A valid slot this pair never plays: creation is refused even though the movement is valid.
      const foreignBoard = ewCheck.foreign.boardNumbers[0]
      await assertFails(setDoc(doc(ew, "games", gameId, "results", `board-${foreignBoard}-ns-${ewCheck.foreign.nsPairIndex}`), result({ boardNumber: foreignBoard, round: ewCheck.foreign.round, table: ewCheck.foreign.table, nsPairIndex: ewCheck.foreign.nsPairIndex, ewPairIndex: ewCheck.foreign.ewPairIndex, kind: "contract", level: 1, strain: "NT", doubling: "none", declarer: "ns", tricks: 7, updatedBy: ewUid, updatedAt: Date.now() })))
    }

    for (const assignment of movement.assignments) for (const boardNumber of assignment.boardNumbers) {
      // The North-South phone at each table files the board.
      const scorer = pairs[assignment.nsPairIndex]
      const scorerUid = `full-${movement.name}-${assignment.nsPairIndex + 1}`
      const resultRef = doc(scorer, "games", gameId, "results", `board-${boardNumber}-ns-${assignment.nsPairIndex}`)
      if (ewFiledIds.has(resultRef.id)) continue
      const gameRef = doc(scorer, "games", gameId)
      try {
        await assertSucceeds(setDoc(resultRef, result({ boardNumber, round: assignment.round, table: assignment.table, nsPairIndex: assignment.nsPairIndex, ewPairIndex: assignment.ewPairIndex, kind: "contract", level: 1, strain: "NT", doubling: "none", declarer: "ns", tricks: 7, updatedBy: scorerUid, updatedAt: Date.now() })))
        await assertSucceeds(updateDoc(gameRef, { lastActivityAt: Date.now() }))
      } catch (error) {
        throw new Error(`${movement.name}, table ${assignment.table}, round ${assignment.round + 1}, board ${boardNumber}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    if (ewCheck) {
      // While the game is live, the East-West phone reads its own filed board but not a foreign one.
      const ew = pairs[movement.tableCount]
      const ownBoard = ewCheck.own.boardNumbers[0]
      await assertSucceeds(getDoc(doc(ew, "games", gameId, "results", `board-${ownBoard}-ns-${ewCheck.own.nsPairIndex}`)))
      const foreignBoard = ewCheck.foreign.boardNumbers[0]
      await assertFails(getDoc(doc(ew, "games", gameId, "results", `board-${foreignBoard}-ns-${ewCheck.foreign.nsPairIndex}`)))
    }

    const director = environment.authenticatedContext("director").firestore()
    const finish = writeBatch(director)
    finish.update(doc(director, "games", gameId), { status: "finished" })
    finish.delete(doc(director, "active-game", "current"))
    await assertSucceeds(finish.commit())
    await environment.withSecurityRulesDisabled(async (context) => {
      const results = await getDocs(collection(context.firestore(), "games", gameId, "results"))
      assert.equal(results.size, movement.expectedResults)
    })
  }
})
