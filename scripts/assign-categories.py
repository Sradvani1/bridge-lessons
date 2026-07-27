import json

CATEGORY_MAP = {
    1: "bidding-fundamentals", 2: "bidding-fundamentals",
    7: "bidding-fundamentals", 10: "bidding-fundamentals",
    11: "bidding-fundamentals", 12: "bidding-fundamentals",
    19: "bidding-fundamentals", 21: "bidding-fundamentals",
    22: "bidding-fundamentals", 32: "bidding-fundamentals",
    45: "bidding-fundamentals", 46: "bidding-fundamentals",
    47: "bidding-fundamentals", 51: "bidding-fundamentals",
    54: "bidding-fundamentals", 71: "bidding-fundamentals",

    3: "no-trump-bidding", 8: "no-trump-bidding",
    20: "no-trump-bidding", 48: "no-trump-bidding",

    5: "preemptive-bids", 6: "preemptive-bids",

    13: "doubles-overcalling", 14: "doubles-overcalling",
    15: "doubles-overcalling", 16: "doubles-overcalling",
    30: "doubles-overcalling",

    9: "conventions", 31: "conventions",
    40: "conventions", 41: "conventions",
    42: "conventions", 43: "conventions",
    49: "conventions", 52: "conventions",
    53: "conventions", 55: "conventions",

    17: "slam-bidding", 18: "slam-bidding",
    24: "slam-bidding", 25: "slam-bidding",
    44: "slam-bidding",

    4: "trump-suit-play", 56: "trump-suit-play",
    57: "trump-suit-play", 72: "trump-suit-play",

    26: "defense-signaling", 27: "defense-signaling",
    28: "defense-signaling", 29: "defense-signaling",
    33: "defense-signaling", 38: "defense-signaling",
    39: "defense-signaling", 59: "defense-signaling",
    61: "defense-signaling", 70: "defense-signaling",

    34: "play-techniques", 35: "play-techniques",
    36: "play-techniques", 37: "play-techniques",
    50: "play-techniques", 58: "play-techniques",
    60: "play-techniques", 62: "play-techniques",
    63: "play-techniques", 64: "play-techniques",
    65: "play-techniques", 66: "play-techniques",
    67: "play-techniques", 68: "play-techniques",
    69: "play-techniques",
}

with open('data/lessons.json') as f:
    lessons = json.load(f)

for lesson in lessons:
    lesson["category"] = CATEGORY_MAP.get(lesson["episodeNumber"], "uncategorized")

with open('data/lessons.json', 'w') as f:
    json.dump(lessons, f, indent=2, ensure_ascii=False)

cats = set(l["category"] for l in lessons)
counts = {c: sum(1 for l in lessons if l["category"] == c) for c in sorted(cats)}
for c, n in counts.items():
    print(f"  {c}: {n}")
print(f"Total: {sum(counts.values())}")
