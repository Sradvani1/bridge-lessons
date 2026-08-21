import Link from "next/link"
import type { Lesson } from "@/lib/lessons"

export default function LessonCard({ lesson }: { lesson: Lesson }) {
  return (
    <Link
      href={`/lesson/${lesson.episodeNumber}`}
      className="block min-h-14 rounded-xl border border-[#b7c6ba] bg-white px-5 py-4 no-underline hover:border-[#527360] hover:bg-[#f6faf6]"
    >
      <span className="font-semibold leading-7 text-[#173c2a]">{lesson.title}</span>
    </Link>
  )
}
