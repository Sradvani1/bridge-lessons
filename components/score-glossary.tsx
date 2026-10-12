"use client"

import { useId, useState } from "react"

import { howellBoardCount } from "@/lib/howell"
import { BOARD_COUNT, MAX_BOARD_MATCHPOINTS, MAX_TOTAL_MATCHPOINTS } from "@/lib/mitchell"

type Props = {
  variant: "howell" | "mitchell"
  tableCount?: 2 | 3
}

function maximumFor(variant: Props["variant"], tableCount?: 2 | 3): { max: number; boards: number; boardMax: number } {
  if (variant === "howell") {
    const tc = tableCount ?? 3
    const boards = howellBoardCount(tc)
    const boardMax = (tc - 1) * 2
    return { max: boards * boardMax, boards, boardMax }
  }
  return { max: MAX_TOTAL_MATCHPOINTS, boards: BOARD_COUNT, boardMax: MAX_BOARD_MATCHPOINTS }
}

export default function ScoreGlossary({ variant, tableCount }: Props) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const { max, boards, boardMax } = maximumFor(variant, tableCount)
  const examplePercent = Math.round((7 / max) * 1000) / 10

  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={open}
        {...(open ? { "aria-controls": panelId } : {})}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#1d5138] px-3 text-sm font-semibold text-[#173c2a]"
      >
        <span aria-hidden="true" className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#1d5138] text-xs font-bold text-white">i</span>
        {open ? "Hide scoring help" : "What do these numbers mean?"}
      </button>
      {open ? (
        <div id={panelId} className="mt-2 space-y-2 rounded-lg bg-[#f3f7f3] p-3 text-sm leading-6 text-[#52615a]">
          <p className="font-semibold text-[#173c2a]">Each row shows 3 separate numbers: matchpoints, percent, boards.</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><span className="font-semibold text-[#173c2a]">MP</span> — matchpoints earned so far. {boardMax === 2 ? "Per board: 2 for best, 0 for worst, 1 each for a tie." : "Per board: 4 for best, 2 middle, 0 worst (ties split the points)."}</li>
            <li><span className="font-semibold text-[#173c2a]">%</span> — MP divided by {max} maximum, times 100. Example in this game: 7 MP is {examplePercent}%.</li>
            <li><span className="font-semibold text-[#173c2a]">B</span> — boards entered so far, out of {boards}. Uneven counts just mean some tables are ahead.</li>
            <li><span className="font-semibold text-[#173c2a]"># place</span> — shared places skip numbers, so #1, #1, #3 means a two-way tie for first.</li>
            {variant === "mitchell" ? (
              <li>North-South pairs only play North-South pairs; East-West only play East-West.</li>
            ) : (
              <li>Every pair plays every other pair, so all pairs share one list.</li>
            )}
            <li>Traveller <span className="font-semibold text-[#173c2a]">NS score</span>: plus means North-South won points, minus means East-West won. <span className="font-semibold text-[#173c2a]">MP on this board</span> is just that one board.</li>
          </ul>
        </div>
      ) : null}
    </div>
  )
}
