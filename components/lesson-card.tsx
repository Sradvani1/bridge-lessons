import Link from "next/link"
import type { Lesson } from "@/lib/lessons"

export default function LessonCard({ lesson }: { lesson: Lesson }) {
  return (
    <Link
      href={`/lesson/${lesson.episodeNumber}`}
      className="block rounded-md border border-slate-200 px-4 py-3 no-underline transition-colors hover:border-slate-400 hover:bg-slate-50"
    >
      <span className="text-sm text-slate-900">{lesson.title}</span>
    </Link>
  )
}
