"use client"

import { useState, useMemo } from "react"
import type { Lesson } from "@/lib/lessons"
import LessonCard from "@/components/lesson-card"
import SearchInput from "@/components/search-input"

export default function SearchWrapper({ lessons }: { lessons: Lesson[] }) {
  const [query, setQuery] = useState("")

  const filtered = useMemo(() => {
    if (!query.trim()) return lessons
    const q = query.toLowerCase()
    return lessons.filter((l) => l.title.toLowerCase().includes(q))
  }, [query, lessons])

  return (
    <div className="mt-6">
      <SearchInput value={query} onChange={setQuery} />
      <div className="mt-4 space-y-2">
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-400">No lessons found.</p>
        ) : (
          filtered.map((l) => <LessonCard key={l.id} lesson={l} />)
        )}
      </div>
    </div>
  )
}
