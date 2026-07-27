import Link from "next/link"
import type { Lesson } from "@/lib/lessons"

export default function LessonCard({ lesson }: { lesson: Lesson }) {
  return (
    <Link
      href={`/lesson/${lesson.episodeNumber}`}
      className="flex items-center gap-3 rounded-md border border-slate-200 px-4 py-3 no-underline transition-colors hover:border-slate-400 hover:bg-slate-50"
    >
      <span className="shrink-0 text-xs font-medium text-slate-400 w-6 text-right">
        {lesson.episodeNumber}
      </span>
      <span className="text-sm text-slate-900">{lesson.title}</span>
    </Link>
  )
}
