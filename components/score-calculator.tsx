"use client"

import { startTransition, useEffect, useRef, useState } from "react"
import {
  calculateDuplicateScore,
  rankBoardResults,
  type BoardResult,
  type BoardVulnerability,
  type DeclarerSide,
  type Doubling,
  type Strain,
} from "@/lib/bridge-scoring"
import {
  normalizeCalculatorDraft,
  type DraftRow,
  type RankingMethod,
  type ResultKind,
} from "@/lib/calculator-draft"

const storageKey = "bridge-calculator-draft-v1"
const fieldClass = "mt-1 block min-h-12 w-full rounded-lg border border-[#9cb0a1] bg-white px-3 py-2 text-base text-[#17221e] shadow-sm"

function createRow(number: number): DraftRow {
  return { id: `pair-${number}`, label: `NS Pair ${number}`, kind: "contract", level: "", strain: "NT", declarer: "ns", tricks: "", doubling: "none", manualScore: "" }
}

const initialRows = [createRow(1), createRow(2)]

function parseInteger(value: string) {
  return /^-?\d+$/.test(value) ? Number(value) : null
}

function formatScore(score: number) {
  return score > 0 ? `+${score}` : String(score)
}

function formatImps(imps: number) {
  return imps > 0 ? `+${imps}` : String(imps)
}

function resolveScore(row: DraftRow, vulnerability: BoardVulnerability): { score: number | null; error: string | null } {
  if (row.kind === "passed-out") return { score: 0, error: null }
  if (row.kind === "manual") {
    const score = parseInteger(row.manualScore)
    return score === null ? { score: null, error: "Enter a whole North-South score." } : { score, error: null }
  }

  const level = parseInteger(row.level)
  const tricks = parseInteger(row.tricks)
  if (level === null || tricks === null) return { score: null, error: "Choose the contract level and enter tricks made." }
  const calculation = calculateDuplicateScore({ passedOut: false, level, strain: row.strain, declarer: row.declarer, tricks, doubling: row.doubling, vulnerability })
  return calculation.ok ? { score: calculation.value.nsScore, error: null } : { score: null, error: calculation.error }
}

