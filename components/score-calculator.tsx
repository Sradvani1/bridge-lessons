"use client"

import { useRef, useState } from "react"
import {
  calculateDuplicateScore,
  rankBoardResults,
  type BoardResult,
  type BoardVulnerability,
  type DeclarerSide,
  type Doubling,
  type Strain,
} from "@/lib/bridge-scoring"

type ResultKind = "contract" | "passed-out" | "manual"
type RankingMethod = "matchpoints" | "cross-imps" | "datum-imps"

type ResultRow = {
  id: string
  label: string
  kind: ResultKind
  level: string
  strain: Strain
  declarer: DeclarerSide
  tricks: string
  doubling: Doubling
  manualScore: string
}

const initialRows: ResultRow[] = [
  { id: "pair-1", label: "NS Pair 1", kind: "contract", level: "", strain: "NT", declarer: "ns", tricks: "", doubling: "none", manualScore: "" },
  { id: "pair-2", label: "NS Pair 2", kind: "contract", level: "", strain: "NT", declarer: "ns", tricks: "", doubling: "none", manualScore: "" },
]

const fieldClass = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900 shadow-sm focus:border-slate-600 focus:outline-none"

function parseInteger(value: string) {
  return /^-?\d+$/.test(value) ? Number(value) : null
}

function formatScore(score: number) {
  return score > 0 ? `+${score}` : String(score)
}

function formatImps(imps: number) {
  return imps > 0 ? `+${imps}` : String(imps)
}

function resolveScore(row: ResultRow, vulnerability: BoardVulnerability): { score: number | null; error: string | null } {
  if (row.kind === "passed-out") return { score: 0, error: null }
  if (row.kind === "manual") {
    const score = parseInteger(row.manualScore)
    return score === null ? { score: null, error: "Enter a whole NS score." } : { score, error: null }
  }

  const level = parseInteger(row.level)
  const tricks = parseInteger(row.tricks)
  if (level === null || tricks === null) return { score: null, error: "Enter the level and tricks." }
  const calculation = calculateDuplicateScore({
    passedOut: false,
    level,
    strain: row.strain,
    declarer: row.declarer,
    tricks,
    doubling: row.doubling,
    vulnerability,
  })

  return calculation.ok ? { score: calculation.value.nsScore, error: null } : { score: null, error: calculation.error }
}

