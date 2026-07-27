import { categories } from "@/data/categories"
import { getCategoriesWithCounts } from "@/lib/lessons"
import CategoryCard from "@/components/category-card"

export default function HomePage() {
  const counts = getCategoriesWithCounts()
  const countMap = new Map(counts.map((c) => [c.slug, c.count]))

  return (
    <>
      <h1 className="text-2xl font-bold text-slate-900">Bridge Lessons</h1>
      <p className="mt-1 text-sm text-slate-500">
        71 lessons covering bidding, play, defense, and conventions.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((cat) => (
          <CategoryCard
            key={cat.slug}
            category={cat}
            count={countMap.get(cat.slug) ?? 0}
          />
        ))}
      </div>
    </>
  )
}
