"use client"

import { useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { rankBoardResults } from "@/lib/bridge-scoring"
import { deriveNsScore, type ResultKind, type StoredGame, type StoredResult } from "@/lib/game-data"
import { cancelGame, claimTable, finishGame, releaseTable, saveResult, subscribeGame, subscribeResults, type ResultInput } from "@/lib/game-store"
import { requireUserId } from "@/lib/firebase"
import { boardDealer, boardNumbersAt, boardVulnerability, eastWestPairAt, type RoundIndex } from "@/lib/mitchell"
import { computeStandings, matchpointPercentage } from "@/lib/standings"

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

const initialForm: FormState = { kind: "contract", level: "", strain: "NT", declarer: "ns", doubling: "none", tricks: "", manualScore: "" }
const fieldClass = "mt-1 min-h-12 w-full rounded-lg border border-[#9cb0a1] bg-white px-3 text-base text-[#17221e]"

function numberValue(value: string): number | null {
  return /^-?\d+$/.test(value) ? Number(value) : null
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
  const [gameHasPendingWrites, setGameHasPendingWrites] = useState(false)
  const [results, setResults] = useState<StoredResult[]>([])
  const [selectedTable, setSelectedTable] = useState<number | null>(null)
  const [round, setRound] = useState<RoundIndex>(0)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [director, setDirector] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [newlyClaimedTable, setNewlyClaimedTable] = useState<number | null>(null)
  const [joinCode] = useState(() => {
    if (initialJoinCode) return initialJoinCode
    if (typeof window === "undefined") return ""
    return localStorage.getItem(`bridge-code-${gameId}`) ?? ""
  })

  useEffect(() => subscribeGame(gameId, (next, hasPendingWrites) => {
    setGame(next)
    setGameHasPendingWrites(hasPendingWrites)
  }, (next) => setError(next.message)), [gameId])

  const directorUid = game?.directorUid
  useEffect(() => {
    let active = true
    requireUserId()
      .then((uid) => {
        if (active) {
          setUserId(uid)
          setDirector(directorUid === uid)
        }
      })
      .catch((next: unknown) => {
        if (active) setError(next instanceof Error ? next.message : "Could not identify this device.")
      })
    return () => { active = false }
  }, [directorUid])

  const claimedTable = game && userId
    ? [1, 2, 3].find((number) => game.tables[String(number)] === userId) ?? null
    : null
  const table = director ? selectedTable : claimedTable ?? newlyClaimedTable
  const ewPair = table ? eastWestPairAt(table as 1 | 2 | 3, round) : null
  const resultsTable = director ? selectedTable : gameHasPendingWrites ? null : claimedTable

  const gameStatus = game?.status
  useEffect(() => {
    if (!gameStatus) return
    const view = director || gameStatus === "finished"
      ? { viewer: "director-or-finished" as const }
      : resultsTable ? { viewer: "table" as const, table: resultsTable } : null
    return view ? subscribeResults(gameId, view, setResults, (next) => setError(next.message)) : undefined
  }, [director, gameId, gameStatus, resultsTable])

  async function chooseTable(nextTable: number) {
    if (game?.tables[String(nextTable)]) {
      setError(`Table ${nextTable} is already in use. Choose another table or ask the director to release it.`)
      return
    }
    setError("")
    try {
      await claimTable(gameId, nextTable)
      setNewlyClaimedTable(nextTable)
      setMessage(`Table ${nextTable} is ready.`)
    } catch {
      setError(`Could not claim Table ${nextTable}. Another device may have claimed it first. Choose another table or ask the director to release it.`)
    }
  }

  async function finish() {
    if (results.length !== 36) {
      setError(`Enter all 36 results before revealing. ${36 - results.length} remain.`)
      return
    }
    try {
      await finishGame(gameId)
    } catch (next) {
      setError(next instanceof Error ? next.message : "Could not finish this game.")
    }
  }

  async function cancel() {
    if (!window.confirm("Cancel this game? Its entered results will remain stored, but the class can start a new game.")) return
    try {
      await cancelGame(gameId)
      router.push("/play")
    } catch (next) {
      setError(next instanceof Error ? next.message : "Could not cancel this game.")
    }
  }

  async function release(nextTable: number) {
    try {
      await releaseTable(gameId, nextTable)
      setMessage(`Table ${nextTable} is available for a replacement device.`)
    } catch (next) {
      setError(next instanceof Error ? next.message : "Could not release this table.")
    }
  }

  if (!game) return error ? <p role="alert" className="rounded-xl bg-[#fff3f1] p-5 font-semibold text-[#8b2f27]">{error}</p> : <p className="rounded-xl bg-[#f3ecdc] p-5 text-[#52615a]">Connecting to the game...</p>
  if (game.status === "cancelled") return <section className="rounded-2xl border border-[#cbd5cc] bg-[#f3ecdc] p-6"><h1 className="text-3xl font-bold text-[#123a28]">Game Cancelled</h1><p className="mt-3 text-[#52615a]">This game is no longer active. Start or join the current class game from the lobby.</p><button type="button" onClick={() => router.push("/play")} className="mt-5 min-h-12 rounded-xl bg-[#1d5138] px-5 font-bold text-white">Back to Game Lobby</button></section>

  const standings = computeStandings(results, game.pairs)
  const canSeeResults = director || game.status === "finished"
  const progress = director || game.status === "finished"
    ? `${results.length} of 36 table results entered.`
    : table ? `${results.length} of 12 results entered at your table.` : "Choose a table to enter results."

  return <div className="space-y-6">
    <p aria-live="polite" className="sr-only">{message}</p>
    {error ? <p role="alert" className="rounded-xl bg-[#fff3f1] p-4 font-semibold text-[#8b2f27]">{error}</p> : null}
    <section className="rounded-2xl border border-[#cbd5cc] bg-[#f3ecdc] p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="whitespace-nowrap text-2xl font-bold text-[#123a28]">{game.status === "finished" ? "Results Revealed" : "Game in Progress"}</h1>
          <p className="mt-1 text-[#52615a]">{progress}</p>
          {director && joinCode ? <p className="mt-3 inline-flex rounded-lg bg-white px-3 py-2 font-bold tracking-[.18em] text-[#123a28]">Join code: {joinCode}</p> : null}
        </div>
        {director && game.status === "playing" ? <div className="flex flex-wrap gap-3"><button type="button" disabled={results.length !== 36} onClick={finish} className="min-h-12 rounded-xl bg-[#1d5138] px-4 font-bold text-white disabled:bg-[#93a89a]">{results.length === 36 ? "Finish & Reveal" : `${36 - results.length} Results Remaining`}</button><button type="button" onClick={cancel} className="min-h-12 rounded-xl border border-[#8b2f27] px-4 font-bold text-[#8b2f27]">Cancel Game</button></div> : null}
      </div>
      {director ? <div className="mt-5 border-t border-[#cbd5cc] pt-5"><GameJoinQr gameId={gameId} /></div> : null}
    </section>

    {!table && !director ? <section className="rounded-2xl border border-[#cbd5cc] bg-white p-5">
      <h2 className="text-2xl font-bold text-[#123a28]">Choose Your Table</h2>
      <p className="mt-2 text-[#52615a]">Use one phone per table. Ask the director to release a table when replacing a device.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">{[1, 2, 3].map((number) => <button key={number} type="button" disabled={Boolean(game.tables[String(number)])} onClick={() => chooseTable(number)} className="min-h-16 rounded-xl border-2 border-[#1d5138] font-bold text-[#173c2a] hover:bg-[#edf4ef] disabled:border-[#b7c6ba] disabled:text-[#7c887f]">{game.tables[String(number)] ? `Table ${number} in use` : `Table ${number}`}</button>)}</div>
    </section> : null}

    {director && !table ? <section className="rounded-2xl border border-[#cbd5cc] bg-white p-5">
      <h2 className="text-2xl font-bold text-[#123a28]">Director Entry</h2>
      <p className="mt-2 text-[#52615a]">Choose a table to enter or correct a result, including a manual director score.</p>
      <div className="mt-4 flex flex-wrap gap-3">{[1, 2, 3].map((number) => <button key={number} type="button" onClick={() => setSelectedTable(number)} className="min-h-12 rounded-xl border border-[#1d5138] px-4 font-bold text-[#173c2a]">Table {number}</button>)}</div>
      <div className="mt-5 space-y-2"><h3 className="font-bold text-[#173c2a]">Table devices</h3>{[1, 2, 3].map((number) => <div key={number} className="flex items-center justify-between rounded-lg bg-[#f3f7f3] px-3 py-2"><span>Table {number}: {game.tables[String(number)] ? "claimed" : "available"}</span>{game.tables[String(number)] ? <button type="button" onClick={() => release(number)} className="min-h-10 rounded-lg border border-[#1d5138] px-3 font-semibold text-[#173c2a]">Release</button> : null}</div>)}</div>
    </section> : null}

    {table && ewPair ? <TableEntry gameId={gameId} table={table} nsLabel={game.pairs.ns[table - 1] ?? `NS ${table}`} ewLabel={game.pairs.ew[ewPair - 1] ?? `EW ${ewPair}`} round={round} setRound={setRound} results={results} onError={setError} director={director} locked={!director && game.status === "finished"} onBack={director ? () => setSelectedTable(null) : undefined} /> : null}

    <section className="rounded-2xl border border-[#cbd5cc] bg-white p-5">
      <h2 className="text-2xl font-bold text-[#123a28]">Standings</h2>
      {canSeeResults ? <div className="mt-4 grid gap-5 md:grid-cols-2"><StandingsTable title="North-South" rows={standings.ns} /><StandingsTable title="East-West" rows={standings.ew} /></div> : <p className="mt-3 leading-7 text-[#52615a]">Scores will appear here when the director finishes and reveals the game.</p>}
    </section>

    {canSeeResults ? <Traveller results={results} /> : null}
  </div>
}

function StandingsTable({ title, rows }: { title: string; rows: ReturnType<typeof computeStandings>["ns"] }) {
  return <div><h3 className="font-bold text-[#173c2a]">{title}</h3><div className="mt-2 space-y-2">
    {[...rows].sort((left, right) => left.place - right.place || left.pairIndex - right.pairIndex).map((row) => <div key={row.pairIndex} className="flex justify-between rounded-lg bg-[#f3f7f3] px-3 py-3"><span>#{row.place} {row.label || `${title} ${row.pairIndex + 1}`}</span><span className="tabular-nums font-bold">{row.totalMatchpoints}/48 · {matchpointPercentage(row.totalMatchpoints)}% · {row.boardsPlayed}/12</span></div>)}
  </div></div>
}

function Traveller({ results }: { results: StoredResult[] }) {
  const byBoard = new Map<number, StoredResult[]>()
  for (const result of results) {
    if (deriveNsScore(result) === null) continue
    const rows = byBoard.get(result.boardNumber) ?? []
    rows.push(result)
    byBoard.set(result.boardNumber, rows)
  }
  return <section className="rounded-2xl border border-[#cbd5cc] bg-white p-5"><h2 className="text-2xl font-bold text-[#123a28]">Board Travellers</h2><div className="mt-4 grid gap-4 lg:grid-cols-2">
    {[...byBoard.entries()].sort(([left], [right]) => left - right).map(([board, rows]) => {
      const ranked = new Map(rankBoardResults(rows.map((result) => ({ id: String(result.table), label: "", nsScore: deriveNsScore(result) ?? 0 }))).map((row) => [Number(row.id), row.matchpoints]))
      return <article key={board} className="rounded-xl bg-[#f3f7f3] p-4"><h3 className="font-bold text-[#173c2a]">Board {board}</h3><div className="mt-2 space-y-1 text-[#52615a]">{rows.sort((left, right) => left.table - right.table).map((result) => <p key={result.table}>Table {result.table}: NS {deriveNsScore(result)} · {ranked.get(result.table) ?? 0} MP</p>)}</div></article>
    })}
  </div></section>
}

function TableEntry({ gameId, table, nsLabel, ewLabel, round, setRound, results, onError, director, locked, onBack }: { gameId: string; table: number; nsLabel: string; ewLabel: string; round: RoundIndex; setRound: (round: RoundIndex) => void; results: StoredResult[]; onError: (error: string) => void; director: boolean; locked: boolean; onBack?: () => void }) {
  const boards = boardNumbersAt(table as 1 | 2 | 3, round)
  const ewPair = eastWestPairAt(table as 1 | 2 | 3, round)
  return <section className="rounded-2xl border border-[#cbd5cc] bg-white p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-2xl font-bold text-[#123a28]">Table {table}</h2><p className="mt-1 text-[#52615a]">{nsLabel} vs {ewLabel}. East-West moves to the next higher table; pass boards to the next lower table.</p>{locked ? <p className="mt-2 font-semibold text-[#6b4b08]">Results are revealed. Entries are locked.</p> : null}</div>{onBack ? <button type="button" onClick={onBack} className="min-h-11 rounded-lg border border-[#1d5138] px-3 font-semibold text-[#173c2a]">Director Controls</button> : null}</div><div className="mt-4 grid grid-cols-3 gap-2">{([0, 1, 2] as RoundIndex[]).map((value) => <button key={value} type="button" onClick={() => setRound(value)} className={`min-h-11 min-w-0 rounded-lg px-1 text-sm font-semibold sm:text-base ${round === value ? "bg-[#1d5138] text-white" : "bg-[#edf4ef] text-[#173c2a]"}`}>Round {value + 1}</button>)}</div><div className="mt-5 grid gap-4">{boards.map((board) => { const existing = results.find((result) => result.boardNumber === board && result.nsPairIndex === table - 1); return <BoardCard key={`${board}-${existing?.updatedAt ?? "new"}`} gameId={gameId} table={table} round={round} board={board} ewPair={ewPair} existing={existing} onError={onError} director={director} locked={locked} /> })}</div></section>
}

function BoardCard({ gameId, table, round, board, ewPair, existing, onError, director, locked }: { gameId: string; table: number; round: RoundIndex; board: number; ewPair: number; existing?: StoredResult; onError: (error: string) => void; director: boolean; locked: boolean }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState<FormState>(() => existing ? formFor(existing) : initialForm)
  const [saving, setSaving] = useState(false)
  const vulnerability = boardVulnerability(board) ?? "none"

  async function save() {
    const level = numberValue(form.level)
    const tricks = numberValue(form.tricks)
    const manualScore = numberValue(form.manualScore)
    let input: ResultInput | null = null
    if (form.kind === "passed-out") input = { boardNumber: board, round, table, nsPairIndex: table - 1, ewPairIndex: ewPair - 1, kind: "passed-out" }
    else if (form.kind === "manual" && director && manualScore !== null) input = { boardNumber: board, round, table, nsPairIndex: table - 1, ewPairIndex: ewPair - 1, kind: "manual", manualScore }
    else if (form.kind === "contract" && level !== null && tricks !== null) input = { boardNumber: board, round, table, nsPairIndex: table - 1, ewPairIndex: ewPair - 1, kind: "contract", level, tricks, strain: form.strain, declarer: form.declarer, doubling: form.doubling }
    if (!input) return onError("Complete the contract and tricks before saving.")
    setSaving(true)
    try {
      await saveResult(gameId, input)
      setOpen(false)
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not save this board.")
    } finally {
      setSaving(false)
    }
  }

  const score = existing ? deriveNsScore(existing) : null
  return <article className="rounded-xl border border-[#b7c6ba] p-4"><button type="button" disabled={locked} onClick={() => setOpen((value) => !value)} className="flex min-h-12 w-full items-center justify-between text-left font-bold text-[#123a28] disabled:cursor-default"><span>Board {board} · {vulnerability === "both" ? "Both vulnerable" : vulnerability === "none" ? "Neither vulnerable" : `${vulnerability.toUpperCase()} vulnerable`}</span>{locked ? <span>Locked</span> : existing ? <span>Edit</span> : null}</button>{existing && !open ? <p className="mt-2 text-[#52615a]">Saved NS score: {score}</p> : null}{open && !locked ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><p className="sm:col-span-2 text-[#52615a]">Dealer: {boardDealer(board)}</p><label>Result<select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as ResultKind })} className={fieldClass}><option value="contract">Contract</option><option value="passed-out">Passed Out</option>{director ? <option value="manual">Manual Director Score</option> : null}</select></label>{form.kind === "contract" ? <ContractFields form={form} setForm={setForm} /> : null}{form.kind === "manual" ? <label>NS score<input type="number" value={form.manualScore} onChange={(event) => setForm({ ...form, manualScore: event.target.value })} className={fieldClass} /></label> : null}<div className="flex items-end"><button type="button" onClick={save} disabled={saving} className="min-h-12 rounded-xl bg-[#1d5138] px-4 font-bold text-white disabled:bg-[#93a89a]">{saving ? "Saving..." : "Save result"}</button></div></div> : null}</article>
}

function ContractFields({ form, setForm }: { form: FormState; setForm: (form: FormState) => void }) {
  return <><label>Level<select value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })} className={fieldClass}><option value="">Choose</option>{[1, 2, 3, 4, 5, 6, 7].map((number) => <option key={number}>{number}</option>)}</select></label><label>Strain<select value={form.strain} onChange={(event) => setForm({ ...form, strain: event.target.value as FormState["strain"] })} className={fieldClass}><option value="C">Clubs</option><option value="D">Diamonds</option><option value="H">Hearts</option><option value="S">Spades</option><option value="NT">Notrump</option></select></label><label>Declarer<select value={form.declarer} onChange={(event) => setForm({ ...form, declarer: event.target.value as FormState["declarer"] })} className={fieldClass}><option value="ns">North-South</option><option value="ew">East-West</option></select></label><label>Tricks Made<select value={form.tricks} onChange={(event) => setForm({ ...form, tricks: event.target.value })} className={fieldClass}><option value="">Choose</option>{Array.from({ length: 14 }, (_, number) => <option key={number} value={number}>{number}</option>)}</select></label><label>Doubling<select value={form.doubling} onChange={(event) => setForm({ ...form, doubling: event.target.value as FormState["doubling"] })} className={fieldClass}><option value="none">None</option><option value="doubled">Doubled</option><option value="redoubled">Redoubled</option></select></label></>
}
