"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createGame, fetchActiveGame, findGameIdByCode, isPermissionDenied, type ActiveGame } from "@/lib/game-store"
import { arePairNamesComplete } from "@/lib/game-data"
import { firebaseConfigured, requireUserId } from "@/lib/firebase"
import { howellBoardCount, howellPairCount, howellRoundCount, type HowellTableCount } from "@/lib/howell"

const inputClass = "mt-1 min-h-12 w-full rounded-lg border border-[#9cb0a1] bg-white px-3 text-base text-[#17221e]"

function emptyPairs() {
  return ["", "", ""]
}

export default function GameLobby() {
  const router = useRouter()
  const [ns, setNs] = useState(emptyPairs)
  const [ew, setEw] = useState(emptyPairs)
  const [movement, setMovement] = useState<"mitchell" | "howell">("mitchell")
  const [howellTableCount, setHowellTableCount] = useState<HowellTableCount>(2)
  const [howellPairs, setHowellPairs] = useState(() => Array.from({ length: 4 }, () => ""))
  const [code, setCode] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [activeGame, setActiveGame] = useState<ActiveGame | null | undefined>(undefined)
  const [userId, setUserId] = useState<string | null>(null)
  const [identityAttempt, setIdentityAttempt] = useState(0)

  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (!firebaseConfigured()) return
    let active = true
    requireUserId()
      .then(async (uid) => {
        if (!active) return
        setUserId(uid)
        setChecking(true)
        try {
          const found = await fetchActiveGame()
          if (active) setActiveGame(found)
        } catch (error) {
          console.warn("[bridge:active-game-fetch]", error)
          if (active) setMessage("Having trouble reaching the game service. Check the connection and try again.")
        } finally {
          if (active) setChecking(false)
        }
      })
      .catch(() => {
        if (active) setMessage("Could not identify this device. Check the connection and try again.")
      })
    return () => { active = false }
  }, [identityAttempt])

  async function checkForGame() {
    if (!userId || checking) return
    setChecking(true)
    try {
      setActiveGame(await fetchActiveGame())
    } catch (error) {
      console.warn("[bridge:active-game-fetch]", error)
      setMessage("Having trouble reaching the game service. Check the connection and try again.")
    } finally {
      setChecking(false)
    }
  }

  useEffect(() => {
    const onFocus = () => checkForGame()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, checking])

  const isDirectorGame = Boolean(activeGame && userId && activeGame.directorUid === userId)
  const isLoadingStatus = activeGame === undefined || !userId
  const namesComplete = movement === "howell"
    ? arePairNamesComplete(howellPairs)
    : arePairNamesComplete(ns) && arePairNamesComplete(ew)

  function updatePair(direction: "ns" | "ew", index: number, value: string) {
    const setter = direction === "ns" ? setNs : setEw
    setter((pairs) => pairs.map((pair, pairIndex) => pairIndex === index ? value.slice(0, 60) : pair))
  }

  function setHowellTables(tableCount: HowellTableCount) {
    setHowellTableCount(tableCount)
    setHowellPairs((pairs) => Array.from({ length: howellPairCount(tableCount) }, (_, index) => pairs[index] ?? ""))
  }

  async function startGame() {
    setMessage("")
    const trimmedNs = ns.map((pair) => pair.trim())
    const trimmedEw = ew.map((pair) => pair.trim())
    const trimmedHowell = howellPairs.map((pair) => pair.trim())
    const namesComplete = movement === "howell"
      ? arePairNamesComplete(trimmedHowell)
      : arePairNamesComplete(trimmedNs) && arePairNamesComplete(trimmedEw)
    if (!namesComplete) {
      setMessage("Enter a name for every pair before starting the game.")
      return
    }
    setBusy(true)
    try {
      const game = movement === "howell"
        ? await createGame({ movement: "howell", tableCount: howellTableCount, pairs: trimmedHowell })
        : await createGame({ movement: "mitchell", pairs: { ns: trimmedNs, ew: trimmedEw } })
      localStorage.setItem(`bridge-director-${game.gameId}`, "1")
      localStorage.setItem(`bridge-code-${game.gameId}`, game.code)
      router.push(`/play/${game.gameId}?code=${game.code}`)
    } catch (error) {
      console.warn("[bridge:start-game]", error)
      if (error instanceof Error && !isPermissionDenied(error)) setMessage(`Could not start the game: ${error.message}`)
      else setMessage("Could not start the game. Check your connection and try again.")
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
      console.warn("[bridge:join-game]", error)
      if (error instanceof Error && !isPermissionDenied(error)) setMessage(`Could not join the game: ${error.message}`)
      else setMessage("Could not join the game. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }

  if (!firebaseConfigured()) {
    return <section className="rounded-2xl border border-[#cbd5cc] bg-[#f3ecdc] p-6"><h1 className="text-3xl font-bold text-[#123a28]">Game scoring setup needed</h1><p className="mt-3 leading-7 text-[#52615a]">Add the Firebase environment values before live multi-phone scoring can begin.</p></section>
  }

  return <div className="mx-auto max-w-2xl space-y-6">
    {userId && !isLoadingStatus ? <button type="button" onClick={checkForGame} disabled={checking || busy} className="min-h-12 w-full rounded-xl border-2 border-[#1d5138] bg-white px-5 font-bold text-[#173c2a] hover:bg-[#edf4ef] disabled:border-[#b7c6ba] disabled:text-[#7c887f]">{checking ? "Checking…" : "Refresh Game Status"}</button> : null}
    {isDirectorGame && activeGame ? <section className="rounded-2xl border border-[#cbd5cc] bg-[#f3ecdc] p-6"><h1 className="text-3xl font-bold text-[#123a28]">Returning to Your Game</h1><p className="mt-3 leading-7 text-[#52615a]">Restoring director controls...</p><button type="button" onClick={() => router.replace(`/play/${activeGame.gameId}`)} className="mt-5 min-h-12 rounded-xl bg-[#1d5138] px-5 font-bold text-white">Return to Director Game</button></section> : isLoadingStatus ? <section className="rounded-2xl border border-[#cbd5cc] bg-[#f3ecdc] p-6"><h1 className="text-3xl font-bold text-[#123a28]">Checking for a Game</h1><p className="mt-3 leading-7 text-[#52615a]">You can join as soon as the current game status loads.</p><button type="button" onClick={checkForGame} disabled={checking || !userId} className="mt-5 min-h-12 rounded-xl bg-[#1d5138] px-5 font-bold text-white disabled:bg-[#93a89a]">{checking ? "Checking…" : "Try Again"}</button></section> : <section className="rounded-2xl border border-[#cbd5cc] bg-[#f3ecdc] p-6"><h1 className="text-3xl font-bold text-[#123a28]">Start Today&apos;s Game</h1>{activeGame ? <p className="mt-3 leading-7 text-[#52615a]">A game is already in progress on another device. If that game is live, join it below with the director&apos;s code. If it is stale or was left behind, starting here replaces it.</p> : null}<div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={() => setMovement("mitchell")} className={`min-h-11 rounded-lg px-4 font-bold ${movement === "mitchell" ? "bg-[#1d5138] text-white" : "bg-white text-[#173c2a]"}`}>Mitchell</button><button type="button" onClick={() => setMovement("howell")} className={`min-h-11 rounded-lg px-4 font-bold ${movement === "howell" ? "bg-[#1d5138] text-white" : "bg-white text-[#173c2a]"}`}>Howell</button></div>
      {movement === "mitchell" ? <><p className="mt-2 leading-7 text-[#52615a]">3 tables, 6 pairs, 12 boards. Enter a name for every pair — the game can&apos;t start until all are filled.</p><div className="mt-5 grid gap-4 sm:grid-cols-2">{(["ns", "ew"] as const).map((direction) => <fieldset key={direction}><legend className="font-bold text-[#173c2a]">{direction === "ns" ? "North-South pairs" : "East-West pairs"}</legend>{(direction === "ns" ? ns : ew).map((pair, index) => <label key={index} className="mt-3 block font-semibold text-[#294236]">Pair {index + 1}<input value={pair} required onChange={(event) => updatePair(direction, index, event.target.value)} placeholder="e.g. Ava & Leo" className={inputClass} /></label>)}</fieldset>)}</div></> : <><fieldset className="mt-5"><legend className="font-bold text-[#173c2a]">Tables</legend><div className="mt-2 flex gap-3">{([2, 3] as const).map((tableCount) => <button key={tableCount} type="button" onClick={() => setHowellTables(tableCount)} className={`min-h-11 rounded-lg px-4 font-bold ${howellTableCount === tableCount ? "bg-[#1d5138] text-white" : "bg-white text-[#173c2a]"}`}>{tableCount} tables</button>)}</div></fieldset><p className="mt-3 leading-7 text-[#52615a]">{howellPairCount(howellTableCount)} pairs, {howellRoundCount(howellTableCount)} rounds, {howellBoardCount(howellTableCount)} boards. Enter a name for every pair — the game can&apos;t start until all are filled.</p><div className="mt-5 grid gap-4 sm:grid-cols-2">{howellPairs.map((pair, index) => <label key={index} className="block font-semibold text-[#294236]">Pair {index + 1}<input value={pair} required onChange={(event) => setHowellPairs((pairs) => pairs.map((item, pairIndex) => pairIndex === index ? event.target.value.slice(0, 60) : item))} placeholder="e.g. Ava & Leo" className={inputClass} /></label>)}</div></>}
      <button type="button" onClick={startGame} disabled={busy || !namesComplete} className="mt-6 min-h-12 rounded-xl bg-[#1d5138] px-5 font-bold text-white hover:bg-[#123a28] disabled:bg-[#93a89a]">{busy ? "Starting…" : activeGame ? "Start New Game Anyway" : "Start Game"}</button>
    </section>}
    {!isDirectorGame && activeGame ? <section className="rounded-2xl border border-[#cbd5cc] bg-white p-6"><h2 className="text-3xl font-bold text-[#123a28]">Join Today&apos;s Game</h2><p className="mt-2 leading-7 text-[#52615a]">Enter the 6-character code from the director.</p><label className="mt-5 block font-semibold text-[#294236]">Game Code<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 6))} inputMode="text" autoCapitalize="characters" autoComplete="off" placeholder="Example: KT3Q9X" className={inputClass} /></label><button type="button" onClick={joinGame} disabled={busy || code.length !== 6} className="mt-6 min-h-12 rounded-xl border-2 border-[#1d5138] px-5 font-bold text-[#173c2a] hover:bg-[#edf4ef] disabled:border-[#b7c6ba] disabled:text-[#7c887f]">{busy ? "Joining…" : "Join Game"}</button></section> : null}
    {message ? <section role="alert" className="rounded-xl bg-[#fff3f1] p-4 font-semibold text-[#8b2f27]"><p>{message}</p>{!userId ? <button type="button" onClick={() => { setMessage(""); setIdentityAttempt((value) => value + 1) }} className="mt-3 min-h-11 rounded-lg border border-[#8b2f27] px-3 font-semibold">Try Again</button> : null}</section> : null}
  </div>
}
