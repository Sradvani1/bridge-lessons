"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { createGame, fetchActiveGame, findGameIdByCode, isPermissionDenied, type ActiveGame } from "@/lib/game-store"
import { arePairNamesComplete } from "@/lib/game-data"
import { cleanRegularName, defaultRegulars, loadRegulars, saveRegulars } from "@/lib/regulars"
import { firebaseConfigured, requireUserId } from "@/lib/firebase"
import { howellBoardCount, howellPairCount, howellRoundCount, type HowellTableCount } from "@/lib/howell"
import { mitchellBoardCount, mitchellRoundCount, CREATABLE_MITCHELL_TABLE_COUNTS, type CreatableMitchellTableCount, type MitchellBoardsPerRound } from "@/lib/mitchell"

const inputClass = "mt-1 min-h-12 w-full rounded-lg border border-[#9cb0a1] bg-white px-3 text-base text-[#17221e]"
const presetClass = "mt-2 min-h-12 w-full rounded-lg border border-[#9cb0a1] bg-[#edf4ef] px-3 text-base text-[#17221e]"

function PresetSelect({ label, names, onPick }: { label: string; names: readonly string[]; onPick: (value: string) => void }) {
  return (
    <select
      aria-label={label}
      value=""
      onChange={(event) => {
        if (event.target.value) onPick(event.target.value)
      }}
      className={presetClass}
    >
      <option value="">Fill from regulars…</option>
      {names.map((name) => <option key={name} value={name}>{name}</option>)}
    </select>
  )
}

function RegularRow({ name, onCommit }: { name: string; onCommit: (draft: string) => boolean }) {
  // The list key includes the name, so external changes (reset) remount with a fresh draft.
  const [draft, setDraft] = useState(name)
  function commit() {
    if (draft === name) return
    if (!onCommit(draft)) setDraft(name)
  }
  return (
    <li>
      <input
        value={draft}
        onChange={(event) => setDraft(event.target.value.slice(0, 60))}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur()
          if (event.key === "Escape") setDraft(name)
        }}
        aria-label={`Regular name, currently ${name}. Clear it to remove this regular.`}
        className={inputClass}
      />
    </li>
  )
}

function emptyPairs() {
  return ["", "", ""]
}

