import assert from "node:assert/strict"
import { after, afterEach, before, test } from "node:test"
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing"
import { collection, deleteField, doc, getDoc, getDocs, query, runTransaction, setDoc, updateDoc, where, writeBatch } from "firebase/firestore"
import { boardNumbersAt, eastWestPairAt } from "../lib/mitchell"
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
    tables: {},
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
    tables: {},
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
    updatedBy: "table-one",
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
  await assertSucceeds(runTransaction(replacement, async (transaction) => {
    const active = await transaction.get(doc(replacement, "active-game", "current"))
    assert.equal(active.data()?.gameId, gameId)
    const replacementGame = { ...game(), directorUid: "replacement-director", createdAt: Date.now(), lastActivityAt: Date.now() }
    transaction.update(doc(replacement, "games", gameId), { status: "cancelled" })
    transaction.set(doc(replacement, "games", replacementGameId), replacementGame)
    transaction.set(doc(replacement, "codes", "DEF567"), { gameId: replacementGameId })
    transaction.set(doc(replacement, "active-game", "current"), { gameId: replacementGameId, directorUid: "replacement-director" })
  }))
  const oldTable = environment.authenticatedContext("old-table").firestore()
  await assertFails(updateDoc(doc(oldTable, "games", gameId), { "tables.1": "old-table", lastActivityAt: Date.now() }))
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
  const tableOne = environment.authenticatedContext("table-one").firestore()
  await assertSucceeds(updateDoc(doc(tableOne, "games", gameId), { "tables.1": "table-one", lastActivityAt: Date.now() }))

  const future = Date.now() + (10 * 60 * 1000)
  const tableTwo = environment.authenticatedContext("table-two").firestore()
  await assertFails(updateDoc(doc(tableTwo, "games", gameId), { "tables.2": "table-two", lastActivityAt: future }))
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

test("requires a complete game before finishing or cancelling to release the active game", async () => {
  await seed()
  await seedActiveGame()
  const director = environment.authenticatedContext("director").firestore()
  await assertFails(updateDoc(doc(director, "games", gameId), { status: "finished" }))

  const finish = writeBatch(director)
  finish.update(doc(director, "games", gameId), { status: "finished" })
  finish.delete(doc(director, "active-game", "current"))
  await assertFails(finish.commit())

  const cancel = writeBatch(director)
  cancel.update(doc(director, "games", gameId), { status: "cancelled" })
  cancel.delete(doc(director, "active-game", "current"))
  await assertSucceeds(cancel.commit())
})

test("allows the director to finish a complete Howell game", async () => {
  await seed({ ...howellGame(2), resultCount: 12 })
  await seedActiveGame()
  const director = environment.authenticatedContext("director").firestore()
  const finish = writeBatch(director)
  finish.update(doc(director, "games", gameId), { status: "finished" })
  finish.delete(doc(director, "active-game", "current"))
  await assertSucceeds(finish.commit())
})

test("prevents unassigned devices from advancing result totals", async () => {
  await seed()
  const attacker = environment.authenticatedContext("attacker").firestore()
  await assertFails(updateDoc(doc(attacker, "games", gameId), { resultCount: 1, lastActivityAt: Date.now() }))
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

test("enforces configured Howell table claims and table-scoped live results", async () => {
  await seed(howellGame(2))
  const tableOne = environment.authenticatedContext("table-one").firestore()
  const tableTwo = environment.authenticatedContext("table-two").firestore()
  const tableThree = environment.authenticatedContext("table-three").firestore()
  await assertSucceeds(updateDoc(doc(tableOne, "games", gameId), { "tables.1": "table-one" }))
  await assertSucceeds(updateDoc(doc(tableTwo, "games", gameId), { "tables.2": "table-two" }))
  await assertFails(updateDoc(doc(tableThree, "games", gameId), { "tables.3": "table-three" }))
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "games", gameId, "results", "board-1-ns-0"), result({ ewPairIndex: 3 }))
  })
  await assertSucceeds(getDocs(query(collection(tableOne, "games", gameId, "results"), where("table", "==", 1))))
  await assertFails(getDocs(query(collection(tableTwo, "games", gameId, "results"), where("table", "==", 1))))
})

