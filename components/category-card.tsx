import Link from "next/link"
import type { Category } from "@/data/categories"

export default function CategoryCard({ category, count }: { category: Category; count: number }) {
  return (
    <Link
      href={`/category/${category.slug}`}
      className="block min-h-36 rounded-xl border border-[#b7c6ba] bg-white p-5 no-underline hover:border-[#527360] hover:bg-[#f6faf6]"
    >
      <h2 className="text-xl font-bold text-[#173c2a]">{category.name}</h2>
      <p className="mt-2 leading-7 text-[#52615a]">{category.description}</p>
      <p className="mt-3 font-semibold text-[#476052]">
        {count} {count === 1 ? "lesson" : "lessons"}
      </p>
    </Link>
  )
}
