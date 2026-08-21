import { categories } from "@/data/categories"
import { getCategoriesWithCounts } from "@/lib/lessons"
import CategoryCard from "@/components/category-card"
import Link from "next/link"

export default function HomePage() {
  const counts = getCategoriesWithCounts()
  const countMap = new Map(counts.map((c) => [c.slug, c.count]))

  return (
    <div className="space-y-10">
      <section className="rounded-2xl border border-[#cbd5cc] bg-[#f3ecdc] p-6 sm:p-8">
        <p className="font-semibold uppercase tracking-[0.14em] text-[#6b4b08]">Learn & play together</p>
        <h1 className="mt-2 max-w-3xl text-3xl font-bold tracking-tight text-[#123a28] text-balance sm:text-4xl">
          Bridge lessons for every stage of the game
        </h1>
        <p className="mt-4 max-w-2xl leading-8 text-[#3f5147]">
          Bridge lessons from Vimal Advani, created for learners to enjoy at their own pace.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <a href="#lesson-categories" className="flex min-h-16 items-center justify-between rounded-xl bg-[#1d5138] px-5 font-bold text-white no-underline hover:bg-[#123a28]">
            Browse Lessons <span aria-hidden="true">→</span>
          </a>
          <Link href="/calculator" className="flex min-h-16 items-center justify-between rounded-xl border-2 border-[#1d5138] bg-white px-5 font-bold text-[#173c2a] no-underline hover:bg-[#edf4ef]">
            Open Score Calculator <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <section id="lesson-categories" className="scroll-mt-6">
        <h2 className="text-2xl font-bold text-[#123a28]">Browse by topic</h2>
        <p className="mt-2 leading-7 text-[#52615a]">Choose a topic to read the lessons in order.</p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((cat) => (
          <CategoryCard
            key={cat.slug}
            category={cat}
            count={countMap.get(cat.slug) ?? 0}
          />
        ))}
      </div>
      </section>
    </div>
  )
}
