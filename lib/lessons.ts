import lessonsData from "@/data/lessons.json"

export interface Lesson {
  id: string
  episodeNumber: number
  title: string
  content: string
  category: string
}

const lessons = lessonsData as Lesson[]

export function getAllLessons(): Lesson[] {
  return lessons
}

export function getLesson(episodeNumber: number): Lesson | undefined {
  return lessons.find((l) => l.episodeNumber === episodeNumber)
}

export function getLessonsByCategory(slug: string): Lesson[] {
  return lessons
    .filter((l) => l.category === slug)
    .sort((a, b) => a.episodeNumber - b.episodeNumber)
}

export function getCategoriesWithCounts(): { slug: string; count: number }[] {
  const counts: Record<string, number> = {}
  for (const l of lessons) {
    counts[l.category] = (counts[l.category] || 0) + 1
  }
  return Object.entries(counts).map(([slug, count]) => ({ slug, count }))
}

export function formatContent(content: string): string[] {
  const lines = content.split("\n")
  const paragraphs: string[] = []
  let current = lines[0]
  for (const line of lines.slice(1)) {
    const prevEndsSentence = current.trimEnd().match(/[.!?]$/)
    const startsUpper = line.length > 0 && /[A-Z]/.test(line[0])
    if (startsUpper && prevEndsSentence) {
      paragraphs.push(current)
      current = line
    } else {
      current += " " + line
    }
  }
  if (current) paragraphs.push(current)
  return paragraphs
}

export function getSiblingLesson(
  episodeNumber: number,
  category: string,
  direction: "prev" | "next"
): Lesson | undefined {
  const siblings = getLessonsByCategory(category)
  const idx = siblings.findIndex((l) => l.episodeNumber === episodeNumber)
  if (idx === -1) return undefined
  const target = direction === "prev" ? idx - 1 : idx + 1
  return siblings[target] ?? undefined
}
