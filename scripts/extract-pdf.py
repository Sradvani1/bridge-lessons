import json, re
import fitz

doc = fitz.open('source.pdf')
lessons = []

for i in range(len(doc)):
    text = doc[i].get_text()
    lines = text.strip().split('\n')

    ep_id = ''
    ep_num = 0
    title = ''
    content_start = 0

    for j, line in enumerate(lines):
        if line.startswith('Episode ID:'):
            ep_id = line.split(':', 1)[1].strip()
        elif line.startswith('Episode Number:'):
            ep_num = int(line.split(':', 1)[1].strip())
        elif line.startswith('Title:'):
            title = line.split(':', 1)[1].strip()
        elif line.startswith('====') and ep_id and ep_num and title:
            content_start = j + 1
            break

    content_lines = lines[content_start:] if content_start else []
    # Filter out PodSights footer lines before joining
    footer_kws = ['podsights', 'thank you for listening', 'create a podcast']
    content_lines = [
        l for l in content_lines
        if not any(kw in l.lower() for kw in footer_kws)
    ]
    content = '\n'.join(content_lines).strip()
    # Remove trailing orphan fragments left by partial footer extraction
    content = re.sub(r'\s*\.\s*\.\s*$', '', content)

    lessons.append({
        "id": f"ep-{ep_num}",
        "episodeNumber": ep_num,
        "title": title,
        "content": content,
    })

with open('data/lessons.json', 'w') as f:
    json.dump(lessons, f, indent=2, ensure_ascii=False)

print(f'Extracted {len(lessons)} lessons to data/lessons.json')
