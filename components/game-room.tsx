"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { rankBoardResults } from "@/lib/bridge-scoring"
import { deriveNsScore, type ResultKind, type StoredGame, type StoredResult } from "@/lib/game-data"
import { cancelGame, claimTable, fetchGame, fetchResult, fetchResults, finishGame, isPermissionDenied, releaseTable, saveResult, type ResultInput } from "@/lib/game-store"
import { requireUserId } from "@/lib/firebase"
import { boardDealer, boardNumbersAt, boardVulnerability, eastWestPairAt, type RoundIndex } from "@/lib/mitchell"
import { howellAssignmentAt, howellAssignments, howellBoardCount, howellResultCount, howellRoundCount } from "@/lib/howell"
import { computeHowellStandings, computeStandings, howellMatchpointPercentage, matchpointPercentage, type StandingsRow } from "@/lib/standings"
import ScoreGlossary from "@/components/score-glossary"

const GameJoinQr = dynamic(() => import("@/components/game-join-qr"), { ssr: false })

type Props = { gameId: string; joinCode?: string }
type FormState = {
  kind: ResultKind
  level: string
  strain: "C" | "D" | "H" | "S" | "NT"
  declarer: "ns" | "ew"
  doubling: "none" | "doubled" | "redoubled"
  tricks: string
  manualScore: string
}

const STALE_REFRESH_ERROR = "Couldn't refresh just now. Showing the last update."
const POLL_INTERVAL_MS = 15000

const initialForm: FormState = { kind: "contract", level: "", strain: "NT", declarer: "ns", doubling: "none", tricks: "", manualScore: "" }
const fieldClass = "mt-1 min-h-12 w-full rounded-lg border border-[#9cb0a1] bg-white px-3 text-base text-[#17221e]"

function numberValue(value: string): number | null {
  return /^-?\d+$/.test(value) ? Number(value) : null
}

/** Director's table/round view, persisted per game so refreshes restore it. */
function readTableView(gameId: string): { table: number | null; round: number } {
  const fallback = { table: null as number | null, round: 0 }
  if (typeof window === "undefined") return fallback
  try {
    const raw = localStorage.getItem(`bridge-tableview-${gameId}`)
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return fallback
    const { table, round } = parsed as { table?: unknown; round?: unknown }
    return {
      table: typeof table === "number" && Number.isInteger(table) && table >= 1 && table <= 3 ? table : null,
      round: typeof round === "number" && Number.isInteger(round) && round >= 0 && round <= 4 ? round : 0,
    }
  } catch {
    return fallback
  }
}

function describeInput(board: number, input: ResultInput): string {
  if (input.kind === "passed-out") return `Board ${board}: Passed out. Save?`
  if (input.kind === "manual") return `Board ${board}: director score ${input.manualScore} to North-South. Save?`
  const strainNames = { C: "Clubs", D: "Diamonds", H: "Hearts", S: "Spades", NT: "No Trump" } as const
  const strain = input.strain ?? "NT"
  const doublingText = input.doubling === "doubled" ? " Doubled" : input.doubling === "redoubled" ? " Redoubled" : ""
  const side = input.declarer === "ns" ? "North-South" : "East-West"
  return `Board ${board}: ${input.level ?? "?"} ${strainNames[strain]} by ${side}, ${input.tricks ?? "?"} tricks${doublingText}. Save?`
}

function formFor(existing: StoredResult): FormState {
  return {
    kind: existing.kind,
    level: String(existing.level ?? ""),
    strain: existing.strain ?? "NT",
    declarer: existing.declarer ?? "ns",
    doubling: existing.doubling ?? "none",
    tricks: String(existing.tricks ?? ""),
    manualScore: String(existing.manualScore ?? ""),
  }
}

