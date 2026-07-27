import { notFound } from "next/navigation"
import Link from "next/link"
import { categories, getCategory } from "@/data/categories"
import { getLessonsByCategory } from "@/lib/lessons"
import SearchWrapper from "./search-wrapper"

export function generateStaticParams() {
  return categories.map((c) => ({ slug: c.slug }))
}

export default async function CategoryPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params
  const category = getCategory(slug)
  if (!category) notFound()

  const lessons = getLessonsByCategory(slug).sort(
    (a, b) => a.episodeNumber - b.episodeNumber
  )

  return (
    <>
      <Link href="/" className="text-sm text-slate-500 no-underline hover:text-slate-700">
        ← All categories
      </Link>

      <h1 className="mt-2 text-2xl font-bold text-slate-900">{category.name}</h1>
      <p className="mt-1 text-sm text-slate-500">{category.description}</p>

      <SearchWrapper lessons={lessons} />
    </>
  )
}
