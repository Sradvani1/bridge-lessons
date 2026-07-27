import Link from "next/link"

export default function Header() {
  return (
    <header className="border-b border-slate-200">
      <div className="mx-auto max-w-4xl flex items-center justify-between px-4 py-4">
        <Link href="/" className="text-lg font-semibold text-slate-900 no-underline">
          Bridge Lessons
        </Link>
      </div>
    </header>
  )
}
