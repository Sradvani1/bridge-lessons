import { notFound } from "next/navigation"
import Link from "next/link"
import { getCategory } from "@/data/categories"
import { getAllLessons, getLesson, getSiblingLesson, formatContent } from "@/lib/lessons"
import LessonNav from "@/components/lesson-nav"
import LessonActions from "@/components/lesson-actions"

export function generateStaticParams() {
  return getAllLessons().map((l) => ({
    episodeNumber: l.episodeNumber.toString(),
  }))
}

export default async function LessonPage(props: {
  params: Promise<{ episodeNumber: string }>
}) {
  const { episodeNumber } = await props.params
  const num = parseInt(episodeNumber, 10)
  if (isNaN(num)) notFound()

  const lesson = getLesson(num)
  if (!lesson) notFound()

  const category = getCategory(lesson.category)
  const prev = getSiblingLesson(num, lesson.category, "prev")
  const next = getSiblingLesson(num, lesson.category, "next")

  return (
    <article>
      <Link
        href={`/category/${lesson.category}`}
        className="inline-flex min-h-11 items-center rounded-lg px-3 font-semibold text-[#355545] no-underline hover:bg-[#edf4ef] hover:text-[#123a28]"
      >
        ← {category?.name ?? lesson.category}
      </Link>

      <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#123a28] text-balance sm:text-4xl">{lesson.title}</h1>

      <div className="mt-3 flex items-center gap-2">
        {category && (
          <span className="rounded-full bg-[#e4eee7] px-3 py-1 text-sm font-semibold text-[#355545]">
            {category.name}
          </span>
        )}
      </div>
      <LessonActions />

      <div className="mt-8 max-w-3xl border-t border-[#cbd5cc] pt-8">
        <div className="prose max-w-none text-[#263b30] prose-p:my-0 prose-p:mb-6 prose-p:leading-8 prose-p:text-pretty">
          {formatContent(lesson.content).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </div>

      <LessonNav prev={prev} next={next} />
    </article>
  )
}
