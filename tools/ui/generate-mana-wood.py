"""Generate the original dev-only walnut surface; no reference image is sampled.

Offline authoring tool: Python, NumPy and Pillow (not application dependencies).
Run from the repository root: python tools/ui/generate-mana-wood.py
"""

from pathlib import Path

import numpy as np
from PIL import Image


WIDTH, HEIGHT = 1536, 768
rng = np.random.default_rng(180)
y, x = np.mgrid[:HEIGHT, :WIDTH].astype(float)


def field(columns, rows):
    """Smooth, nonperiodic random variation at a chosen fibre aspect ratio."""
    samples = rng.random((rows, columns)).astype(np.float32)
    return np.asarray(
        Image.fromarray(samples).resize((WIDTH, HEIGHT), Image.Resampling.BICUBIC)
    ) - 0.5


# A gently wandering growth direction, with two elongated, off-centre knots.
warp = 19 * field(7, 8) + 6 * field(15, 17)
knots = np.zeros_like(x)
for cx, cy, spread in [(350, 210, 1), (1240, 580, 0.75)]:
    dx, dy = (x - cx) / (220 * spread), (y - cy) / (42 * spread)
    envelope = np.exp(-0.5 * (dx * dx + dy * dy))
    warp += 29 * spread * np.tanh(dy * 2) * envelope
    radius = np.sqrt(dx * dx + dy * dy + 0.06)
    knots += (np.sin(17 * radius + 2 * field(9, 12)) * 0.6 - 0.5) * envelope

sample_y = np.clip(y + warp, 0, HEIGHT - 1)
lower = sample_y.astype(int)
upper = np.minimum(lower + 1, HEIGHT - 1)
fraction = sample_y - lower


def fibre(columns, rows):
    source = field(columns, rows)
    return source[lower, x.astype(int)] * (1 - fraction) + source[upper, x.astype(int)] * fraction


# Irregular fibres and pores, rather than periodic stripes or plank divisions.
grain = (17 * fibre(7, 95) + 12 * fibre(19, 240)
         + 6 * fibre(45, 600) + 13 * field(5, 9) + 5 * knots)
pores = np.maximum(0, -fibre(65, 380) - 0.2) * 22
# Fine growth lines follow the same warped fibres. Vary their phase and strength
# along the surface so they never become straight, evenly spaced ruled lines.
phase = sample_y * 1.7 + 8 * fibre(13, 125) + 3 * field(34, 38)
growth = np.maximum(0, np.sin(phase)) ** 14
growth *= 3 + 12 * (fibre(42, 190) + 0.5)
tone = grain - pores - growth + rng.normal(0, 0.85, (HEIGHT, WIDTH))
rgb = np.stack([70 + tone * 1.2, 40 + tone * 0.85, 28 + tone * 0.6], axis=-1)
image = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
target = Path(__file__).resolve().parents[2] / 'frontend/src/playground/mana-walnut.webp'
image.save(target, 'WEBP', quality=88, method=6)
print(f'{target.name}: {WIDTH}×{HEIGHT}, {target.stat().st_size} bytes')
