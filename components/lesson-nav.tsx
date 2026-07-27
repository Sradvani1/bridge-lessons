import Link from "next/link"
import type { Lesson } from "@/lib/lessons"

export default function LessonNav({
  prev,
  next,
}: {
  prev: Lesson | undefined
  next: Lesson | undefined
}) {
  return (
    <nav className="flex items-center justify-between border-t border-slate-200 pt-6">
      {prev ? (
        <Link
          href={`/lesson/${prev.episodeNumber}`}
          className="text-sm text-slate-600 no-underline hover:text-slate-900"
        >
          ← {prev.title}
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link
          href={`/lesson/${next.episodeNumber}`}
          className="text-sm text-slate-600 no-underline hover:text-slate-900"
        >
          {next.title} →
        </Link>
      ) : (
        <div />
      )}
    </nav>
  )
}
