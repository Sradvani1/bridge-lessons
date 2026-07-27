import lessonsData from "@/data/lessons.json"
import type { Category } from "@/data/categories"

export interface Lesson {
  id: string
  episodeNumber: number
  title: string
  content: string
  category: string
}

export type LessonWithCategory = Lesson & { categoryMeta: Category }

const lessons = lessonsData as Lesson[]

export function getAllLessons(): Lesson[] {
  return lessons
}

export function getLesson(episodeNumber: number): Lesson | undefined {
  return lessons.find((l) => l.episodeNumber === episodeNumber)
}

export function getLessonsByCategory(slug: string): Lesson[] {
  return lessons.filter((l) => l.category === slug)
}

export function getCategoriesWithCounts(): { slug: string; count: number }[] {
  const counts: Record<string, number> = {}
  for (const l of lessons) {
    counts[l.category] = (counts[l.category] || 0) + 1
  }
  return Object.entries(counts).map(([slug, count]) => ({ slug, count }))
}

export function getSiblingLesson(
  episodeNumber: number,
  category: string,
  direction: "prev" | "next"
): Lesson | undefined {
  const siblings = getLessonsByCategory(category).sort(
    (a, b) => a.episodeNumber - b.episodeNumber
  )
  const idx = siblings.findIndex((l) => l.episodeNumber === episodeNumber)
  if (idx === -1) return undefined
  const target = direction === "prev" ? idx - 1 : idx + 1
  return siblings[target] ?? undefined
}