export default function ScoreCalculator() {
  const [vulnerability, setVulnerability] = useState<BoardVulnerability>("none")
  const [rows, setRows] = useState<DraftRow[]>(initialRows)
  const [rankingMethod, setRankingMethod] = useState<RankingMethod>("matchpoints")
  const [datumValue, setDatumValue] = useState("")
  const [restored, setRestored] = useState(false)
  const [persistenceEnabled, setPersistenceEnabled] = useState(true)
  const [storageAvailable, setStorageAvailable] = useState(true)
  const [confirmingClear, setConfirmingClear] = useState(false)
  const [announcement, setAnnouncement] = useState("")
  const nextPair = useRef(3)
  const pendingFocus = useRef<string | null>(null)
  const rowLabelRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    let draft = null
    let storageFailed = false
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        try {
          draft = normalizeCalculatorDraft(JSON.parse(saved))
        } catch {
          draft = null
        }
        if (!draft) localStorage.removeItem(storageKey)
      }
    } catch {
      storageFailed = true
    }

    startTransition(() => {
      if (draft) {
        setVulnerability(draft.vulnerability)
        setRankingMethod(draft.rankingMethod)
        setDatumValue(draft.datumValue)
        setRows(draft.rows)
        nextPair.current = draft.rows.reduce((highest, row) => Math.max(highest, Number(row.id.replace("pair-", "")) || 0), 0) + 1
        setAnnouncement("Your saved board was restored.")
      }
      if (storageFailed) setStorageAvailable(false)
      setRestored(true)
    })
  }, [])

  useEffect(() => {
    if (!restored || !persistenceEnabled || !storageAvailable) return
    try {
      localStorage.setItem(storageKey, JSON.stringify({ vulnerability, rankingMethod, datumValue, rows }))
    } catch {
      startTransition(() => setStorageAvailable(false))
    }
  }, [datumValue, persistenceEnabled, rankingMethod, restored, rows, storageAvailable, vulnerability])

  useEffect(() => {
    const id = pendingFocus.current
    if (id) {
      rowLabelRefs.current[id]?.focus()
      pendingFocus.current = null
    }
  }, [rows])

  const rowScores = rows.map((row) => ({ row, ...resolveScore(row, vulnerability) }))
  const validResults: BoardResult[] = rowScores.flatMap(({ row, score }) => score === null ? [] : [{ id: row.id, label: row.label.trim() || "Unnamed NS pair", nsScore: score }])
  const datum = parseInteger(datumValue)
  const ranked = rankBoardResults(validResults, datum)
  const datumIsInvalid = rankingMethod === "datum-imps" && datumValue !== "" && datum === null
  const canRank = validResults.length >= 2 && !(rankingMethod === "datum-imps" && datum === null)
  const sortedRanked = [...ranked].sort((left, right) => {
    const leftValue = rankingMethod === "matchpoints" ? left.matchpoints : rankingMethod === "cross-imps" ? left.crossImps : left.datumImps ?? 0
    const rightValue = rankingMethod === "matchpoints" ? right.matchpoints : rankingMethod === "cross-imps" ? right.crossImps : right.datumImps ?? 0
    return rightValue - leftValue || left.label.localeCompare(right.label)
  })

  function markEdited() {
    setPersistenceEnabled(true)
    setConfirmingClear(false)
  }

  function updateRow(id: string, changes: Partial<DraftRow>) {
    markEdited()
    setRows((currentRows) => currentRows.map((row) => (row.id === id ? { ...row, ...changes } : row)))
  }

  function addRow() {
    if (rows.length === 12) return
    markEdited()
    const row = createRow(nextPair.current++)
    pendingFocus.current = row.id
    setRows((currentRows) => [...currentRows, row])
    setAnnouncement(`${row.label} added.`)
  }

  function removeRow(id: string, label: string) {
    if (rows.length <= 2) return
    markEdited()
    setRows((currentRows) => currentRows.filter((row) => row.id !== id))
    setAnnouncement(`${label || "Pair"} removed.`)
  }

  function clearBoard() {
    setRows([createRow(1), createRow(2)])
    setVulnerability("none")
    setRankingMethod("matchpoints")
    setDatumValue("")
    setPersistenceEnabled(false)
    setConfirmingClear(false)
    nextPair.current = 3
    try {
      localStorage.removeItem(storageKey)
    } catch {
      setStorageAvailable(false)
    }
    setAnnouncement("Board cleared.")
  }

  function rankingMetric(result: (typeof sortedRanked)[number]) {
    if (rankingMethod === "matchpoints") return `${result.matchpoints} matchpoints (${result.matchpointPercent?.toFixed(1)}%)`
    if (rankingMethod === "cross-imps") return `${formatImps(result.crossImps)} Cross-IMPs (${formatImps(result.crossImpAverage ?? 0)} average)`
    return `${formatImps(result.datumImps ?? 0)} datum IMPs`
  }

  function rankingPlace(result: (typeof sortedRanked)[number]) {
    return rankingMethod === "matchpoints" ? result.matchpointRank : rankingMethod === "cross-imps" ? result.crossImpRank : result.datumImpRank
  }

  return (
    <div className="space-y-8">
      <p aria-live="polite" className="sr-only">{announcement}</p>
      <section className="rounded-2xl border border-[#cbd5cc] bg-[#f3ecdc] p-5 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-semibold uppercase tracking-[0.14em] text-[#6b4b08]">One board at a time</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-[#123a28] text-balance sm:text-4xl">Duplicate Score Calculator</h1>
            <p className="mt-3 max-w-2xl leading-8 text-[#3f5147]">Enter one result for each North-South pair. Scores update as you fill in the board.</p>
          </div>
          <label className="block font-semibold text-[#294236]">
            Board Vulnerability
            <select value={vulnerability} onChange={(event) => { markEdited(); setVulnerability(event.target.value as BoardVulnerability) }} className={fieldClass}>
              <option value="none">Neither vulnerable</option><option value="ns">NS vulnerable</option><option value="ew">EW vulnerable</option><option value="both">Both vulnerable</option>
            </select>
          </label>
        </div>
      </section>

      <section aria-labelledby="results-heading">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="results-heading" className="text-2xl font-bold text-[#123a28]">Board Results</h2>
            <p className="mt-2 leading-7 text-[#52615a]">Positive scores favor North-South. Incomplete results are not ranked.</p>
          </div>
          <button type="button" onClick={addRow} disabled={rows.length === 12} className="min-h-12 rounded-xl bg-[#1d5138] px-5 font-bold text-white hover:bg-[#123a28] disabled:cursor-not-allowed disabled:bg-[#93a89a]">
            Add Pair ({rows.length}/12)
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {rowScores.map(({ row, score, error }, index) => (
            <fieldset key={row.id} className="rounded-2xl border border-[#b7c6ba] bg-white p-5">
              <legend className="sr-only">Result for {row.label || `North-South Pair ${index + 1}`}</legend>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <label className="block min-w-0 flex-1 font-bold text-[#173c2a]">
                  North-South Pair
                  <input ref={(element) => { rowLabelRefs.current[row.id] = element }} value={row.label} maxLength={80} onChange={(event) => updateRow(row.id, { label: event.target.value })} autoComplete="off" className={fieldClass} />
                </label>
                <button type="button" onClick={() => removeRow(row.id, row.label)} aria-label={`Remove ${row.label || `North-South Pair ${index + 1}`}`} disabled={rows.length <= 2} className="min-h-11 rounded-lg px-3 font-semibold text-[#7b3029] underline underline-offset-4 hover:bg-[#fff3f1] disabled:cursor-not-allowed disabled:text-[#a9aaa5]">
                  Remove
                </button>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
                <label className="block font-semibold text-[#294236]">Result Type
                  <select value={row.kind} onChange={(event) => updateRow(row.id, { kind: event.target.value as ResultKind })} className={fieldClass}><option value="contract">Contract</option><option value="passed-out">Passed Out</option><option value="manual">Manual NS Score</option></select>
                </label>
                {row.kind === "contract" ? <>
                  <label className="block font-semibold text-[#294236]">Level
                    <select value={row.level} onChange={(event) => updateRow(row.id, { level: event.target.value })} aria-describedby={error ? `${row.id}-error` : undefined} className={fieldClass}><option value="">Choose</option>{[1, 2, 3, 4, 5, 6, 7].map((level) => <option key={level} value={level}>{level}</option>)}</select>
                  </label>
                  <label className="block font-semibold text-[#294236]">Strain
                    <select value={row.strain} onChange={(event) => updateRow(row.id, { strain: event.target.value as Strain })} className={fieldClass}><option value="C">Clubs</option><option value="D">Diamonds</option><option value="H">Hearts</option><option value="S">Spades</option><option value="NT">Notrump</option></select>
                  </label>
                  <label className="block font-semibold text-[#294236]">Declarer
                    <select value={row.declarer} onChange={(event) => updateRow(row.id, { declarer: event.target.value as DeclarerSide })} className={fieldClass}><option value="ns">North-South</option><option value="ew">East-West</option></select>
                  </label>
                  <label className="block font-semibold text-[#294236]">Tricks Made
                    <input type="number" min="0" max="13" inputMode="numeric" value={row.tricks} onChange={(event) => updateRow(row.id, { tricks: event.target.value })} aria-describedby={error ? `${row.id}-error` : undefined} autoComplete="off" className={fieldClass} />
                  </label>
                  <label className="block font-semibold text-[#294236]">Doubling
                    <select value={row.doubling} onChange={(event) => updateRow(row.id, { doubling: event.target.value as Doubling })} className={fieldClass}><option value="none">Undoubled</option><option value="doubled">Doubled</option><option value="redoubled">Redoubled</option></select>
                  </label>
                </> : row.kind === "manual" ? <label className="block font-semibold text-[#294236] sm:col-span-2">Signed North-South Score
                  <input type="number" step="1" inputMode="numeric" value={row.manualScore} onChange={(event) => updateRow(row.id, { manualScore: event.target.value })} aria-describedby={error ? `${row.id}-error` : undefined} autoComplete="off" placeholder="Example: 420 or -50" className={fieldClass} />
                </label> : <p className="self-end pb-3 leading-7 text-[#52615a] sm:col-span-2">Passed out scores 0 for both sides.</p>}
              </div>
              <p id={error ? `${row.id}-error` : undefined} role={error ? "alert" : undefined} className={`mt-5 rounded-lg px-4 py-3 font-semibold ${error ? "bg-[#fff3f1] text-[#8b2f27]" : "bg-[#edf4ef] text-[#173c2a]"}`}>
                {error ? error : <>NS score: <span className="tabular-nums">{formatScore(score ?? 0)}</span><span className="ml-3 font-normal text-[#52615a]">EW score: {formatScore(-(score ?? 0))}</span></>}
              </p>
            </fieldset>
          ))}
        </div>
      </section>

      <section aria-labelledby="rankings-heading" className="rounded-2xl border border-[#cbd5cc] bg-[#f3ecdc] p-5 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="rankings-heading" className="text-2xl font-bold text-[#123a28]">Rankings</h2>
            <p className="mt-2 leading-7 text-[#52615a]">{validResults.length} valid {validResults.length === 1 ? "result" : "results"} entered.</p>
          </div>
          <label className="block font-semibold text-[#294236]">Scoring Method
            <select value={rankingMethod} onChange={(event) => { markEdited(); setRankingMethod(event.target.value as RankingMethod) }} className={fieldClass}><option value="matchpoints">Matchpoints</option><option value="cross-imps">Cross-IMPs</option><option value="datum-imps">Datum IMPs</option></select>
          </label>
        </div>
        {rankingMethod === "datum-imps" ? <label className="mt-5 block max-w-sm font-semibold text-[#294236]">North-South Datum Score
          <input type="number" step="1" inputMode="numeric" value={datumValue} onChange={(event) => { markEdited(); setDatumValue(event.target.value) }} autoComplete="off" placeholder="Enter datum score" className={fieldClass} />
          {datumIsInvalid ? <span role="alert" className="mt-2 block text-[#8b2f27]">Enter a whole-number datum score.</span> : null}
        </label> : null}
        {canRank ? <>
          <div className="mt-6 space-y-3 md:hidden">
            {sortedRanked.map((result) => <article key={result.id} className="rounded-xl border border-[#b7c6ba] bg-white p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-[#123a28]">#{rankingPlace(result)} {result.label}</p><p className="mt-1 tabular-nums text-[#52615a]">NS {formatScore(result.nsScore)} · EW {formatScore(-result.nsScore)}</p></div><p className="max-w-36 text-right font-bold leading-6 text-[#173c2a]">{rankingMetric(result)}</p></div></article>)}
          </div>
          <div className="mt-6 hidden overflow-x-auto md:block"><table className="w-full border-collapse text-left"><thead className="border-b-2 border-[#9cb0a1] text-sm uppercase tracking-wide text-[#52615a]"><tr><th className="px-3 py-3">Place</th><th className="px-3 py-3">NS Pair</th><th className="px-3 py-3">NS Score</th><th className="px-3 py-3">EW Score</th><th className="px-3 py-3 text-right">{rankingMethod === "matchpoints" ? "Matchpoints" : rankingMethod === "cross-imps" ? "Cross-IMPs" : "Datum IMPs"}</th></tr></thead><tbody>{sortedRanked.map((result) => <tr key={result.id} className="border-b border-[#d8e1da]"><td className="px-3 py-4 tabular-nums">{rankingPlace(result)}</td><td className="px-3 py-4 font-semibold">{result.label}</td><td className="px-3 py-4 tabular-nums">{formatScore(result.nsScore)}</td><td className="px-3 py-4 tabular-nums">{formatScore(-result.nsScore)}</td><td className="px-3 py-4 text-right tabular-nums">{rankingMetric(result)}</td></tr>)}</tbody></table></div>
        </> : <p className="mt-6 rounded-xl bg-white px-4 py-4 leading-7 text-[#52615a]">{rankingMethod === "datum-imps" && datum === null ? "Enter a whole-number North-South datum score to calculate IMPs." : "Enter at least 2 complete results to calculate rankings."}</p>}
        <p className="mt-6 text-sm leading-6 text-[#52615a]">Uses standard ACBL duplicate contract scoring and the IMP scale. Director adjustments, averages, penalties, and fouled boards are outside this calculator’s scope.</p>
      </section>

      <section data-print-hidden className="rounded-2xl border border-[#cbd5cc] bg-white p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><p className="leading-7 text-[#52615a]">{storageAvailable ? persistenceEnabled ? "This board is saved on this device." : "This blank board is not currently saved." : "This browser cannot save the board."}</p>{confirmingClear ? <div className="flex flex-wrap gap-3"><button type="button" onClick={clearBoard} className="min-h-12 rounded-xl bg-[#9b2c24] px-5 font-bold text-white hover:bg-[#7c211b]">Clear Board Now</button><button type="button" onClick={() => setConfirmingClear(false)} className="min-h-12 rounded-xl border border-[#9cb0a1] px-5 font-bold text-[#294236] hover:bg-[#edf4ef]">Cancel</button></div> : <button type="button" onClick={() => setConfirmingClear(true)} className="min-h-12 rounded-xl border border-[#9b2c24] px-5 font-bold text-[#8b2f27] hover:bg-[#fff3f1]">Clear Board</button>}</div></section>
    </div>
  )
}
