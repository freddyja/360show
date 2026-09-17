#!/usr/bin/env python3
"""Original look-pack overlays for 360show (no third-party brand marks)."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

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


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    packs = {
        "polaroid-stack.png": polaroid_stack,
        "disco-chrome.png": disco_chrome,
        "black-tie-bar.png": black_tie_bar,
    }
    for name, fn in packs.items():
        img = fn()
        path = OUT / name
        img.save(path, "PNG", optimize=True)
        a = img.split()[-1].histogram()
        print(f"{path.name}: {img.size} transparent={a[0]} opaque={a[255]}")


if __name__ == "__main__":
    main()
