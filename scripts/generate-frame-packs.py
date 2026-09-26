#!/usr/bin/env python3
"""Original look-pack overlays for 360show (no third-party brand marks)."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1920, 1080
OUT = Path(__file__).resolve().parent.parent / "public" / "frames"


def lerp(a, b, t):
    t = np.clip(t, 0, 1)
    return a + (b - a) * t


def rounded_rect_sdf(x, y, cx, cy, hw, hh, r):
    qx = np.abs(x - cx) - (hw - r)
    qy = np.abs(y - cy) - (hh - r)
    ox = np.maximum(qx, 0)
    oy = np.maximum(qy, 0)
    return np.sqrt(ox * ox + oy * oy) + np.minimum(np.maximum(qx, qy), 0) - r


def rotate_layer(img: Image.Image, angle: float, fill=(0, 0, 0, 0)) -> Image.Image:
    return img.rotate(angle, resample=Image.Resampling.BICUBIC, expand=False, fillcolor=fill)


def drop_shadow(mask: Image.Image, offset=(18, 22), blur=22, color=(20, 14, 8, 140)) -> Image.Image:
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    layer = Image.new("RGBA", (W, H), color)
    shadow.paste(layer, offset, mask)
    return shadow.filter(ImageFilter.GaussianBlur(blur))


def noise_layer(alpha=18):
    rng = np.random.default_rng(360)
    n = rng.integers(0, 255, size=(H, W), dtype=np.uint8)
    a = np.full((H, W), alpha, dtype=np.uint8)
    return Image.fromarray(np.dstack([n, n, n, a]), "RGBA")


def polaroid_stack() -> Image.Image:
    yy, xx = np.mgrid[0:H, 0:W]
    # Warm charcoal table
    radial = np.sqrt(((xx - W * 0.5) / (W * 0.7)) ** 2 + ((yy - H * 0.45) / (H * 0.8)) ** 2)
    bg = np.zeros((H, W, 4), dtype=np.float32)
    bg[..., 0] = lerp(58, 28, radial)
    bg[..., 1] = lerp(48, 22, radial)
    bg[..., 2] = lerp(38, 18, radial)
    bg[..., 3] = 255
    base = Image.fromarray(bg.astype(np.uint8), "RGBA")
    base = Image.alpha_composite(base, noise_layer(14))

    def polaroid_body(rot, shift, window_clear: bool, shade=0):
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        draw = ImageDraw.Draw(layer)
        x0, y0, x1, y1 = 220 + shift[0], 36 + shift[1], 1700 + shift[0], 1018 + shift[1]
        cream = (245 - shade, 240 - shade, 232 - shade, 255)
        edge = (228 - shade, 220 - shade, 208 - shade, 255)
        draw.rounded_rectangle([x0, y0, x1, y1], radius=18, fill=cream, outline=edge, width=3)
        # inner photo well
        ix0, iy0, ix1, iy1 = x0 + 78, y0 + 72, x1 - 78, y1 - 188
        if window_clear:
            draw.rounded_rectangle([ix0, iy0, ix1, iy1], radius=6, fill=(0, 0, 0, 0))
        else:
            draw.rounded_rectangle(
                [ix0, iy0, ix1, iy1],
                radius=6,
                fill=(186 - shade, 176 - shade, 164 - shade, 255),
            )
            # fake stacked print
            draw.rectangle(
                [ix0 + 40, iy0 + 36, ix1 - 120, iy1 - 48],
                fill=(160 - shade, 150 - shade, 138 - shade, 255),
            )
        # caption strip lines
        draw.line([(x0 + 120, y1 - 96), (x1 - 120, y1 - 96)], fill=(210, 200, 188, 90), width=2)
        rotated = rotate_layer(layer, rot)
        mask = rotated.split()[-1]
        shadow = drop_shadow(mask, offset=(14, 18), blur=20, color=(24, 16, 10, 150))
        return shadow, rotated, (ix0, iy0, ix1, iy1)

    back_s, back, _ = polaroid_body(6.4, (48, -18), window_clear=False, shade=18)
    front_s, front, window = polaroid_body(-1.35, (0, 8), window_clear=True, shade=0)
    out = Image.alpha_composite(base, back_s)
    out = Image.alpha_composite(out, back)
    out = Image.alpha_composite(out, front_s)
    out = Image.alpha_composite(out, front)

    # Punch the front window after rotation by sampling front alpha from a pre-rotated mask.
    # Recreate an unrotated window mask, rotate it the same way, then clear those pixels.
    hole = Image.new("L", (W, H), 0)
    hd = ImageDraw.Draw(hole)
    hd.rounded_rectangle(window, radius=6, fill=255)
    hole = hole.rotate(-1.35, resample=Image.Resampling.BICUBIC, expand=False, fillcolor=0)
    arr = np.array(out)
    m = np.array(hole) > 120
    arr[m, 3] = 0
    # keep a 2px inner edge so the well reads
    return Image.fromarray(arr, "RGBA")


def disco_chrome() -> Image.Image:
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    cx, cy = W / 2, H / 2 - 8
    hw, hh, r = 820, 430, 54
    sdf = rounded_rect_sdf(xx, yy, cx, cy, hw, hh, r)
    inner = rounded_rect_sdf(xx, yy, cx, cy, hw - 78, hh - 78, max(8, r - 18))

    # Nightclub wash
    rad = np.sqrt(((xx - cx) / (W * 0.62)) ** 2 + ((yy - cy) / (H * 0.7)) ** 2)
    rgb = np.zeros((H, W, 3), dtype=np.float32)
    rgb[..., 0] = lerp(12, 4, rad)
    rgb[..., 1] = lerp(18, 8, rad)
    rgb[..., 2] = lerp(28, 10, rad)
    # cyan glow in the hole (won't be visible once punched, helps the bezel rim)
    glow = np.clip(1.2 - rad, 0, 1) ** 2
    rgb[..., 1] += glow * 18
    rgb[..., 2] += glow * 28

    bezel = (sdf < 6) & (inner > -4)
    # Specular: light from top-left
    nx = (xx - cx) / hw
    ny = (yy - cy) / hh
    spec = np.clip(0.55 - 0.55 * nx - 0.7 * ny, 0, 1) ** 1.6
    rim = np.exp(-np.abs(sdf) * 0.08) * (inner > 0)
    silver = np.array([168, 184, 198], dtype=np.float32)
    chrome = np.array([232, 240, 248], dtype=np.float32)
    cyan = np.array([103, 232, 249], dtype=np.float32)
    dark = np.array([48, 58, 72], dtype=np.float32)
    metal = lerp(dark[None, None, :], chrome[None, None, :], spec[..., None])
    metal = lerp(metal, silver[None, None, :], 0.25)
    rgb = np.where(bezel[..., None], metal, rgb)
    # outer cyan hairline
    hair = (np.abs(sdf) < 3.2) & (sdf > -1)
    rgb = np.where(hair[..., None], lerp(rgb, cyan[None, None, :], 0.85), rgb)
    # inner cyan
    inner_hair = (np.abs(inner) < 2.6) & (inner > -2)
    rgb = np.where(inner_hair[..., None], lerp(rgb, cyan[None, None, :], 0.7), rgb)
    # bright specular streak
    streak = bezel & (yy < cy - 40) & (spec > 0.62)
    rgb = np.where(streak[..., None], lerp(rgb, np.array([250, 253, 255])[None, None, :], 0.65), rgb)

    alpha = np.full((H, W), 255, dtype=np.float32)
    alpha = np.where(inner < -1.5, 0, alpha)
    # soft bezel edge
    alpha = np.where((sdf > 0) & (sdf < 10), np.clip(255 * (1 - sdf / 10), 0, 255), alpha)

    # extra sparkle dots on the bezel only
    rng = np.random.default_rng(88)
    img = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), alpha]).astype(np.uint8), "RGBA")
    spark = ImageDraw.Draw(img)
    for _ in range(36):
        ang = rng.uniform(0, np.pi * 2)
        ring = rng.uniform(0.0, 1.0)
        px = int(cx + np.cos(ang) * ((hw - 78) + ring * 70))
        py = int(cy + np.sin(ang) * ((hh - 78) + ring * 70))
        if px < 20 or py < 20 or px > W - 20 or py > H - 20:
            continue
        # skip the video hole
        if abs(px - cx) < hw - 90 and abs(py - cy) < hh - 90:
            continue
        rads = int(rng.integers(1, 3))
        spark.ellipse([px - rads, py - rads, px + rads, py + rads], fill=(230, 248, 255, 220))
    return img


def black_tie_bar() -> Image.Image:
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    # Matte black with a hint of vignette
    rad = np.sqrt(((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H / 2) / (H * 0.85)) ** 2)
    rgb = np.zeros((H, W, 3), dtype=np.float32)
    rgb[..., :] = lerp(18, 8, rad)[..., None]
    rgb[..., 0] += 2
    img = Image.fromarray(np.dstack([rgb.astype(np.uint8), np.full((H, W), 255, dtype=np.uint8)]), "RGBA")
    draw = ImageDraw.Draw(img)

    window = [108, 56, 1812, 868]
    # ivory outer rule
    draw.rounded_rectangle(window, radius=4, outline=(244, 239, 228, 255), width=3)
    draw.rounded_rectangle(
        [window[0] + 7, window[1] + 7, window[2] - 7, window[3] - 7],
        radius=2,
        outline=(90, 90, 88, 255),
        width=1,
    )
    # plaque band
    plaque = [160, 900, 1760, 1044]
    draw.rounded_rectangle(plaque, radius=2, fill=(12, 12, 12, 255), outline=(244, 239, 228, 230), width=2)
    draw.rectangle([plaque[0] + 18, plaque[1] + 10, plaque[2] - 18, plaque[1] + 12], fill=(244, 239, 228, 40))
    # thin ivory hairlines
    draw.line([(220, 972), (1700, 972)], fill=(244, 239, 228, 40), width=1)
    # tiny diamond marks
    def diamond(x, y, s=7):
        draw.polygon([(x, y - s), (x + s, y), (x, y + s), (x - s, y)], outline=(244, 239, 228, 200))

    diamond(210, 972)
    diamond(1710, 972)

    arr = np.array(img)
    yy2, xx2 = np.mgrid[0:H, 0:W]
    hole = (
        (xx2 > window[0] + 10)
        & (xx2 < window[2] - 10)
        & (yy2 > window[1] + 10)
        & (yy2 < window[3] - 10)
    )
    arr[hole, 3] = 0
    return Image.fromarray(arr, "RGBA")


NEON_FONT = "/usr/share/fonts/truetype/macos/Inter-Bold.ttf"
PINK = np.array([255.0, 20.0, 160.0])
PURPLE = np.array([176.0, 24.0, 255.0])
CYAN = np.array([0.0, 236.0, 255.0])


def neon_mark(img: Image.Image, text: str, x: int, y: int, size: int) -> None:
    """White lettering with a hot-pink / cyan offset so it reads as neon."""
    font = ImageFont.truetype(NEON_FONT, size)
    glow = Image.new("RGBA", img.size, (0, 0, 0, 0))
    pen = ImageDraw.Draw(glow)
    pen.text((x - 7, y - 1), text, font=font, fill=(255, 45, 149, 255))
    pen.text((x + 7, y + 3), text, font=font, fill=(0, 236, 255, 255))
    img.alpha_composite(glow.filter(ImageFilter.GaussianBlur(7)))
    ImageDraw.Draw(img).text((x, y), text, font=font, fill=(255, 255, 255, 255))


def neon_80s() -> Image.Image:
    """Saturated synthwave bezel. Photo well stays clear; 80 and S sit on the name bar."""
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    win_l, win_t, win_r, win_b = 78.0, 42.0, 1842.0, 868.0
    cx = (win_l + win_r) / 2
    cy = (win_t + win_b) / 2
    hw = (win_r - win_l) / 2
    hh = (win_b - win_t) / 2
    radius = 26.0
    outer = rounded_rect_sdf(xx, yy, cx, cy, hw, hh, radius)
    inner = rounded_rect_sdf(xx, yy, cx, cy, hw - 36, hh - 36, max(8.0, radius - 14))

    u = xx / (W - 1)
    v = yy / (H - 1)
    # Pure hues: hot pink on the left, electric purple on the right, cyan along the top edge.
    rgb = np.broadcast_to(PINK, (H, W, 3)).copy()
    right = np.clip((u - 0.38) / 0.28, 0, 1)
    rgb = lerp(rgb, PURPLE, right[..., None])
    top_band = np.clip((0.16 - v) / 0.07, 0, 1)
    rgb = lerp(rgb, CYAN, top_band[..., None])

    outside = outer > 14
    horizon = np.clip((yy - H * 0.45) / (H * 0.4), 0, 1)
    h_line = outside & (np.mod(yy, 32.0) < 1.6)
    v_line = outside & (yy > H * 0.62) & (np.mod(xx, 70.0) < 1.5)
    rgb = np.where(h_line[..., None], lerp(rgb, CYAN, (0.85 * np.maximum(horizon, 0.35))[..., None]), rgb)
    rgb = np.where(v_line[..., None], lerp(rgb, PINK, (0.8 * horizon)[..., None]), rgb)

    bezel = (outer < 4) & (inner > -4)
    # Pure neon around the well: cyan along the top, pink on the sides, purple along the bottom.
    side = np.abs(xx - cx) / hw
    topness = np.clip(-(yy - cy) / hh, 0, 1)
    bottomness = np.clip((yy - cy) / hh, 0, 1)
    metal = np.broadcast_to(PINK, rgb.shape).copy()
    metal = lerp(metal, CYAN, topness[..., None])
    metal = lerp(metal, PURPLE, (bottomness * (1 - topness))[..., None])
    metal = lerp(metal, PINK, np.clip(side - 0.35, 0, 1)[..., None])
    rgb = np.where(bezel[..., None], metal, rgb)

    glow = np.exp(-np.clip(outer, 0, 40) * 0.055) * (outer > 2)
    rgb = lerp(rgb, PINK, (glow * 0.82)[..., None])
    outer_hair = (np.abs(outer) < 8) & (outer > -2)
    inner_hair = (np.abs(inner) < 7) & (inner > -2)
    rgb = np.where(outer_hair[..., None], PINK, rgb)
    rgb = np.where(inner_hair[..., None], CYAN, rgb)
    streak = bezel & (yy < win_t + 22) & (np.abs(xx - cx) < hw * 0.72)
    rgb = np.where(streak[..., None], lerp(rgb, np.array([245.0, 255.0, 255.0]), 0.55), rgb)

    alpha = np.full((H, W), 255, dtype=np.float32)
    alpha = np.where(inner < -2.0, 0.0, alpha)
    img = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), alpha]).astype(np.uint8), "RGBA")
    draw = ImageDraw.Draw(img)

    plaque = [48, 892, 1872, 1056]
    draw.rounded_rectangle(plaque, radius=18, fill=(109, 18, 214, 255), outline=(255, 20, 160, 255), width=8)
    draw.rounded_rectangle(
        [plaque[0] + 12, plaque[1] + 12, plaque[2] - 12, plaque[3] - 12],
        radius=12,
        outline=(0, 236, 255, 255),
        width=4,
    )

    word = "80S"
    size = 112
    font = ImageFont.truetype(NEON_FONT, size)
    box = font.getbbox(word)
    bar_mid = (plaque[1] + plaque[3]) / 2
    word_y = int(bar_mid - (box[3] - box[1]) / 2 - box[1])
    word_w = box[2] - box[0]
    neon_mark(img, word, 78 - box[0], word_y, size)
    neon_mark(img, word, 1920 - 78 - word_w - box[0], word_y, size)
    return img


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    packs = {
        "polaroid-stack.png": polaroid_stack,
        "disco-chrome.png": disco_chrome,
        "black-tie-bar.png": black_tie_bar,
        "neon-80s.png": neon_80s,
    }
    for name, fn in packs.items():
        img = fn()
        path = OUT / name
        img.save(path, "PNG", optimize=True)
        a = img.split()[-1].histogram()
        print(f"{path.name}: {img.size} transparent={a[0]} opaque={a[255]}")


if __name__ == "__main__":
    main()