test("accepts only scheduled Howell results", async () => {
  await seed(howellGame(3))
  const director = environment.authenticatedContext("director").firestore()
  await assertSucceeds(setDoc(doc(director, "games", gameId, "results", "board-1-ns-0"), result({ ewPairIndex: 5, updatedBy: "director" })))
  await assertFails(setDoc(doc(director, "games", gameId, "results", "board-1-ns-0"), result({ ewPairIndex: 4, updatedBy: "director" })))
})

test("allows a Howell table device to write its rotating North-South pair", async () => {
  await seed({ ...howellGame(2), tables: { "2": "table-two" } })
  const tableTwo = environment.authenticatedContext("table-two").firestore()
  const write = writeBatch(tableTwo)
  write.set(doc(tableTwo, "games", gameId, "results", "board-3-ns-3"), result({ boardNumber: 3, round: 1, table: 2, nsPairIndex: 3, ewPairIndex: 1, updatedBy: "table-two" }))
  await assertSucceeds(write.commit())
})

test("rehearses every scorer through complete two- and three-table Howell games", async () => {
  for (const tableCount of [2, 3] as const) {
    await environment.clearFirestore()
    await seed(howellGame(tableCount))
    const scorers = Array.from({ length: tableCount }, (_, index) => environment.authenticatedContext(`howell-${tableCount}-table-${index + 1}`).firestore())
    for (const [index, scorer] of scorers.entries()) await assertSucceeds(updateDoc(doc(scorer, "games", gameId), { [`tables.${index + 1}`]: `howell-${tableCount}-table-${index + 1}` }))
    for (const assignment of howellAssignments(tableCount)) {
      const scorer = scorers[assignment.table - 1]
      for (const boardNumber of assignment.boardNumbers) {
        await assertSucceeds(setDoc(doc(scorer, "games", gameId, "results", `board-${boardNumber}-ns-${assignment.nsPairIndex}`), result({ boardNumber, round: assignment.round, table: assignment.table, nsPairIndex: assignment.nsPairIndex, ewPairIndex: assignment.ewPairIndex, updatedBy: `howell-${tableCount}-table-${assignment.table}` })))
      }
    }
    await environment.withSecurityRulesDisabled(async (context) => {
      const snapshot = await getDocs(collection(context.firestore(), "games", gameId, "results"))
      assert.equal(snapshot.size, howellResultCount(tableCount))
    })
  }
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
  const firstResult = writeBatch(tableOne)
  firstResult.set(doc(tableOne, "games", gameId, "results", "board-1-ns-0"), result())
  await assertSucceeds(firstResult.commit())
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
  const firstResult = writeBatch(tableOne)
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

test("rehearses three scorers through a complete Mitchell game", async () => {
  await seed()
  await seedActiveGame()
  const tables = [1, 2, 3].map((table) => environment.authenticatedContext(`table-${table}`).firestore())

  for (const [index, tableFirestore] of tables.entries()) {
    const table = index + 1
    await assertSucceeds(updateDoc(doc(tableFirestore, "games", gameId), { [`tables.${table}`]: `table-${table}` }))
  }

  for (const [index, tableFirestore] of tables.entries()) {
    const table = index + 1
    for (const round of [0, 1, 2] as const) {
      for (const boardNumber of boardNumbersAt(table as 1 | 2 | 3, round)) {
        const nsPairIndex = table - 1
        const resultId = `board-${boardNumber}-ns-${nsPairIndex}`
        const batch = writeBatch(tableFirestore)
        batch.set(doc(tableFirestore, "games", gameId, "results", resultId), result({ boardNumber, round, table, nsPairIndex, ewPairIndex: eastWestPairAt(table as 1 | 2 | 3, round) - 1, updatedBy: `table-${table}` }))
        await assertSucceeds(batch.commit())
      }
    }
  }

})
