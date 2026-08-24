import assert from "node:assert/strict"
import { after, afterEach, before, test } from "node:test"
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing"
import { collection, deleteField, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch } from "firebase/firestore"

const projectId = "demo-bridge"
const gameId = "game-1"
let environment: RulesTestEnvironment

function game(status: "playing" | "finished" = "playing") {
  return {
    status,
    pairs: { ns: ["NS 1", "NS 2", "NS 3"], ew: ["EW 1", "EW 2", "EW 3"] },
    directorUid: "director",
    tables: {},
    createdAt: 1,
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
    updatedBy: "table-one",
    updatedAt: 1,
    ...overrides,
  }
}

async function seed(data = game()) {
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

test("requires finishing or cancelling to release the active game", async () => {
  await seed()
  await seedActiveGame()
  const director = environment.authenticatedContext("director").firestore()
  await assertFails(updateDoc(doc(director, "games", gameId), { status: "finished" }))

  const finish = writeBatch(director)
  finish.update(doc(director, "games", gameId), { status: "finished" })
  finish.delete(doc(director, "active-game", "current"))
  await assertSucceeds(finish.commit())
})

test("allows only one device to claim each table", async () => {
  await seed()
  const tableOne = environment.authenticatedContext("table-one").firestore()
  const tableTwo = environment.authenticatedContext("table-two").firestore()
  await assertSucceeds(updateDoc(doc(tableOne, "games", gameId), { "tables.1": "table-one" }))
  await assertFails(updateDoc(doc(tableTwo, "games", gameId), { "tables.1": "table-two" }))
  await assertSucceeds(updateDoc(doc(tableTwo, "games", gameId), { "tables.2": "table-two" }))
  await assertFails(updateDoc(doc(tableTwo, "games", gameId), { "tables.3": "table-two" }))
})

test("keeps live results private to their claimed table", async () => {
  await seed({ ...game(), tables: { "1": "table-one", "2": "table-two" } })
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "games", gameId, "results", "board-1-ns-0"), result())
  })
  const tableOne = environment.authenticatedContext("table-one").firestore()
  const tableTwo = environment.authenticatedContext("table-two").firestore()
  await assertSucceeds(getDoc(doc(tableOne, "games", gameId, "results", "board-1-ns-0")))
  await assertFails(getDoc(doc(tableTwo, "games", gameId, "results", "board-1-ns-0")))
  await assertSucceeds(getDocs(query(collection(tableOne, "games", gameId, "results"), where("nsPairIndex", "==", 0))))
  await assertFails(getDocs(query(collection(tableTwo, "games", gameId, "results"), where("nsPairIndex", "==", 0))))
})

test("rejects foreign and movement-invalid result writes", async () => {
  await seed({ ...game(), tables: { "1": "table-one" } })
  const tableOne = environment.authenticatedContext("table-one").firestore()
  await assertSucceeds(setDoc(doc(tableOne, "games", gameId, "results", "board-1-ns-0"), result()))
  await assertFails(setDoc(doc(tableOne, "games", gameId, "results", "board-5-ns-0"), result({ boardNumber: 5 })))
  await assertFails(setDoc(doc(tableOne, "games", gameId, "results", "board-5-ns-1"), result({ boardNumber: 5, table: 2, nsPairIndex: 1, ewPairIndex: 1 })))
})

test("prevents table devices from overwriting manual scores and reveals only after finish", async () => {
  await seed({ ...game(), tables: { "1": "table-one", "2": "table-two" } })
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "games", gameId, "results", "board-1-ns-0"), result({ kind: "manual", manualScore: 100 }))
  })
  const tableOne = environment.authenticatedContext("table-one").firestore()
  const tableTwo = environment.authenticatedContext("table-two").firestore()
  await assertFails(setDoc(doc(tableOne, "games", gameId, "results", "board-1-ns-0"), result()))

  await environment.withSecurityRulesDisabled(async (context) => {
    await updateDoc(doc(context.firestore(), "games", gameId), { status: "finished" })
  })
  await assertSucceeds(getDoc(doc(tableTwo, "games", gameId, "results", "board-1-ns-0")))
})

test("allows table devices to submit each board only once", async () => {
  await seed({ ...game(), tables: { "1": "table-one" } })
  const tableOne = environment.authenticatedContext("table-one").firestore()
  const director = environment.authenticatedContext("director").firestore()
  const resultRef = doc(tableOne, "games", gameId, "results", "board-1-ns-0")
  await assertSucceeds(setDoc(resultRef, result()))
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
  await assertSucceeds(setDoc(doc(director, "games", gameId, "results", "board-1-ns-0"), result({ updatedBy: "director" })))
})

test("rejects arbitrary player changes to a game", async () => {
  await seed()
  const player = environment.authenticatedContext("player").firestore()
  await assertFails(updateDoc(doc(player, "games", gameId), { status: "finished" }))
  await assertFails(updateDoc(doc(player, "games", gameId), { createdAt: 2 }))
  assert.ok(true)
})

test("keeps director identity and game setup immutable", async () => {
  await seed({ ...game(), tables: { "1": "table-one" } })
  const director = environment.authenticatedContext("director").firestore()
  await assertFails(updateDoc(doc(director, "games", gameId), { directorUid: "replacement" }))
  await assertFails(updateDoc(doc(director, "games", gameId), { "pairs.ns": ["Changed", "NS 2", "NS 3"] }))
  await assertFails(updateDoc(doc(director, "games", gameId), { "tables.1": "replacement" }))
  await assertSucceeds(updateDoc(doc(director, "games", gameId), { "tables.1": deleteField() }))
})

test("rejects malformed game setup during atomic creation", async () => {
  const director = environment.authenticatedContext("director").firestore()
  const batch = writeBatch(director)
  batch.set(doc(director, "games", "bad-game"), { ...game(), pairs: { ns: { "0": "NS 1", "1": "NS 2", "2": "NS 3" }, ew: ["EW 1", "EW 2", "EW 3"] } })
  batch.set(doc(director, "codes", "ABC234"), { gameId: "bad-game" })
  batch.set(doc(director, "active-game", "current"), { gameId: "bad-game", directorUid: "director" })
  await assertFails(batch.commit())
})
