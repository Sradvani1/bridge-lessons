"use client"

import { useState } from "react"

export default function LessonActions() {
  const [status, setStatus] = useState("")

  async function shareLesson() {
    const shareData = { title: document.title, url: window.location.href }
    try {
      if (navigator.share) {
        await navigator.share(shareData)
        setStatus("Lesson shared.")
      } else {
        await navigator.clipboard.writeText(window.location.href)
        setStatus("Lesson link copied.")
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      setStatus("Unable to share this lesson. Copy the address from your browser instead.")
    }
  }

  return (
    <div data-print-hidden className="mt-5 flex flex-wrap gap-3">
      <button type="button" onClick={shareLesson} className="min-h-11 rounded-lg border border-[#7d9585] bg-white px-4 font-semibold text-[#173c2a] hover:bg-[#edf4ef]">
        Share Lesson
      </button>
      <button type="button" onClick={() => window.print()} className="min-h-11 rounded-lg border border-[#7d9585] bg-white px-4 font-semibold text-[#173c2a] hover:bg-[#edf4ef]">
        Print Lesson
      </button>
      <p aria-live="polite" className="self-center text-sm text-[#52615a]">{status}</p>
    </div>
  )
}
