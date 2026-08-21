"use client"

import { startTransition, useEffect, useState } from "react"

type TextSize = "large" | "larger"

const storageKey = "bridge-text-size-v1"

function readTextSize(): TextSize {
  try {
    return localStorage.getItem(storageKey) === "larger" ? "larger" : "large"
  } catch {
    return "large"
  }
}

export default function TextSizeControl() {
  const [textSize, setTextSize] = useState<TextSize>("large")

  useEffect(() => {
    startTransition(() => setTextSize(readTextSize()))
  }, [])

  function changeTextSize(nextSize: TextSize) {
    document.documentElement.dataset.textSize = nextSize === "larger" ? "larger" : ""
    setTextSize(nextSize)
    try {
      localStorage.setItem(storageKey, nextSize)
    } catch {
      // The control still works for this visit if storage is unavailable.
    }
  }

  return (
    <fieldset className="flex min-h-11 items-center gap-1 rounded-lg border border-[#b7c6ba] bg-white p-1">
      <legend className="sr-only">Text size</legend>
      <button type="button" onClick={() => changeTextSize("large")} aria-pressed={textSize === "large"} className="min-h-11 rounded-md px-2 text-sm font-semibold text-[#294236] aria-pressed:bg-[#e4eee7]">
        Large
      </button>
      <button type="button" onClick={() => changeTextSize("larger")} aria-pressed={textSize === "larger"} className="min-h-11 rounded-md px-2 text-sm font-semibold text-[#294236] aria-pressed:bg-[#e4eee7]">
        Larger
      </button>
    </fieldset>
  )
}
