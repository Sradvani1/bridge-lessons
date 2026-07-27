export interface Category {
  slug: string
  name: string
  description: string
}

export const categories: Category[] = [
  {
    slug: "bidding-fundamentals",
    name: "Bidding Fundamentals",
    description: "Opening bids, responses, forcing bids, and basic bidding systems.",
  },
  {
    slug: "no-trump-bidding",
    name: "No Trump Bidding",
    description: "No trump openings, responses, and forcing no trump auctions.",
  },
  {
    slug: "preemptive-bids",
    name: "Preemptive Bids",
    description: "Weak two bids, three-level preempts, and disruptive bidding.",
  },
  {
    slug: "doubles-overcalling",
    name: "Doubles & Overcalling",
    description: "Takeout doubles, overcalls, and competitive auction tactics.",
  },
  {
    slug: "conventions",
    name: "Conventions",
    description: "Stayman, transfers, splinters, Drury, and other partnership agreements.",
  },
  {
    slug: "slam-bidding",
    name: "Slam Bidding",
    description: "Gerber, Blackwood, Roman Key Card Blackwood, and slam exploration.",
  },
  {
    slug: "trump-suit-play",
    name: "Trump & Suit Play",
    description: "Drawing trumps, covering honors, and managing the trump suit.",
  },
  {
    slug: "defense-signaling",
    name: "Defense & Signaling",
    description: "Opening leads, signals, discards, and defensive strategies.",
  },
  {
    slug: "play-techniques",
    name: "Play Techniques",
    description: "Finessing, endplay, squeezes, entry management, and declarer play.",
  },
]

export function getCategory(slug: string): Category | undefined {
  return categories.find((c) => c.slug === slug)
}
