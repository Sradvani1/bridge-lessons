import type { Metadata } from "next"
import "./globals.css"
import Header from "@/components/header"

export const metadata: Metadata = {
  title: "Bridge Lessons",
  description: "Learn contract bridge with categorized lessons covering bidding, play, defense, and conventions.",
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col bg-white text-slate-900 font-sans">
        <Header />
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">{children}</main>
      </body>
    </html>
  )
}
