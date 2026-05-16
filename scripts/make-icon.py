#!/usr/bin/env python3
"""Generate media/icon.png for the Comment MD extension.

Transparent canvas with a dark-mode Markdown document on the left and a
blue comment bubble overlapping its top-right corner, tail pointing down
toward the highlighted line.
"""

from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "media" / "icon.png"

W = 256
img = Image.new("RGBA", (W, W), (0, 0, 0, 0))
d = ImageDraw.Draw(img)


def rrect(xy, r, fill):
    d.rounded_rectangle(xy, radius=r, fill=fill)


# --- Document (dark-mode paper) ---
DX1, DY1, DX2, DY2 = 38, 38, 178, 222
rrect((DX1, DY1, DX2, DY2), 12, "#1e293b")

PAD = 14
LX1 = DX1 + PAD
LX2 = DX2 - PAD
LX2_SHORT = DX2 - PAD - 30
GRAY = "#475569"
HEADING = "#94a3b8"

# Heading
rrect((LX1, DY1 + 22, LX2_SHORT, DY1 + 34), 2, HEADING)

# Body lines, one of them highlighted
y = DY1 + 50
rrect((LX1, y, LX2, y + 6), 2, GRAY); y += 16
rrect((LX1, y, LX2 - 20, y + 6), 2, GRAY); y += 16

HL_Y = y
rrect((LX1 - 2, HL_Y - 3, LX2 + 2, HL_Y + 9), 3, "#facc15")
y += 16

rrect((LX1, y, LX2, y + 6), 2, GRAY); y += 16
rrect((LX1, y, LX2 - 10, y + 6), 2, GRAY); y += 16
rrect((LX1, y, LX2 - 30, y + 6), 2, GRAY); y += 16
rrect((LX1, y, LX2, y + 6), 2, GRAY); y += 16

# --- Comment bubble (blue) overlapping top-right of the document ---
BX1, BY1, BX2, BY2 = 130, 22, 226, 114
rrect((BX1, BY1, BX2, BY2), 14, "#3b82f6")

# Tail pointing DOWN-LEFT toward the highlighted line below
TAIL = [(BX1 + 14, BY2 - 4), (BX1 + 6, BY2 + 22), (BX1 + 34, BY2 - 4)]
d.polygon(TAIL, fill="#3b82f6")

# White text-lines inside the bubble
BPAD = 14
WHITE = "#ffffff"
rrect((BX1 + BPAD, BY1 + 18, BX2 - BPAD, BY1 + 24), 2, WHITE)
rrect((BX1 + BPAD, BY1 + 34, BX2 - BPAD - 12, BY1 + 40), 2, WHITE)
rrect((BX1 + BPAD, BY1 + 50, BX2 - BPAD - 4, BY1 + 56), 2, WHITE)
rrect((BX1 + BPAD, BY1 + 66, BX2 - BPAD - 20, BY1 + 72), 2, WHITE)

OUT.parent.mkdir(parents=True, exist_ok=True)
img.save(OUT, "PNG", optimize=True)
print(f"Wrote {OUT} ({W}x{W}, RGBA)")
