"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createGame, findGameIdByCode, subscribeActiveGame, type ActiveGame } from "@/lib/game-store"
import { firebaseConfigured, requireUserId } from "@/lib/firebase"
import { howellBoardCount, howellPairCount, howellRoundCount, type HowellTableCount } from "@/lib/howell"

const inputClass = "mt-1 min-h-12 w-full rounded-lg border border-[#9cb0a1] bg-white px-3 text-base text-[#17221e]"

function defaultPairs(prefix: "NS" | "EW", firstNumber: number) {
  return Array.from({ length: 3 }, (_, index) => `${prefix} ${firstNumber + index}`)
}

export default function GameLobby() {
  const router = useRouter()
  const [ns, setNs] = useState(defaultPairs("NS", 1))
  const [ew, setEw] = useState(defaultPairs("EW", 4))
  const [movement, setMovement] = useState<"mitchell" | "howell">("mitchell")
  const [howellTableCount, setHowellTableCount] = useState<HowellTableCount>(2)
  const [howellPairs, setHowellPairs] = useState(() => Array.from({ length: 4 }, (_, index) => `Pair ${index + 1}`))
  const [code, setCode] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [activeGame, setActiveGame] = useState<ActiveGame | null | undefined>(undefined)
  const [userId, setUserId] = useState<string | null>(null)
  const [identityAttempt, setIdentityAttempt] = useState(0)

  useEffect(() => {
    if (!firebaseConfigured()) return
    requireUserId().then(setUserId).catch((error: unknown) => setMessage(error instanceof Error ? `Could not identify this device: ${error.message}` : "Could not identify this device."))
  }, [identityAttempt])

  useEffect(() => {
    if (!userId) return
    return subscribeActiveGame(setActiveGame, () => setActiveGame(null))
  }, [userId])

  useEffect(() => {
    if (activeGame && activeGame.directorUid === userId) router.replace(`/play/${activeGame.gameId}`)
  }, [activeGame, router, userId])

  function updatePair(direction: "ns" | "ew", index: number, value: string) {
    const setter = direction === "ns" ? setNs : setEw
    setter((pairs) => pairs.map((pair, pairIndex) => pairIndex === index ? value.slice(0, 60) : pair))
  }

  function setHowellTables(tableCount: HowellTableCount) {
    setHowellTableCount(tableCount)
    setHowellPairs((pairs) => Array.from({ length: howellPairCount(tableCount) }, (_, index) => pairs[index] ?? `Pair ${index + 1}`))
  }

  async function startGame() {
    setBusy(true)
    setMessage("")
    try {
      const game = movement === "howell"
        ? await createGame({ movement: "howell", tableCount: howellTableCount, pairs: howellPairs.map((pair, index) => pair.trim() || `Pair ${index + 1}`) })
        : await createGame({ movement: "mitchell", pairs: { ns: ns.map((pair, index) => pair.trim() || `NS ${index + 1}`), ew: ew.map((pair, index) => pair.trim() || `EW ${index + 4}`) } })
      localStorage.setItem(`bridge-director-${game.gameId}`, "1")
      localStorage.setItem(`bridge-code-${game.gameId}`, game.code)
      router.push(`/play/${game.gameId}?code=${game.code}`)
    } catch (error) {
      setMessage(error instanceof Error ? `Could not start the game: ${error.message}` : "Could not start the game. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  async function joinGame() {
    setBusy(true)
    setMessage("")
    try {
      const gameId = await findGameIdByCode(code.trim().toUpperCase())
      if (!gameId) setMessage("That game code was not found.")
      else router.push(`/play/${gameId}`)
    } catch (error) {
      setMessage(error instanceof Error ? `Could not join the game: ${error.message}` : "Could not join the game. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  if (!firebaseConfigured()) {
    return <section className="rounded-2xl border border-[#cbd5cc] bg-[#f3ecdc] p-6"><h1 className="text-3xl font-bold text-[#123a28]">Game scoring setup needed</h1><p className="mt-3 leading-7 text-[#52615a]">Add the Firebase environment values before live multi-phone scoring can begin.</p></section>
  }

  return <div className="mx-auto max-w-2xl space-y-6">
    {activeGame && activeGame.directorUid === userId ? <section className="rounded-2xl border border-[#cbd5cc] bg-[#f3ecdc] p-6"><h1 className="text-3xl font-bold text-[#123a28]">Returning to Your Game</h1><p className="mt-3 leading-7 text-[#52615a]">Restoring director controls...</p><button type="button" onClick={() => router.replace(`/play/${activeGame.gameId}`)} className="mt-5 min-h-12 rounded-xl bg-[#1d5138] px-5 font-bold text-white">Return to Director Game</button></section> : activeGame === null ? <section className="rounded-2xl border border-[#cbd5cc] bg-[#f3ecdc] p-6"><h1 className="text-3xl font-bold text-[#123a28]">Start Today&apos;s Game</h1><div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={() => setMovement("mitchell")} className={`min-h-11 rounded-lg px-4 font-bold ${movement === "mitchell" ? "bg-[#1d5138] text-white" : "bg-white text-[#173c2a]"}`}>Mitchell</button><button type="button" onClick={() => setMovement("howell")} className={`min-h-11 rounded-lg px-4 font-bold ${movement === "howell" ? "bg-[#1d5138] text-white" : "bg-white text-[#173c2a]"}`}>Howell</button></div>
      {movement === "mitchell" ? <><p className="mt-2 leading-7 text-[#52615a]">3 tables, 6 pairs, 12 boards. Pair names are optional.</p><div className="mt-5 grid gap-4 sm:grid-cols-2">{(["ns", "ew"] as const).map((direction) => <fieldset key={direction}><legend className="font-bold text-[#173c2a]">{direction === "ns" ? "North-South pairs" : "East-West pairs"}</legend>{(direction === "ns" ? ns : ew).map((pair, index) => <label key={index} className="mt-3 block font-semibold text-[#294236]">Pair {index + 1}<input value={pair} onChange={(event) => updatePair(direction, index, event.target.value)} className={inputClass} /></label>)}</fieldset>)}</div></> : <><fieldset className="mt-5"><legend className="font-bold text-[#173c2a]">Tables</legend><div className="mt-2 flex gap-3">{([2, 3] as const).map((tableCount) => <button key={tableCount} type="button" onClick={() => setHowellTables(tableCount)} className={`min-h-11 rounded-lg px-4 font-bold ${howellTableCount === tableCount ? "bg-[#1d5138] text-white" : "bg-white text-[#173c2a]"}`}>{tableCount} tables</button>)}</div></fieldset><p className="mt-3 leading-7 text-[#52615a]">{howellPairCount(howellTableCount)} pairs, {howellRoundCount(howellTableCount)} rounds, {howellBoardCount(howellTableCount)} boards. Pair names are optional.</p><div className="mt-5 grid gap-4 sm:grid-cols-2">{howellPairs.map((pair, index) => <label key={index} className="block font-semibold text-[#294236]">Pair {index + 1}<input value={pair} onChange={(event) => setHowellPairs((pairs) => pairs.map((item, pairIndex) => pairIndex === index ? event.target.value.slice(0, 60) : item))} className={inputClass} /></label>)}</div></>}
      <button type="button" onClick={startGame} disabled={busy} className="mt-6 min-h-12 rounded-xl bg-[#1d5138] px-5 font-bold text-white hover:bg-[#123a28] disabled:bg-[#93a89a]">{busy ? "Starting…" : "Start Game"}</button>
    </section> : <section className="rounded-2xl border border-[#cbd5cc] bg-[#f3ecdc] p-6"><h1 className="text-3xl font-bold text-[#123a28]">Checking for a Game</h1><p className="mt-3 leading-7 text-[#52615a]">You can join as soon as the current game status loads.</p></section>}
    {activeGame && activeGame.directorUid !== userId ? <section className="rounded-2xl border border-[#cbd5cc] bg-white p-6"><h2 className="text-3xl font-bold text-[#123a28]">Join Today&apos;s Game</h2><p className="mt-2 leading-7 text-[#52615a]">Enter the 6-character code from the director.</p><label className="mt-5 block font-semibold text-[#294236]">Game Code<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6))} inputMode="text" autoCapitalize="characters" autoComplete="off" placeholder="Example: KT3Q9X" className={inputClass} /></label><button type="button" onClick={joinGame} disabled={busy || code.length !== 6} className="mt-6 min-h-12 rounded-xl border-2 border-[#1d5138] px-5 font-bold text-[#173c2a] hover:bg-[#edf4ef] disabled:border-[#b7c6ba] disabled:text-[#7c887f]">{busy ? "Joining…" : "Join Game"}</button></section> : null}
    {message ? <section role="alert" className="rounded-xl bg-[#fff3f1] p-4 font-semibold text-[#8b2f27]"><p>{message}</p>{!userId ? <button type="button" onClick={() => { setMessage(""); setIdentityAttempt((value) => value + 1) }} className="mt-3 min-h-11 rounded-lg border border-[#8b2f27] px-3 font-semibold">Try Again</button> : null}</section> : null}
  </div>
}
