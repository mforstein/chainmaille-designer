"""
Generate a 1024x1024 app icon for Chainmail Studio Designer.
Design:
  - Deep indigo background
  - Shawl silhouette (triangular drape, warm gradient)
  - Woven Rainbows interlocked-ring motif (6 overlapping colored rings, proper ring stroke)
  - "SD" bold letters + "Chainmail Studio" subtitle
"""

import math
from PIL import Image, ImageDraw, ImageFilter, ImageFont

SIZE = 1024
OUT = "resources/icon.png"

# Work in RGBA throughout
img = Image.new("RGBA", (SIZE, SIZE), (26, 16, 53, 255))   # deep indigo
draw = ImageDraw.Draw(img)

# Subtle radial glow at top-center
glow_layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow_layer)
for r in range(380, 0, -4):
    a = int(22 * (1 - r / 380))
    gd.ellipse((SIZE//2 - r, 60 - r, SIZE//2 + r, 60 + r), fill=(130, 90, 210, a))
glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(18))
img.alpha_composite(glow_layer)
draw = ImageDraw.Draw(img)

# ── Shawl silhouette ──────────────────────────────────────────────────────────
shawl_top_y = 195
shawl_bot_y = 935
shawl_cx   = SIZE // 2

# Layered triangles, lightest at edges to give fabric depth
shawl_defs = [
    (44,  980, (148, 100, 210, 55)),
    (86,  938, (130,  80, 190, 75)),
    (125, 899, (115,  68, 175, 95)),
    (160, 864, (100,  58, 162, 115)),
    (192, 832, ( 88,  50, 150, 130)),
]
for lx, rx, col in shawl_defs:
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.polygon([(lx, shawl_top_y), (rx, shawl_top_y), (shawl_cx, shawl_bot_y)], fill=col)
    img.alpha_composite(layer)
draw = ImageDraw.Draw(img)

# Shawl border
draw.polygon([(44, shawl_top_y), (980, shawl_top_y), (shawl_cx, shawl_bot_y)],
             outline=(190, 150, 240, 160), width=3)

# Horizontal weave lines on the shawl
for i in range(9):
    t = (i + 1) / 10
    y  = shawl_top_y + t * (shawl_bot_y - shawl_top_y)
    lx = 44  + t * (shawl_cx - 44)
    rx = 980 - t * (980 - shawl_cx)
    draw.line([(lx + 6, y), (rx - 6, y)], fill=(210, 170, 255, 50), width=2)

# ── Interlocked rings (WR motif) ─────────────────────────────────────────────
# Six rings in a 2-row hexagonal cluster, drawn with thick ellipse strokes
# so you see the coloured ring (not a filled disc) and the shawl shows through the hole.

RING_COLORS = [
    "#E53E3E",   # red    (bottom)
    "#DD6B20",   # orange
    "#D69E2E",   # gold
    "#38A169",   # green
    "#3182CE",   # blue
    "#805AD5",   # purple
]

cx_r = SIZE // 2
cy_r = 390        # vertical center of cluster

cluster_r = 110   # distance from cluster center to each ring center
ring_body = 80    # outer radius of each ring
ring_stroke = 30  # thickness of the ring torus

n = 6
ring_centers = []
for i in range(n):
    angle = math.pi / 2 + (2 * math.pi * i / n)
    ring_centers.append((cx_r + cluster_r * math.cos(angle),
                         cy_r + cluster_r * math.sin(angle)))

# Draw glows first (separate pass so they don't bleed onto other rings)
for (rx, ry), color in zip(ring_centers, RING_COLORS):
    r, g, b = int(color[1:3], 16), int(color[3:5], 16), int(color[5:7], 16)
    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gd   = ImageDraw.Draw(glow)
    gr   = ring_body + 22
    gd.ellipse((rx - gr, ry - gr, rx + gr, ry + gr), fill=(r, g, b, 55))
    glow = glow.filter(ImageFilter.GaussianBlur(12))
    img.alpha_composite(glow)

draw = ImageDraw.Draw(img)

# Draw rings as thick-stroked ellipses (outline only, so they look like metal rings)
for (rx, ry), color in zip(ring_centers, RING_COLORS):
    r, g, b = int(color[1:3], 16), int(color[3:5], 16), int(color[5:7], 16)

    # Dark rim for depth
    draw.ellipse((rx - ring_body - 4, ry - ring_body - 4,
                  rx + ring_body + 4, ry + ring_body + 4),
                 outline=(0, 0, 0, 140), width=ring_stroke + 8)

    # Coloured ring body
    draw.ellipse((rx - ring_body, ry - ring_body,
                  rx + ring_body, ry + ring_body),
                 outline=(r, g, b, 255), width=ring_stroke)

    # Highlight arc on upper-left
    hi_r, hi_g, hi_b = min(r+80, 255), min(g+80, 255), min(b+80, 255)
    draw.arc((rx - ring_body, ry - ring_body, rx + ring_body, ry + ring_body),
             start=200, end=310, fill=(hi_r, hi_g, hi_b, 170), width=ring_stroke - 6)

# ── "SD" lettering ───────────────────────────────────────────────────────────
font_path = "/System/Library/Fonts/SFCompactRounded.ttf"
try:
    font_big = ImageFont.truetype(font_path, 220)
    font_sub = ImageFont.truetype(font_path, 56)
except Exception:
    font_big = ImageFont.load_default()
    font_sub = font_big

text    = "CS"
text_y  = 672

# Drop shadow
for ox, oy in [(-5, 5), (5, 5), (0, 8)]:
    bb = draw.textbbox((0, 0), text, font=font_big)
    tw = bb[2] - bb[0]
    draw.text((SIZE // 2 - tw // 2 + ox, text_y + oy), text,
              font=font_big, fill=(0, 0, 0, 130))

# Main text
bb = draw.textbbox((0, 0), text, font=font_big)
tw = bb[2] - bb[0]
draw.text((SIZE // 2 - tw // 2, text_y), text,
          font=font_big, fill=(255, 248, 240, 255))

# Subtitle
sub = "Chainmail Studio"
sbb = draw.textbbox((0, 0), sub, font=font_sub)
sw  = sbb[2] - sbb[0]
draw.text((SIZE // 2 - sw // 2, text_y + 228), sub,
          font=font_sub, fill=(200, 168, 255, 210))

# ── Flatten to RGB and save ───────────────────────────────────────────────────
final = Image.new("RGB", (SIZE, SIZE), (26, 16, 53))
final.paste(img, mask=img.split()[3])
final.save(OUT, "PNG")
print(f"Saved {OUT}  ({SIZE}x{SIZE})")