export default function GameLobby() {
  const router = useRouter()
  const [ns, setNs] = useState(emptyPairs)
  const [ew, setEw] = useState(emptyPairs)
  const [movement, setMovement] = useState<"mitchell" | "howell">("mitchell")
  const [mitchellTableCount, setMitchellTableCount] = useState<CreatableMitchellTableCount>(3)
  const [mitchellBoardsPerRound, setMitchellBoardsPerRound] = useState<MitchellBoardsPerRound>(4)
  const [howellTableCount, setHowellTableCount] = useState<HowellTableCount>(2)
  const [howellPairs, setHowellPairs] = useState(() => Array.from({ length: 4 }, () => ""))
  const [code, setCode] = useState("")
  const [message, setMessage] = useState("")
  const [busy, setBusy] = useState(false)
  const [regulars, setRegulars] = useState<string[]>(() => loadRegulars())
  const [newRegular, setNewRegular] = useState("")
  const [regularsNote, setRegularsNote] = useState("")
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

  function setMitchellTables(tableCount: CreatableMitchellTableCount) {
    setMitchellTableCount(tableCount)
    setNs((pairs) => Array.from({ length: tableCount }, (_, index) => pairs[index] ?? ""))
    setEw((pairs) => Array.from({ length: tableCount }, (_, index) => pairs[index] ?? ""))
  }

  function updateRegulars(next: readonly string[]) {
    setRegulars(saveRegulars(next))
  }

  function addRegular() {
    const name = cleanRegularName(newRegular)
    if (!name) return
    if (regulars.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
      setRegularsNote(`"${name}" is already in the list.`)
      return
    }
    setRegularsNote("")
    setNewRegular("")
    updateRegulars([...regulars, name])
  }

  function commitRegular(index: number, draft: string): boolean {
    const original = regulars[index]
    const name = cleanRegularName(draft)
    if (!name) {
      if (!window.confirm(`Remove "${original}" from regulars?`)) return false
      setRegularsNote("")
      updateRegulars(regulars.filter((_, existingIndex) => existingIndex !== index))
      return true
    }
    if (regulars.some((existing, existingIndex) => existingIndex !== index && existing.toLowerCase() === name.toLowerCase())) {
      setRegularsNote(`"${name}" is already in the list.`)
      return false
    }
    setRegularsNote("")
    updateRegulars(regulars.map((existing, existingIndex) => existingIndex === index ? name : existing))
    return true
  }

  function resetRegulars() {
    if (!window.confirm("Reset the regulars list to the original 8 names?")) return
    setRegularsNote("")
    setNewRegular("")
    updateRegulars(defaultRegulars())
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
      if (activeGame) {
        if (!window.confirm("A game is already in progress. Starting here replaces it for everyone. Continue?")) return
      }
      const game = movement === "howell"
        ? await createGame({ movement: "howell", tableCount: howellTableCount, pairs: trimmedHowell })
        : await createGame({ movement: "mitchell", tableCount: mitchellTableCount, boardsPerRound: mitchellBoardsPerRound, pairs: { ns: trimmedNs, ew: trimmedEw } })
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
      {movement === "mitchell" ? <><fieldset className="mt-5"><legend className="font-bold text-[#173c2a]">Tables</legend><div className="mt-2 flex gap-3">{CREATABLE_MITCHELL_TABLE_COUNTS.map((tableCount) => <button key={tableCount} type="button" onClick={() => setMitchellTables(tableCount)} className={`min-h-11 rounded-lg px-4 font-bold ${mitchellTableCount === tableCount ? "bg-[#1d5138] text-white" : "bg-white text-[#173c2a]"}`}>{tableCount} tables</button>)}</div></fieldset><fieldset className="mt-5"><legend className="font-bold text-[#173c2a]">Boards per round</legend><div className="mt-2 flex gap-3">{([3, 4] as const).map((boards) => <button key={boards} type="button" onClick={() => setMitchellBoardsPerRound(boards)} className={`min-h-11 rounded-lg px-4 font-bold ${mitchellBoardsPerRound === boards ? "bg-[#1d5138] text-white" : "bg-white text-[#173c2a]"}`}>{boards} boards</button>)}</div></fieldset><p className="mt-3 leading-7 text-[#52615a]">{mitchellTableCount} tables, {mitchellTableCount * 2} pairs, {mitchellRoundCount(mitchellTableCount)} rounds, {mitchellBoardCount(mitchellTableCount, mitchellBoardsPerRound)} boards. Enter a name for every pair — the game can&apos;t start until all are filled. Got 8 pairs? Run two 2-table Howell games side by side.</p><div className="mt-5 grid gap-4 sm:grid-cols-2">{(["ns", "ew"] as const).map((direction) => <fieldset key={direction}><legend className="font-bold text-[#173c2a]">{direction === "ns" ? "North-South pairs" : "East-West pairs"}</legend>{(direction === "ns" ? ns : ew).map((pair, index) => { const printedPairNumber = direction === "ns" ? index + 1 : mitchellTableCount + index + 1; return <label key={index} className="mt-3 block font-semibold text-[#294236]">Pair {printedPairNumber}<input value={pair} required onChange={(event) => updatePair(direction, index, event.target.value)} className={inputClass} /><PresetSelect label={`Regulars for Pair ${printedPairNumber}`} names={regulars} onPick={(value) => updatePair(direction, index, value)} /></label> })}</fieldset>)}</div></> : <><fieldset className="mt-5"><legend className="font-bold text-[#173c2a]">Tables</legend><div className="mt-2 flex gap-3">{([2, 3] as const).map((tableCount) => <button key={tableCount} type="button" onClick={() => setHowellTables(tableCount)} className={`min-h-11 rounded-lg px-4 font-bold ${howellTableCount === tableCount ? "bg-[#1d5138] text-white" : "bg-white text-[#173c2a]"}`}>{tableCount} tables</button>)}</div></fieldset><p className="mt-3 leading-7 text-[#52615a]">{howellPairCount(howellTableCount)} pairs, {howellRoundCount(howellTableCount)} rounds, {howellBoardCount(howellTableCount)} boards. Enter a name for every pair — the game can&apos;t start until all are filled.</p><div className="mt-5 grid gap-4 sm:grid-cols-2">{howellPairs.map((pair, index) => <label key={index} className="block font-semibold text-[#294236]">Pair {index + 1}<input value={pair} required onChange={(event) => setHowellPairs((pairs) => pairs.map((item, pairIndex) => pairIndex === index ? event.target.value.slice(0, 60) : item))} className={inputClass} /><PresetSelect label={`Regulars for Pair ${index + 1}`} names={regulars} onPick={(value) => setHowellPairs((pairs) => pairs.map((item, pairIndex) => pairIndex === index ? value.slice(0, 60) : item))} /></label>)}</div></>}
      <fieldset className="mt-6">
        <legend className="font-bold text-[#173c2a]">Regulars</legend>
        <p className="mt-1 leading-7 text-[#52615a]">Names offered in the “Fill from regulars” menus above. Tap a name to change it, or clear it to remove it — changes save on this phone automatically.</p>
        {regularsNote ? <p role="status" className="mt-2 font-semibold text-[#173c2a]">{regularsNote}</p> : null}
        {regulars.length > 0 ? <ul className="mt-3 space-y-2">{regulars.map((name, index) => <RegularRow key={`${index}-${name}`} name={name} onCommit={(draft) => commitRegular(index, draft)} />)}</ul> : <p className="mt-3 leading-7 text-[#52615a]">No regulars yet — add the first one below.</p>}
        <div className="mt-3 flex items-end gap-2">
          <label className="flex-1 font-semibold text-[#294236]">Add a regular<input value={newRegular} onChange={(event) => setNewRegular(event.target.value.slice(0, 60))} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addRegular() } }} placeholder="Type a pair name" className={inputClass} /></label>
          <button type="button" onClick={addRegular} className="min-h-12 shrink-0 rounded-xl bg-[#1d5138] px-5 font-bold text-white">Add</button>
        </div>
        <button type="button" onClick={resetRegulars} className="mt-3 min-h-11 rounded-lg px-1 font-semibold text-[#52615a] underline">Reset to the original 8</button>
      </fieldset>
      <button type="button" onClick={startGame} disabled={busy || !namesComplete} className="mt-6 min-h-12 rounded-xl bg-[#1d5138] px-5 font-bold text-white hover:bg-[#123a28] disabled:bg-[#93a89a]">{busy ? "Starting…" : activeGame ? "Start New Game Anyway" : "Start Game"}</button>
    </section>}
    {!isDirectorGame && activeGame ? <section className="rounded-2xl border border-[#cbd5cc] bg-white p-6"><h2 className="text-3xl font-bold text-[#123a28]">Join Today&apos;s Game</h2><p className="mt-2 leading-7 text-[#52615a]">Enter the 6-character code from the director.</p><label className="mt-5 block font-semibold text-[#294236]">Game Code<input value={code} onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, "").slice(0, 6))} inputMode="text" autoCapitalize="characters" autoComplete="off" placeholder="Example: KT3Q9X" className={inputClass} /></label><button type="button" onClick={joinGame} disabled={busy || code.length !== 6} className="mt-6 min-h-12 rounded-xl border-2 border-[#1d5138] px-5 font-bold text-[#173c2a] hover:bg-[#edf4ef] disabled:border-[#b7c6ba] disabled:text-[#7c887f]">{busy ? "Joining…" : "Join Game"}</button></section> : null}
    {message ? <section role="alert" className="rounded-xl bg-[#fff3f1] p-4 font-semibold text-[#8b2f27]"><p>{message}</p>{!userId ? <button type="button" onClick={() => { setMessage(""); setIdentityAttempt((value) => value + 1) }} className="mt-3 min-h-11 rounded-lg border border-[#8b2f27] px-3 font-semibold">Try Again</button> : null}</section> : null}
  </div>
}
