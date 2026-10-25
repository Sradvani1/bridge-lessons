import { PAIR_PRESETS } from "./game-data"

/** Pair-name limit shared with the lobby inputs. */
export const REGULAR_NAME_MAX_LENGTH = 60

const REGULARS_STORAGE_KEY = "bridge-regulars"

/** A copy of the built-in list used to seed new devices. */
export function defaultRegulars(): string[] {
  return [...PAIR_PRESETS]
}

/** Trimmed name within length, or null for blank/non-string input. */
export function cleanRegularName(value: unknown): string | null {
  if (typeof value !== "string") return null
  const name = value.trim().slice(0, REGULAR_NAME_MAX_LENGTH).trim()
  return name.length > 0 ? name : null
}

/** Cleaned names with blanks and case-insensitive duplicates removed, order kept. */
export function dedupeRegulars(names: readonly unknown[]): string[] {
  const seen = new Set<string>()
  const cleaned: string[] = []
  for (const raw of names) {
    const name = cleanRegularName(raw)
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    cleaned.push(name)
  }
  return cleaned
}

function readStoredRegulars(): string[] | null {
  try {
    if (typeof window === "undefined" || !("localStorage" in window)) return null
    const raw = window.localStorage.getItem(REGULARS_STORAGE_KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return dedupeRegulars(parsed)
  } catch {
    return null
  }
}

/** Saved list, or the built-in names on first run / corrupt storage. */
export function loadRegulars(): string[] {
  return readStoredRegulars() ?? defaultRegulars()
}

/** Persist a cleaned copy; returns what was kept. Never throws. */
export function saveRegulars(names: readonly unknown[]): string[] {
  const cleaned = dedupeRegulars(names)
  try {
    if (typeof window !== "undefined" && "localStorage" in window) {
      window.localStorage.setItem(REGULARS_STORAGE_KEY, JSON.stringify(cleaned))
    }
  } catch {
    // Private browsing may refuse storage; the list still works for this session.
  }
  return cleaned
}
