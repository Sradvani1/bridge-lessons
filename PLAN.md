# Bridge Lessons Website — Implementation Plan

## Stack
- **Framework**: Next.js 15 (App Router) + TypeScript
- **Styling**: Tailwind CSS + `@tailwindcss/typography`
- **Data**: Static JSON extracted from source PDF, imported at build time
- **Deployment**: Vercel (zero-config, default `.vercel.app` domain)
- **Search**: Client-side title matching (no dependencies)

## Source Data

`transcripts_show_67154.pdf` — 71 podcast lesson transcripts (Episodes 1–72, missing Episode 23).

### Extraction
- Use PyMuPDF to parse the PDF
- Strip the "Thank you for listening. Visit PodSights.ai…" footer from every transcript
- Output: `data/lessons.json`

### Lesson Schema
```ts
type Lesson = {
  id: string;               // "ep-1", "ep-2", etc.
  episodeNumber: number;    // 1–72 (gap at 23)
  title: string;
  category: CategorySlug;
  content: string;          // cleaned transcript text
}
```

### Categories

| # | Slug | Name | Episodes | Count |
|---|---|---|---|---|
| 1 | `bidding-fundamentals` | Bidding Fundamentals | 1, 2, 7, 10, 11, 12, 19, 21, 22, 32, 45, 46, 47, 51, 54, 71 | 16 |
| 2 | `no-trump-bidding` | No Trump Bidding | 3, 8, 20, 48 | 4 |
| 3 | `preemptive-bids` | Preemptive Bids | 5, 6 | 2 |
| 4 | `doubles-overcalling` | Doubles & Overcalling | 13, 14, 15, 16, 30 | 5 |
| 5 | `conventions` | Conventions | 9, 31, 40, 41, 42, 43, 49, 52, 53, 55 | 10 |
| 6 | `slam-bidding` | Slam Bidding | 17, 18, 24, 25, 44 | 5 |
| 7 | `trump-suit-play` | Trump & Suit Play | 4, 56, 57, 72 | 4 |
| 8 | `defense-signaling` | Defense & Signaling | 26, 27, 28, 29, 33, 38, 39, 59, 61, 70 | 10 |
| 9 | `play-techniques` | Play Techniques | 34, 35, 36, 37, 50, 58, 60, 62, 63, 64, 65, 66, 67, 68, 69 | 15 |

### Category Metadata (stored in `data/categories.ts`)

```ts
type Category = {
  slug: string;
  name: string;
  description: string;   // 1-sentence summary of the topic
}
```

## Routes

| Route | Type | Purpose |
|---|---|---|
| `/` | SSG | Category grid — 9 cards, one per category, showing name, description, lesson count |
| `/category/[slug]` | SSG (`generateStaticParams`) | Lesson list — all episodes in a category with a search input to filter by title |
| `/lesson/[episodeNumber]` | SSG (`generateStaticParams`) | Full transcript — title, episode number, category badge, clean prose, prev/next within category |

All routes use `generateStaticParams` since all content is known at build time. No server-side fetching needed.

## Component Tree

```
Layout
├── Header (app name + nav link home)
└── {page content}

HomePage
├── CategoryCard × 9
│   └── name, description, lesson count, link to /category/[slug]

CategoryPage
├── CategoryHeader (name + description)
├── SearchInput (filters lesson list client-side by title)
└── LessonCard × N
    └── episode number, title, link to /lesson/[episodeNumber]

LessonPage
├── LessonHeader (episode number, title, category badge)
├── LessonContent (prose-styled transcript)
└── LessonNav (prev / next within same category)
```

## Data Flow

1. **Build time**: `data/lessons.json` is imported via TypeScript `import` (resolved at build time by Next.js)
2. **`generateStaticParams`**: Iterates lessons to produce paths for `/category/[slug]` and `/lesson/[episodeNumber]`
3. **Page props**: The relevant lesson(s) are passed as props — no runtime data fetching
4. **Search**: `SearchInput` component filters already-rendered lesson array client-side via `useState` + `useMemo`

No API routes, no database, no server runtime.

## Design

- **Typography**: `prose` class from `@tailwindcss/typography` for lesson content
- **Font**: System font stack (Tailwind `sans`)
- **Colors**: Slate/gray neutral palette
- **Layout**: `max-w-4xl` centered; single column mobile, multi-column desktop
- **Code**: No custom CSS — all Tailwind utility classes
- **No**: dark mode, custom fonts, icons, images, animations, analytics

## Edge Cases Handled

| Case | Handling |
|---|---|
| Missing Episode 23 | No route generated for it — visiting `/lesson/23` returns Next.js default 404 |
| Category with 2 episodes (Preemptive) | Still renders as a full category page with lesson cards |
| Category with 16 episodes (Bidding Fundamentals) | No pagination needed — list fits one scroll |
| Long content (max 2.7K chars) | `prose` handles wrapping naturally |
| Search with no results | Show "No lessons found" message |
| Very narrow viewport | Stack layout gracefully |
| Deploy without git | `git init` before first commit |

## Implementation Order

1. **Scaffold**: Next.js + Tailwind + `@tailwindcss/typography` + `.gitignore` update
2. **Data**: Run extraction script → `data/lessons.json` + create `data/categories.ts`
3. **Components**: Build component tree bottom-up (Card → Search → Nav → Pages)
4. **Pages**: Implement `/`, `/category/[slug]`, `/lesson/[episodeNumber]`
5. **Verify**: `npm run build` — confirm 71+9+1 = 81 static pages generated
6. **Deploy**: Git commit → GitHub → Vercel

## Files to Create

```
bridge-app/
├── PLAN.md                           ← this file
├── .gitignore
├── data/
│   ├── lessons.json                  ← generated by extraction script
│   └── categories.ts                 ← static category metadata
├── scripts/
│   └── extract-pdf.py                ← PyMuPDF extraction script
├── app/
│   ├── layout.tsx                    ← root layout with header
│   ├── page.tsx                      ← home / category grid
│   ├── globals.css                   ← Tailwind directives
│   ├── category/
│   │   └── [slug]/
│   │       └── page.tsx              ← category lesson list
│   └── lesson/
│       └── [episodeNumber]/
│           └── page.tsx              ← lesson detail
├── components/
│   ├── category-card.tsx
│   ├── lesson-card.tsx
│   ├── lesson-nav.tsx
│   ├── search-input.tsx
│   └── header.tsx
└── lib/
    └── lessons.ts                    ← shared helpers (getLesson, getCategoryLessons, etc.)
```
