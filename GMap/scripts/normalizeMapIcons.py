from pathlib import Path
import re

base = Path(r"c:\Users\Reno\Desktop\LO_GOLDEN_PAX\GMap\public\icons\game")
BG = '<rect width="512" height="512" rx="56" fill="#0a1018"/>'
count = 0

for p in sorted(base.glob("*.svg")):
    text = p.read_text(encoding="utf-8")
    original = text

    # Replace black full-bleed backgrounds with standard plate
    text = re.sub(
        r'<path d="M0 0h512v512H0z"(?:\s*fill="[^"]*")?\s*/?>',
        BG,
        text,
    )
    text = re.sub(
        r'<path fill="[^"]*" d="M0 0h512v512H0z"\s*/?>',
        BG,
        text,
    )

    if 'fill="#0a1018"' not in text:
        m = re.search(r"(<svg[^>]*>)", text, re.I)
        if m:
            text = text[: m.end()] + BG + text[m.end() :]

    if text != original:
        p.write_text(text, encoding="utf-8")
        count += 1
        print("updated", p.name)

print("total", count)