export default function GameRoom({ gameId, joinCode: initialJoinCode }: Props) {
  const router = useRouter()
  const [game, setGame] = useState<StoredGame | null>(null)
  const [gameLoaded, setGameLoaded] = useState(false)
  const [gameConnectionError, setGameConnectionError] = useState("")
  const [results, setResults] = useState<StoredResult[]>([])
  const [selectedTable, setSelectedTable] = useState<number | null>(() => readTableView(gameId).table)
  const [round, setRound] = useState(() => readTableView(gameId).round)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [director, setDirector] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [identityReady, setIdentityReady] = useState(false)
  const [claimingTable, setClaimingTable] = useState<number | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [releasingTable, setReleasingTable] = useState<number | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null)
  const userIdRef = useRef<string | null>(null)
  const claimedTableRef = useRef<number | null>(null)
  const gameRef = useRef<StoredGame | null>(null)
  const selectedTableRef = useRef<number | null>(null)
  const refreshInFlightRef = useRef(false)
  const [joinCode] = useState(() => {
    if (initialJoinCode) return initialJoinCode
    if (typeof window === "undefined") return ""
    return localStorage.getItem(`bridge-code-${gameId}`) ?? ""
  })

  useEffect(() => {
    selectedTableRef.current = selectedTable
    try {
      localStorage.setItem(`bridge-tableview-${gameId}`, JSON.stringify({ table: selectedTable, round }))
    } catch {
      // Private browsing may refuse storage; the view just won't persist.
    }
  }, [gameId, selectedTable, round])

  useEffect(() => {
    gameRef.current = game
  }, [game])

  /** One-shot refresh: fetch the game, then the visible results. No open lines. */
  const refresh = useCallback(async (options?: { quiet?: boolean }) => {
    if (refreshInFlightRef.current) return
    refreshInFlightRef.current = true
    if (!options?.quiet) setRefreshing(true)
    try {
      const next = await fetchGame(gameId)
      if (!next) {
        setGame(null)
        gameRef.current = null
        setResults([])
        setGameLoaded(true)
        setLastUpdatedAt(Date.now())
        return
      }
      const uid = userIdRef.current
      const isDirector = Boolean(uid && next.directorUid === uid)
      setDirector(isDirector)
      setGame(next)
      gameRef.current = next
      setGameLoaded(true)
      setGameConnectionError("")
      const tableCount = next.movement === "howell" ? next.tableCount : 3
      const nextClaimedTable = uid
        ? Array.from({ length: tableCount }, (_, index) => index + 1).find((number) => next.tables[String(number)] === uid) ?? null
        : null
      if (nextClaimedTable) {
        setClaimingTable(null)
      } else if (claimedTableRef.current) {
        setMessage(`This device was released from Table ${claimedTableRef.current}. Ask the director to assign a table.`)
      }
      claimedTableRef.current = nextClaimedTable
      const viewTable = isDirector ? selectedTableRef.current : nextClaimedTable
      const view = isDirector || next.status === "finished"
        ? { viewer: "director-or-finished" as const }
        : viewTable ? { viewer: "table" as const, table: viewTable } : null
      if (view) {
        setResults(await fetchResults(gameId, view, next))
      } else {
        // No table claimed: never show another table's leftovers.
        setResults([])
      }
      setLastUpdatedAt(Date.now())
      setError((previous) => previous === STALE_REFRESH_ERROR ? "" : previous)
    } catch (refreshError) {
      console.warn("[bridge:refresh]", refreshError)
      if (gameRef.current) {
        setError(STALE_REFRESH_ERROR)
      } else {
        setGameLoaded(true)
        setGameConnectionError("Could not load this game. Check the connection, then try again.")
      }
    } finally {
      refreshInFlightRef.current = false
      setRefreshing(false)
    }
  }, [gameId])

  useEffect(() => {
    let active = true
    requireUserId()
      .then((uid) => {
        if (!active) return
        setUserId(uid)
        userIdRef.current = uid
        setIdentityReady(true)
        void refresh()
      })
      .catch((next: unknown) => {
        if (active) {
          setIdentityReady(true)
          setError(next instanceof Error ? next.message : "Could not identify this device.")
        }
      })
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!identityReady || game?.status !== "playing") return
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh({ quiet: true })
    }, POLL_INTERVAL_MS)
    const onFocus = () => void refresh({ quiet: true })
    window.addEventListener("focus", onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener("focus", onFocus)
    }
  }, [identityReady, game?.status, refresh])

  const claimedTable = game && userId
    ? Array.from({ length: game.movement === "howell" ? game.tableCount : 3 }, (_, index) => index + 1).find((number) => game.tables[String(number)] === userId) ?? null
    : null
  const scorerRound = !director && game && claimedTable
    ? Array.from({ length: game.movement === "howell" ? howellRoundCount(game.tableCount) : 3 }, (_, candidateRound) => {
      const assignment = game.movement === "howell" ? howellAssignmentAt(game.tableCount, claimedTable, candidateRound) : null
      const nsPairIndex = assignment?.nsPairIndex ?? claimedTable - 1
      const boards = assignment?.boardNumbers ?? boardNumbersAt(claimedTable as 1 | 2 | 3, candidateRound as RoundIndex)
      return boards.every((board) => results.some((result) => result.boardNumber === board && result.nsPairIndex === nsPairIndex)) ? null : candidateRound
    }).find((candidateRound) => candidateRound !== null) ?? round
    : round
  const table = director ? selectedTable : claimedTable
  const howellAssignment = game?.movement === "howell" && table ? howellAssignmentAt(game.tableCount, table, scorerRound) : null
  const ewPair = table ? howellAssignment ? howellAssignment.ewPairIndex + 1 : eastWestPairAt(table as 1 | 2 | 3, scorerRound as RoundIndex) : null

  useEffect(() => {
    if (claimedTable) claimedTableRef.current = claimedTable
  }, [claimedTable])

  useEffect(() => {
    if (claimedTable) claimedTableRef.current = claimedTable
  }, [claimedTable])

  async function chooseTable(nextTable: number) {
    if (!userId || !game || game.status !== "playing" || claimingTable) return
    if (claimedTable) {
      setError(`This device already has Table ${claimedTable}.`)
      return
    }
    if (game?.tables[String(nextTable)]) {
      setError(`Table ${nextTable} is already in use. Choose another table or ask the director to release it.`)
      return
    }
    setError("")
    if (!window.confirm(`Score for Table ${nextTable}? Tap OK to claim it, or Cancel to pick a different table.`)) return
    setClaimingTable(nextTable)
    try {
      await claimTable(gameId, nextTable)
      setMessage(`Table ${nextTable} is claimed. Opening the scorer...`)
      await refresh({ quiet: true })
    } catch {
      setClaimingTable(null)
      setError(`Could not claim Table ${nextTable}. Another device may have claimed it first. Choose another table or ask the director to release it.`)
    }
  }

  async function finish() {
    if (!game) return
    const expectedResultCount = game.movement === "howell" ? howellResultCount(game.tableCount) : 36
    setFinishing(true)
    try {
      // Count fresh from the server: the on-screen tally can lag by one poll.
      const fresh = await fetchResults(gameId, { viewer: "director-or-finished" as const }, game)
      setResults(fresh)
      if (fresh.length !== expectedResultCount) {
        setError(`Enter all ${expectedResultCount} results before revealing. ${expectedResultCount - fresh.length} remain.`)
        return
      }
      await finishGame(gameId)
      await refresh({ quiet: true })
    } catch (next) {
      if (next instanceof Error && !isPermissionDenied(next)) setError(next.message)
      else setError("Could not finish and reveal this game. Check the connection and try again.")
    } finally {
      setFinishing(false)
    }
  }

  async function cancel() {
    if (!window.confirm("Cancel this game? Its entered results will remain stored, but the class can start a new game.")) return
    setCancelling(true)
    try {
      await cancelGame(gameId)
      router.push("/play")
    } catch (next) {
      if (next instanceof Error && !isPermissionDenied(next)) setError(next.message)
      else setError("Could not cancel this game. Check the connection and try again.")
    } finally {
      setCancelling(false)
    }
  }

  async function release(nextTable: number) {
    if (!window.confirm(`Release Table ${nextTable}? Its current scorer will no longer be able to save.`)) return
    setReleasingTable(nextTable)
    try {
      await releaseTable(gameId, nextTable)
      setMessage(`Table ${nextTable} is available for a replacement device.`)
      await refresh({ quiet: true })
    } catch (next) {
      if (next instanceof Error && !isPermissionDenied(next)) setError(next.message)
      else setError("Could not release this table. Check the connection and try again.")
    } finally {
      setReleasingTable(null)
    }
  }

  function retryGame() {
    setError("")
    setGame(null)
    gameRef.current = null
    setGameLoaded(false)
    setGameConnectionError("")
    void refresh()
  }

  if (!gameLoaded) return <p className="rounded-xl bg-[#f3ecdc] p-5 text-[#52615a]">Connecting to the game...</p>
  if (!game) return <section className="rounded-2xl border border-[#cbd5cc] bg-[#f3ecdc] p-6"><h1 className="text-3xl font-bold text-[#123a28]">{gameConnectionError ? "Could Not Connect" : "Game Not Found"}</h1><p className="mt-3 text-[#52615a]">{gameConnectionError ? "Check the connection, then try again." : "This link is invalid or the game is no longer available."}</p>{gameConnectionError ? <p role="alert" className="mt-4 rounded-xl bg-[#fff3f1] p-4 font-semibold text-[#8b2f27]">{gameConnectionError}</p> : null}<div className="mt-5 flex flex-wrap gap-3">{gameConnectionError ? <button type="button" onClick={retryGame} className="min-h-12 rounded-xl bg-[#1d5138] px-5 font-bold text-white">Try Again</button> : null}<button type="button" onClick={() => router.push("/play")} className="min-h-12 rounded-xl border border-[#1d5138] px-5 font-bold text-[#173c2a]">Back to Game Lobby</button></div></section>
  if (game.status === "cancelled") return <section className="rounded-2xl border border-[#cbd5cc] bg-[#f3ecdc] p-6"><h1 className="text-3xl font-bold text-[#123a28]">Game Cancelled</h1><p className="mt-3 text-[#52615a]">This game is no longer active. Start or join the current class game from the lobby.</p><button type="button" onClick={() => router.push("/play")} className="mt-5 min-h-12 rounded-xl bg-[#1d5138] px-5 font-bold text-white">Back to Game Lobby</button></section>

  const standings = game.movement === "howell" ? null : computeStandings(results, game.pairs)
  const howellStandings = game.movement === "howell" ? computeHowellStandings(results, game.pairs) : null
  const howellTableCount = game.movement === "howell" ? game.tableCount : null
  const tableNumbers = Array.from({ length: game.movement === "howell" ? game.tableCount : 3 }, (_, index) => index + 1)
  const expectedResultCount = game.movement === "howell" ? howellResultCount(game.tableCount) : 36
  const canSeeResults = director || game.status === "finished"
  const progress = director || game.status === "finished"
    ? `${results.length} of ${expectedResultCount} table results entered.`
    : table ? `${results.length} of ${expectedResultCount / tableNumbers.length} results entered at your table.` : "Choose a table to enter results."

  return <div className="space-y-6">
    {message ? <p role="status" className="rounded-xl bg-[#edf4ef] p-4 font-semibold text-[#173c2a]">{message}</p> : null}
    {error ? <p role="alert" className="rounded-xl bg-[#fff3f1] p-4 font-semibold text-[#8b2f27]">{error}</p> : null}
    <section className="rounded-2xl border border-[#cbd5cc] bg-[#f3ecdc] p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="whitespace-nowrap text-2xl font-bold text-[#123a28]">{game.status === "finished" ? "Results Revealed" : "Game in Progress"}</h1>
          <p className="mt-1 text-[#52615a]">{progress}</p>
          {director && joinCode ? <p className="mt-3 inline-flex rounded-lg bg-white px-3 py-2 font-bold tracking-[.18em] text-[#123a28]">Join code: {joinCode}</p> : null}
        </div>
        {director && game.status === "playing" ? <div className="flex flex-wrap gap-3"><button type="button" disabled={finishing || cancelling} onClick={finish} className="min-h-12 rounded-xl bg-[#1d5138] px-4 font-bold text-white disabled:bg-[#93a89a]">{finishing ? "Revealing..." : "Finish & Reveal"}</button><button type="button" disabled={finishing || cancelling} onClick={cancel} className="min-h-12 rounded-xl border border-[#8b2f27] px-4 font-bold text-[#8b2f27] disabled:border-[#c9a5a0] disabled:text-[#a9807b]">{cancelling ? "Cancelling..." : "Cancel Game"}</button></div> : null}
      </div>
      {director ? <div className="mt-5 border-t border-[#cbd5cc] pt-5"><GameJoinQr gameId={gameId} />{game.movement === "howell" ? <HowellMovementCard pairs={game.pairs} tableCount={game.tableCount} /> : null}</div> : null}
    </section>

    <button type="button" onClick={() => void refresh()} disabled={refreshing} className="min-h-12 w-full rounded-xl border-2 border-[#1d5138] bg-white px-5 font-bold text-[#173c2a] hover:bg-[#edf4ef] disabled:border-[#b7c6ba] disabled:text-[#7c887f]">{refreshing ? "Refreshing…" : "Refresh Scores"}</button>
    <p className="text-center text-sm text-[#52615a]">{lastUpdatedAt ? `Last updated ${new Date(lastUpdatedAt).toLocaleTimeString()}. Updates automatically every 15 seconds.` : "Updates automatically every 15 seconds."}</p>

    {!identityReady && !director ? <section className="rounded-2xl border border-[#cbd5cc] bg-white p-5"><p className="font-semibold text-[#52615a]">Identifying this device...</p></section> : null}
    {!table && !director && identityReady && game.status === "playing" ? <section className="rounded-2xl border border-[#cbd5cc] bg-white p-5">
      <h2 className="text-2xl font-bold text-[#123a28]">Choose Your Table</h2>
      <p className="mt-2 text-[#52615a]">Use one phone per table. Ask the director to release a table when replacing a device.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">{tableNumbers.map((number) => <button key={number} type="button" disabled={Boolean(game.tables[String(number)]) || claimingTable !== null} onClick={() => chooseTable(number)} className="min-h-16 rounded-xl border-2 border-[#1d5138] font-bold text-[#173c2a] hover:bg-[#edf4ef] disabled:border-[#b7c6ba] disabled:text-[#7c887f]">{claimingTable === number ? `Claiming Table ${number}...` : game.tables[String(number)] ? `Table ${number} in use` : `Table ${number}`}</button>)}</div>
    </section> : null}

    {director && !table ? <section className="rounded-2xl border border-[#cbd5cc] bg-white p-5">
      <h2 className="text-2xl font-bold text-[#123a28]">Director Entry</h2>
      <p className="mt-2 text-[#52615a]">Choose a table to enter or correct a result, including a manual director score.</p>
      <div className="mt-4 flex flex-wrap gap-3">{tableNumbers.map((number) => <button key={number} type="button" onClick={() => setSelectedTable(number)} className="min-h-12 rounded-xl border border-[#1d5138] px-4 font-bold text-[#173c2a]">Table {number}</button>)}</div>
      <div className="mt-5 space-y-2"><h3 className="font-bold text-[#173c2a]">Table devices</h3>{tableNumbers.map((number) => <div key={number} className="flex items-center justify-between rounded-lg bg-[#f3f7f3] px-3 py-2"><span>Table {number}: {game.tables[String(number)] ? "claimed" : "available"}</span>{game.tables[String(number)] ? <button type="button" disabled={releasingTable !== null} onClick={() => release(number)} className="min-h-10 rounded-lg border border-[#1d5138] px-3 font-semibold text-[#173c2a] disabled:border-[#b7c6ba] disabled:text-[#7c887f]">{releasingTable === number ? "Releasing..." : "Release"}</button> : null}</div>)}</div>
    </section> : null}

    {table && ewPair ? <TableEntry gameId={gameId} game={game} table={table} nsLabel={game.movement === "howell" ? game.pairs[howellAssignment?.nsPairIndex ?? 0] ?? "Pair" : game.pairs.ns[table - 1] ?? `NS ${table}`} ewLabel={game.movement === "howell" ? game.pairs[howellAssignment?.ewPairIndex ?? 0] ?? "Pair" : game.pairs.ew[ewPair - 1] ?? `EW ${ewPair}`} round={scorerRound} setRound={setRound} results={results} onError={setError} onNotice={setMessage} onSaved={() => void refresh({ quiet: true })} director={director} locked={!director && game.status === "finished"} onBack={director ? () => setSelectedTable(null) : undefined} /> : null}

    <section className="rounded-2xl border border-[#cbd5cc] bg-white p-5">
      <h2 className="text-2xl font-bold text-[#123a28]">Standings</h2>
      {canSeeResults ? howellStandings && howellTableCount ? <div className="mt-4"><ScoreGlossary variant="howell" tableCount={howellTableCount} /><div className="mt-3"><StandingsTable title="Pairs" rows={howellStandings} tableCount={howellTableCount} /></div></div> : standings ? <div className="mt-4"><ScoreGlossary variant="mitchell" /><div className="mt-3 grid gap-5 md:grid-cols-2"><StandingsTable title="North-South" rows={standings.ns} /><StandingsTable title="East-West" rows={standings.ew} /></div></div> : null : <p className="mt-3 leading-7 text-[#52615a]">Scores will appear here when the director finishes and reveals the game.</p>}
    </section>

    {canSeeResults ? <Traveller results={results} movement={game.movement} tableCount={howellTableCount} /> : null}
  </div>
}

function StandingsTable({ title, rows, tableCount }: { title: string; rows: StandingsRow[]; tableCount?: 2 | 3 }) {
  const boardTotal = tableCount ? howellBoardCount(tableCount) : 12
  return <div><h3 className="font-bold text-[#173c2a]">{title}</h3><div role="table" aria-label={`${title} standings`} className="mt-2 space-y-2">
    <div role="row" className="grid grid-cols-[1fr_3rem_4.5rem_4rem] items-center gap-2 px-3 text-xs font-semibold uppercase tracking-wide text-[#52615a]"><span role="columnheader">Pair</span><span role="columnheader" className="text-right">MP</span><span role="columnheader" className="text-right">%</span><span role="columnheader" className="text-right">B</span></div>
    {[...rows].sort((left, right) => left.place - right.place || left.pairIndex - right.pairIndex).map((row) => {
      const percent = tableCount ? howellMatchpointPercentage(row.totalMatchpoints, tableCount) : matchpointPercentage(row.totalMatchpoints)
      return <div role="row" key={row.pairIndex} className="grid grid-cols-[1fr_3rem_4.5rem_4rem] items-center gap-2 rounded-lg bg-[#f3f7f3] px-3 py-3"><span role="rowheader" className="min-w-0 break-words">#{row.place} {row.label || `${title} ${row.pairIndex + 1}`}</span><span role="cell" className="tabular-nums text-right font-bold">{row.totalMatchpoints}</span><span role="cell" className="tabular-nums text-right font-bold">{percent}%</span><span role="cell" className="tabular-nums text-right font-bold">{row.boardsPlayed}/{boardTotal}</span></div>
    })}
  </div></div>
}

function HowellMovementCard({ pairs, tableCount }: { pairs: readonly string[]; tableCount: 2 | 3 }) {
  const assignments = howellAssignments(tableCount)
  return <section className="mt-5"><h2 className="text-xl font-bold text-[#123a28]">Howell Movement Card</h2><div className="mt-3 space-y-3">{Array.from({ length: howellRoundCount(tableCount) }, (_, round) => <article key={round} className="rounded-lg bg-white p-3"><h3 className="font-bold text-[#173c2a]">Round {round + 1}</h3><div className="mt-2 grid gap-1 text-sm text-[#52615a]">{assignments.filter((assignment) => assignment.round === round).map((assignment) => <p key={assignment.table}>Table {assignment.table}: Boards {assignment.boardNumbers.join("-")} | {pairs[assignment.nsPairIndex]} (NS) vs {pairs[assignment.ewPairIndex]} (EW)</p>)}</div></article>)}</div></section>
}

function Traveller({ results, movement, tableCount }: { results: StoredResult[]; movement?: "mitchell" | "howell"; tableCount?: 2 | 3 | null }) {
  const byBoard = new Map<number, StoredResult[]>()
  for (const result of results) {
    if (deriveNsScore(result) === null) continue
    const rows = byBoard.get(result.boardNumber) ?? []
    rows.push(result)
    byBoard.set(result.boardNumber, rows)
  }
  return <section className="rounded-2xl border border-[#cbd5cc] bg-white p-5"><h2 className="text-2xl font-bold text-[#123a28]">Board Travellers</h2><ScoreGlossary variant={movement === "howell" ? "howell" : "mitchell"} tableCount={tableCount ?? undefined} /><div className="mt-4 grid gap-4 lg:grid-cols-2">
    {[...byBoard.entries()].sort(([left], [right]) => left - right).map(([board, rows]) => {
      const ranked = new Map(rankBoardResults(rows.map((result) => ({ id: `${result.table}-${result.nsPairIndex}`, label: "", nsScore: deriveNsScore(result) ?? 0 }))).map((row) => [row.id, row.matchpoints]))
      return <article key={board} className="rounded-xl bg-[#f3f7f3] p-4"><h3 className="font-bold text-[#173c2a]">Board {board}</h3><p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[#52615a]">North-South score | Matchpoints on this board</p><div className="mt-2 space-y-1 text-[#52615a]">{rows.sort((left, right) => left.table - right.table).map((result) => <p key={`${result.table}-${result.nsPairIndex}`}>Table {result.table}: NS {deriveNsScore(result)} <span aria-hidden="true">|</span> {ranked.get(`${result.table}-${result.nsPairIndex}`) ?? 0} MP</p>)}</div></article>
    })}
  </div></section>
}

function TableEntry({ gameId, game, table, nsLabel, ewLabel, round, setRound, results, onError, onNotice, onSaved, director, locked, onBack }: { gameId: string; game: StoredGame; table: number; nsLabel: string; ewLabel: string; round: number; setRound: (round: number) => void; results: StoredResult[]; onError: (error: string) => void; onNotice: (notice: string) => void; onSaved: () => void; director: boolean; locked: boolean; onBack?: () => void }) {
  const assignment = game.movement === "howell" ? howellAssignmentAt(game.tableCount, table, round) : null
  const boards = assignment?.boardNumbers ?? boardNumbersAt(table as 1 | 2 | 3, round as RoundIndex)
  const ewPair = assignment ? assignment.ewPairIndex + 1 : eastWestPairAt(table as 1 | 2 | 3, round as RoundIndex)
  const nsPairIndex = assignment?.nsPairIndex ?? table - 1
  const roundCount = game.movement === "howell" ? howellRoundCount(game.tableCount) : 3
  return <section className="rounded-2xl border border-[#cbd5cc] bg-white p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-2xl font-bold text-[#123a28]">Table {table}</h2><p className="mt-1 text-[#52615a]">{nsLabel} vs {ewLabel}.{game.movement === "howell" ? " Follow the Howell movement card for pair and board changes." : " East-West moves to the next higher table; pass boards to the next lower table."}</p>{locked ? <p className="mt-2 font-semibold text-[#6b4b08]">Results are revealed. Entries are locked.</p> : null}</div>{onBack ? <button type="button" onClick={onBack} className="min-h-11 rounded-lg border border-[#1d5138] px-3 font-semibold text-[#173c2a]">Director Controls</button> : null}</div><div className="mt-4 grid grid-cols-3 gap-2">{Array.from({ length: roundCount }, (_, value) => <button key={value} type="button" onClick={() => setRound(value)} className={`min-h-11 min-w-0 rounded-lg px-1 text-sm font-semibold sm:text-base ${round === value ? "bg-[#1d5138] text-white" : "bg-[#edf4ef] text-[#173c2a]"}`}>Round {value + 1}</button>)}</div><div className="mt-5 grid gap-4">{boards.map((board) => { const existing = results.find((result) => result.boardNumber === board && result.nsPairIndex === nsPairIndex); return <BoardCard key={`${board}-${existing?.updatedAt ?? "new"}`} gameId={gameId} game={game} table={table} round={round} board={board} ewPair={ewPair} nsPairIndex={nsPairIndex} existing={existing} onError={onError} onNotice={onNotice} onSaved={onSaved} director={director} locked={locked} /> })}</div></section>
}

function BoardCard({ gameId, game, table, round, board, ewPair, nsPairIndex, existing, onError, onNotice, onSaved, director, locked }: { gameId: string; game: StoredGame; table: number; round: number; board: number; ewPair: number; nsPairIndex: number; existing?: StoredResult; onError: (error: string) => void; onNotice: (notice: string) => void; onSaved: () => void; director: boolean; locked: boolean }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(() => existing ? formFor(existing) : initialForm)
  const [saving, setSaving] = useState(false)
  const [savedLocal, setSavedLocal] = useState(false)
  const vulnerability = boardVulnerability(board) ?? "none"
  const saved = Boolean(existing) || savedLocal
  const readOnly = locked || (!director && saved)

  async function save() {
    const level = numberValue(form.level)
    const tricks = numberValue(form.tricks)
    const manualScore = numberValue(form.manualScore)
    let input: ResultInput | null = null
    if (form.kind === "passed-out") input = { boardNumber: board, round, table, nsPairIndex, ewPairIndex: ewPair - 1, kind: "passed-out" }
    else if (form.kind === "manual" && director && manualScore !== null) input = { boardNumber: board, round, table, nsPairIndex, ewPairIndex: ewPair - 1, kind: "manual", manualScore }
    else if (form.kind === "contract" && level !== null && tricks !== null) input = { boardNumber: board, round, table, nsPairIndex, ewPairIndex: ewPair - 1, kind: "contract", level, tricks, strain: form.strain, declarer: form.declarer, doubling: form.doubling }
    if (!input) return onError(form.kind === "manual" ? "Enter a whole-number North-South score." : "Complete the contract and tricks before saving.")
    if (!window.confirm(describeInput(board, input))) return
    setSaving(true)
    try {
      await saveResult(gameId, input)
      // Server acknowledged the write: treat as saved immediately instead of
      // waiting on the next refresh (prevents double-submit).
      setSavedLocal(true)
      setOpen(false)
      onSaved()
    } catch (error) {
      console.warn("[bridge:save-result]", { board, error })
      if (isPermissionDenied(error)) {
        // Check the folder before complaining: the score may already be filed
        // (own retry, director pre-entry) even though this write was refused.
        try {
          const current = await fetchResult(gameId, board, nsPairIndex, game)
          if (current && deriveNsScore(current) !== null) {
            setSavedLocal(true)
            setOpen(false)
            onNotice(`Board ${board} is already saved.`)
            onSaved()
            return
          }
        } catch {
          // Fall through to the generic message below.
        }
        onError("Could not save this board. It may already be saved, or the game may have finished. Ask the director.")
      } else {
        onError(error instanceof Error ? error.message : "Could not save this board. Check the connection and try again.")
      }
    } finally {
      setSaving(false)
    }
  }

  const score = existing ? deriveNsScore(existing) : null
  return <article className="rounded-xl border border-[#b7c6ba] p-4"><button type="button" disabled={readOnly} onClick={() => setOpen((value) => !value)} className="flex min-h-12 w-full items-center justify-between text-left font-bold text-[#123a28] disabled:cursor-default"><span>Board {board} · {vulnerability === "both" ? "Both vulnerable" : vulnerability === "none" ? "Neither vulnerable" : `${vulnerability.toUpperCase()} vulnerable`}</span>{locked ? <span>Locked</span> : saved ? <span>{director && existing ? "Edit" : "Saved"}</span> : null}</button>{existing && !open ? <p className="mt-2 text-[#52615a]">Saved NS score: {score}</p> : null}{savedLocal && !existing && !open ? <p className="mt-2 text-[#52615a]">Saved. It will appear for everyone once synced.</p> : null}{open && !readOnly ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><p className="sm:col-span-2 text-[#52615a]">Dealer: {boardDealer(board)}</p><label>Result<select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as ResultKind })} className={fieldClass}><option value="contract">Contract</option><option value="passed-out">Passed Out</option>{director ? <option value="manual">Manual Director Score</option> : null}</select></label>{form.kind === "contract" ? <ContractFields form={form} setForm={setForm} /> : null}{form.kind === "manual" ? <label>NS score<input type="number" value={form.manualScore} onChange={(event) => setForm({ ...form, manualScore: event.target.value })} className={fieldClass} /></label> : null}<div className="flex items-end"><button type="button" onClick={save} disabled={saving} className="min-h-12 rounded-xl bg-[#1d5138] px-4 font-bold text-white disabled:bg-[#93a89a]">{saving ? "Saving..." : "Save result"}</button></div></div> : null}</article>
}

