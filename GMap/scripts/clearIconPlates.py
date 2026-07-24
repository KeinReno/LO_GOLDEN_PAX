from pathlib import Path
import re

base = Path(r"c:\Users\Reno\Desktop\LO_GOLDEN_PAX\GMap\public\icons\game")
count = 0
for p in sorted(base.glob("*.svg")):
    text = p.read_text(encoding="utf-8")
    original = text
    # Remove opaque plates we injected earlier
    text = re.sub(
        r'<rect width="512" height="512" rx="56" fill="#0a1018"\s*/?>',
        "",
        text,
    )
    text = re.sub(
        r'<path d="M0 0h512v512H0z"(?:\s*fill="[^"]*")?\s*/?>',
        "",
        text,
    )
    text = re.sub(
        r'<path fill="[^"]*" d="M0 0h512v512H0z"\s*/?>',
        "",
        text,
    )
    if text != original:
        p.write_text(text, encoding="utf-8")
        count += 1
        print("cleared", p.name)
print("total", count)