export default function ScoreCalculator() {
  const [vulnerability, setVulnerability] = useState<BoardVulnerability>("none")
  const [rows, setRows] = useState<ResultRow[]>(initialRows)
  const [rankingMethod, setRankingMethod] = useState<RankingMethod>("matchpoints")
  const [datumValue, setDatumValue] = useState("")
  const nextPair = useRef(3)

  const rowScores = rows.map((row) => ({ row, ...resolveScore(row, vulnerability) }))
  const validResults: BoardResult[] = rowScores.flatMap(({ row, score }) =>
    score === null ? [] : [{ id: row.id, label: row.label.trim() || "Unnamed NS pair", nsScore: score }],
  )
  const datum = parseInteger(datumValue)
  const ranked = rankBoardResults(validResults, datum)
  const datumIsInvalid = rankingMethod === "datum-imps" && datumValue !== "" && datum === null
  const canRank = validResults.length >= 2 && !(rankingMethod === "datum-imps" && datum === null)
  const sortedRanked = [...ranked].sort((left, right) => {
    const leftValue = rankingMethod === "matchpoints" ? left.matchpoints : rankingMethod === "cross-imps" ? left.crossImps : left.datumImps ?? 0
    const rightValue = rankingMethod === "matchpoints" ? right.matchpoints : rankingMethod === "cross-imps" ? right.crossImps : right.datumImps ?? 0
    return rightValue - leftValue || left.label.localeCompare(right.label)
  })

  function updateRow(id: string, changes: Partial<ResultRow>) {
    setRows((currentRows) => currentRows.map((row) => (row.id === id ? { ...row, ...changes } : row)))
  }

  function addRow() {
    if (rows.length === 12) return
    const number = nextPair.current++
    setRows((currentRows) => [
      ...currentRows,
      { id: `pair-${number}`, label: `NS Pair ${number}`, kind: "contract", level: "", strain: "NT", declarer: "ns", tricks: "", doubling: "none", manualScore: "" },
    ])
  }

  function removeRow(id: string) {
    if (rows.length <= 2) return
    setRows((currentRows) => currentRows.filter((row) => row.id !== id))
  }

  return (
    <div className="space-y-8">
      <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Duplicate score calculator</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              Enter one result for each North-South pair on a single board. Scores and rankings update as you type.
            </p>
          </div>
          <label className="block text-sm font-medium text-slate-700">
            Board vulnerability
            <select value={vulnerability} onChange={(event) => setVulnerability(event.target.value as BoardVulnerability)} className={fieldClass}>
              <option value="none">Neither vulnerable</option>
              <option value="ns">NS vulnerable</option>
              <option value="ew">EW vulnerable</option>
              <option value="both">Both vulnerable</option>
            </select>
          </label>
        </div>
      </section>

      <section aria-labelledby="results-heading">
        <div className="flex items-center justify-between">
          <div>
            <h2 id="results-heading" className="text-lg font-bold text-slate-900">Board results</h2>
            <p className="mt-1 text-sm text-slate-600">Positive scores favor NS. Incomplete rows are excluded from rankings.</p>
          </div>
          <button type="button" onClick={addRow} disabled={rows.length === 12} className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
            Add pair ({rows.length}/12)
          </button>
        </div>

        <div className="mt-4 space-y-4">
          {rowScores.map(({ row, score, error }) => (
            <fieldset key={row.id} className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <label className="block min-w-0 flex-1 text-sm font-semibold text-slate-800">
                  North-South pair
                  <input value={row.label} onChange={(event) => updateRow(row.id, { label: event.target.value })} className={fieldClass} />
                </label>
                <button type="button" onClick={() => removeRow(row.id)} disabled={rows.length <= 2} className="mt-7 text-sm font-medium text-slate-600 underline underline-offset-2 disabled:cursor-not-allowed disabled:text-slate-300">
                  Remove
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <label className="block text-sm font-medium text-slate-700">
                  Result type
                  <select value={row.kind} onChange={(event) => updateRow(row.id, { kind: event.target.value as ResultKind })} className={fieldClass}>
                    <option value="contract">Contract</option>
                    <option value="passed-out">Passed out</option>
                    <option value="manual">Manual NS score</option>
                  </select>
                </label>

                {row.kind === "contract" ? (
                  <>
                    <label className="block text-sm font-medium text-slate-700">
                      Level
                      <select value={row.level} onChange={(event) => updateRow(row.id, { level: event.target.value })} aria-describedby={error ? `${row.id}-error` : undefined} className={fieldClass}>
                        <option value="">Select</option>
                        {[1, 2, 3, 4, 5, 6, 7].map((level) => <option key={level} value={level}>{level}</option>)}
                      </select>
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      Strain
                      <select value={row.strain} onChange={(event) => updateRow(row.id, { strain: event.target.value as Strain })} className={fieldClass}>
                        <option value="C">Clubs</option><option value="D">Diamonds</option><option value="H">Hearts</option><option value="S">Spades</option><option value="NT">Notrump</option>
                      </select>
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      Declarer
                      <select value={row.declarer} onChange={(event) => updateRow(row.id, { declarer: event.target.value as DeclarerSide })} className={fieldClass}>
                        <option value="ns">NS</option><option value="ew">EW</option>
                      </select>
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      Tricks made
                      <input type="number" min="0" max="13" inputMode="numeric" value={row.tricks} onChange={(event) => updateRow(row.id, { tricks: event.target.value })} aria-describedby={error ? `${row.id}-error` : undefined} className={fieldClass} />
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      Doubling
                      <select value={row.doubling} onChange={(event) => updateRow(row.id, { doubling: event.target.value as Doubling })} className={fieldClass}>
                        <option value="none">Undoubled</option><option value="doubled">Doubled</option><option value="redoubled">Redoubled</option>
                      </select>
                    </label>
                  </>
                ) : row.kind === "manual" ? (
                  <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
                    Signed NS score
                    <input type="number" step="1" inputMode="numeric" value={row.manualScore} onChange={(event) => updateRow(row.id, { manualScore: event.target.value })} aria-describedby={error ? `${row.id}-error` : undefined} placeholder="e.g. 420 or -50" className={fieldClass} />
                  </label>
                ) : (
                  <p className="self-end pb-2 text-sm text-slate-600 sm:col-span-2">This result scores 0 to both sides.</p>
                )}
              </div>

              <p id={error ? `${row.id}-error` : undefined} role={error ? "alert" : undefined} className={`mt-3 text-sm font-medium ${error ? "text-rose-700" : "text-slate-700"}`}>
                {error ? error : <>NS score: <span className="tabular-nums">{formatScore(score ?? 0)}</span> <span className="font-normal text-slate-500">| EW score: {formatScore(-(score ?? 0))}</span></>}
              </p>
            </fieldset>
          ))}
        </div>
      </section>

      <section aria-labelledby="rankings-heading" className="rounded-xl border border-slate-200 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="rankings-heading" className="text-lg font-bold text-slate-900">Rankings</h2>
            <p className="mt-1 text-sm text-slate-600">Rankings include {validResults.length} valid {validResults.length === 1 ? "result" : "results"}.</p>
          </div>
          <label className="block text-sm font-medium text-slate-700">
            Scoring method
            <select value={rankingMethod} onChange={(event) => setRankingMethod(event.target.value as RankingMethod)} className={fieldClass}>
              <option value="matchpoints">Matchpoints</option>
              <option value="cross-imps">Cross-IMPs</option>
              <option value="datum-imps">Datum IMPs</option>
            </select>
          </label>
        </div>

        {rankingMethod === "datum-imps" ? (
          <label className="mt-4 block max-w-xs text-sm font-medium text-slate-700">
            NS datum score
            <input type="number" step="1" inputMode="numeric" value={datumValue} onChange={(event) => setDatumValue(event.target.value)} placeholder="Enter datum" className={fieldClass} />
            {datumIsInvalid ? <span className="mt-1 block text-sm text-rose-700">Enter a whole-number datum score.</span> : null}
          </label>
        ) : null}

        {canRank ? (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-3 py-2 font-semibold">Place</th><th className="px-3 py-2 font-semibold">NS pair</th><th className="px-3 py-2 font-semibold">NS score</th><th className="px-3 py-2 font-semibold">EW score</th><th className="px-3 py-2 text-right font-semibold">{rankingMethod === "matchpoints" ? "Matchpoints" : rankingMethod === "cross-imps" ? "Cross-IMPs" : "Datum IMPs"}</th></tr>
              </thead>
              <tbody>
                {sortedRanked.map((result) => {
                  const rank = rankingMethod === "matchpoints" ? result.matchpointRank : rankingMethod === "cross-imps" ? result.crossImpRank : result.datumImpRank
                  const metric = rankingMethod === "matchpoints"
                    ? `${result.matchpoints} (${result.matchpointPercent?.toFixed(1)}%)`
                    : rankingMethod === "cross-imps"
                      ? `${formatImps(result.crossImps)} (${formatImps(result.crossImpAverage ?? 0)} avg)`
                      : formatImps(result.datumImps ?? 0)
                  return <tr key={result.id} className="border-b border-slate-100 last:border-0"><td className="px-3 py-3 tabular-nums">{rank}</td><td className="px-3 py-3 font-medium text-slate-900">{result.label}</td><td className="px-3 py-3 tabular-nums">{formatScore(result.nsScore)}</td><td className="px-3 py-3 tabular-nums">{formatScore(-result.nsScore)}</td><td className="px-3 py-3 text-right tabular-nums">{metric}</td></tr>
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-5 rounded-md bg-slate-50 px-3 py-3 text-sm text-slate-600">
            {rankingMethod === "datum-imps" && datum === null ? "Enter a whole-number NS datum score to calculate IMPs." : "Enter at least two complete results to calculate rankings."}
          </p>
        )}
        <p className="mt-5 text-xs leading-5 text-slate-500">Uses standard ACBL duplicate contract scoring and the IMP scale. Director adjustments, averages, penalties, and fouled boards are outside this calculator’s scope.</p>
      </section>
    </div>
  )
}