function ContractFields({ form, setForm }: { form: FormState; setForm: (form: FormState) => void }) {
  return <><label>Level<select value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })} className={fieldClass}><option value="">Choose</option>{[1, 2, 3, 4, 5, 6, 7].map((number) => <option key={number}>{number}</option>)}</select></label><label>Strain<select value={form.strain} onChange={(event) => setForm({ ...form, strain: event.target.value as FormState["strain"] })} className={fieldClass}><option value="C">Clubs</option><option value="D">Diamonds</option><option value="H">Hearts</option><option value="S">Spades</option><option value="NT">Notrump</option></select></label><label>Declarer<select value={form.declarer} onChange={(event) => setForm({ ...form, declarer: event.target.value as FormState["declarer"] })} className={fieldClass}><option value="ns">North-South</option><option value="ew">East-West</option></select></label><label>Tricks Made<select value={form.tricks} onChange={(event) => setForm({ ...form, tricks: event.target.value })} className={fieldClass}><option value="">Choose</option>{Array.from({ length: 14 }, (_, number) => <option key={number} value={number}>{number}</option>)}</select></label><label>Doubling<select value={form.doubling} onChange={(event) => setForm({ ...form, doubling: event.target.value as FormState["doubling"] })} className={fieldClass}><option value="none">None</option><option value="doubled">Doubled</option><option value="redoubled">Redoubled</option></select></label></>
}
