import Link from "next/link"

export default function Header() {
  return (
    <header className="border-b border-[#cbd5cc] bg-[#f3ecdc]">
      <div className="mx-auto max-w-5xl px-4 py-4 sm:px-6">
        <Link href="/" className="text-2xl font-bold tracking-tight text-[#123a28] no-underline sm:text-3xl">
          Bridge with Vimal
        </Link>
      </div>
    </header>
  )
}
