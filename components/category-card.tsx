import Link from "next/link"
import type { Category } from "@/data/categories"

export default function CategoryCard({ category, count }: { category: Category; count: number }) {
  return (
    <Link
      href={`/category/${category.slug}`}
      className="block rounded-lg border border-slate-200 p-5 no-underline transition-colors hover:border-slate-400 hover:bg-slate-50"
    >
      <h2 className="text-base font-semibold text-slate-900">{category.name}</h2>
      <p className="mt-1 text-sm text-slate-500">{category.description}</p>
      <p className="mt-2 text-xs text-slate-400">
        {count} {count === 1 ? "lesson" : "lessons"}
      </p>
    </Link>
  )
}
