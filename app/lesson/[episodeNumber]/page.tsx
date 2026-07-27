import { notFound } from "next/navigation"
import Link from "next/link"
import { getCategory } from "@/data/categories"
import { getAllLessons, getLesson, getSiblingLesson } from "@/lib/lessons"
import LessonNav from "@/components/lesson-nav"

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
    <>
      <Link
        href={`/category/${lesson.category}`}
        className="text-sm text-slate-500 no-underline hover:text-slate-700"
      >
        ← {category?.name ?? lesson.category}
      </Link>

      <h1 className="mt-2 text-2xl font-bold text-slate-900">{lesson.title}</h1>

      <p className="mt-1 text-xs text-slate-400">Episode {lesson.episodeNumber}</p>

      <div className="mt-6 border-t border-slate-200 pt-6">
        <div className="prose prose-slate max-w-none text-sm leading-relaxed whitespace-pre-line">
          {lesson.content}
        </div>
      </div>

      <LessonNav prev={prev} next={next} />
    </>
  )
}
