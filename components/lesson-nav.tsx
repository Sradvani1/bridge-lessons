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
    <nav data-print-hidden aria-label="Lesson navigation" className="mt-10 grid gap-3 border-t border-[#cbd5cc] pt-6 sm:grid-cols-2">
      {prev ? (
        <Link
          href={`/lesson/${prev.episodeNumber}`}
          className="flex min-h-14 items-center rounded-xl border border-[#b7c6ba] bg-white px-4 font-semibold leading-6 text-[#294236] no-underline hover:bg-[#edf4ef]"
        >
          ← <span className="ml-2 min-w-0">{prev.title}</span>
        </Link>
      ) : (
        <div className="hidden sm:block" />
      )}
      {next ? (
        <Link
          href={`/lesson/${next.episodeNumber}`}
          className="flex min-h-14 items-center justify-end rounded-xl border border-[#b7c6ba] bg-white px-4 text-right font-semibold leading-6 text-[#294236] no-underline hover:bg-[#edf4ef]"
        >
          <span className="mr-2 min-w-0">{next.title}</span> →
        </Link>
      ) : (
        <div className="hidden sm:block" />
      )}
    </nav>
  )
}
