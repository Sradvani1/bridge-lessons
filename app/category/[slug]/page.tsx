import { notFound } from "next/navigation"
import Link from "next/link"
import { categories, getCategory } from "@/data/categories"
import { getLessonsByCategory } from "@/lib/lessons"
import LessonCard from "@/components/lesson-card"

export function generateStaticParams() {
  return categories.map((c) => ({ slug: c.slug }))
}

export default async function CategoryPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params
  const category = getCategory(slug)
  if (!category) notFound()

  const lessons = getLessonsByCategory(slug)

  return (
    <div>
      <Link href="/#lesson-categories" className="inline-flex min-h-11 items-center rounded-lg px-3 font-semibold text-[#355545] no-underline hover:bg-[#edf4ef] hover:text-[#123a28]">
        ← Back to Topics
      </Link>

      <h1 className="mt-4 text-3xl font-bold tracking-tight text-[#123a28] text-balance">{category.name}</h1>
      <p className="mt-3 max-w-3xl leading-8 text-[#52615a]">{category.description}</p>

      <div className="mt-8 space-y-3">
        {lessons.map((l) => (
          <LessonCard key={l.id} lesson={l} />
        ))}
      </div>
    </div>
  )
}
