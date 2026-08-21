import type { Metadata } from "next"
import "./globals.css"
import Header from "@/components/header"

export const metadata: Metadata = {
  title: "Bridge with Vimal",
  description: "72 lessons on contract bridge — bidding, play, defense, and conventions.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  icons: { icon: "/favicon.svg" },
  openGraph: {
    title: "Bridge with Vimal",
    description: "72 lessons on contract bridge — bidding, play, defense, and conventions.",
    siteName: "Bridge with Vimal",
    type: "website",
  },
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans">
        <a href="#main-content" className="sr-only z-50 rounded-b-lg bg-[#123a28] px-4 py-3 font-semibold text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-0">
          Skip to main content
        </a>
        <Header />
        <main id="main-content" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-10">{children}</main>
      </body>
    </html>
  )
}
