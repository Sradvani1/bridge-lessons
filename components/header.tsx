import Link from "next/link"
import TextSizeControl from "@/components/text-size-control"

export default function Header() {
  return (
    <header className="border-b border-[#cbd5cc] bg-[#f3ecdc]">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
        <Link href="/" className="text-2xl font-bold tracking-tight text-[#123a28] no-underline sm:text-3xl">
          Bridge with Vimal
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Primary navigation" className="flex items-center gap-2">
            <Link href="/" className="flex min-h-11 items-center rounded-lg px-3 font-semibold text-[#294236] no-underline hover:bg-white hover:text-[#123a28]">
              Lessons
            </Link>
            <Link href="/calculator" className="flex min-h-11 items-center rounded-lg bg-[#1d5138] px-3 font-semibold text-white no-underline hover:bg-[#123a28]">
              Calculator
            </Link>
          </nav>
          <TextSizeControl />
        </div>
      </div>
    </header>
  )
}
