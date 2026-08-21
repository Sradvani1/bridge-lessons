import Link from "next/link"

export default function Header() {
  return (
    <header className="border-b border-slate-200">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
        <Link href="/" className="text-2xl font-bold text-slate-900 no-underline">
          Bridge by Vimal Advani
        </Link>
        <Link href="/calculator" className="text-sm font-semibold text-slate-600 no-underline hover:text-slate-900">
          Calculator
        </Link>
      </div>
    </header>
  )
}
