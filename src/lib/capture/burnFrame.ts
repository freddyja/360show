import { getFrameStyle, isBurnableFrame } from "../frames";
import type { FrameStyleId } from "../types";

export interface FrameBurnOptions {
  style?: FrameStyleId | string | null;
  names?: string | null;
  accentColor?: string | null;
}

export interface PreparedFrameBurn {
  style: FrameStyleId | "none";
  names: string;
  accent: string;
  image: HTMLImageElement | null;
}

const imageCache = new Map<string, Promise<HTMLImageElement | null>>();

function loadImage(src: string) {
  const hit = imageCache.get(src);
  if (hit) return hit;
  const work = (async () => {
    try {
      const img = new Image();
      img.decoding = "async";
      img.crossOrigin = "anonymous";
      img.src = src;
      await img.decode();
      return img;
    } catch {
      return null;
    }
  })();
  imageCache.set(src, work);
  return work;
}

export async function prepareFrameBurn(options: FrameBurnOptions = {}): Promise<PreparedFrameBurn> {
  const style = isBurnableFrame(options.style) ? (options.style as FrameStyleId) : "none";
  const pack = style === "none" ? null : getFrameStyle(style);
  const image = pack?.assetSrc ? await loadImage(pack.assetSrc) : null;
  return {
    style,
    names: (options.names || "").trim() || "Guests",
    accent: options.accentColor || pack?.defaultAccent || "#3B82F6",
    image,
  };
}

function coverImage(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource & { width: number; height: number },
  w: number,
  h: number,
) {
  const iw = img.width || w;
  const ih = img.height || h;
  const scale = Math.max(w / iw, h / ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawGoldOval(
  ctx: CanvasRenderingContext2D,
  video: CanvasImageSource,
  w: number,
  h: number,
) {
  ctx.fillStyle = "#120c08";
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w * 0.44, h * 0.38, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.drawImage(video, 0, 0, w, h);
  ctx.restore();

  const line = Math.max(6, Math.round(Math.min(w, h) * (10 / 900)));
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w * 0.44, h * 0.38, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "#1a1408";
  ctx.lineWidth = line + 8;
  ctx.stroke();
  ctx.strokeStyle = "#d4af37";
  ctx.lineWidth = line;
  ctx.stroke();
  ctx.strokeStyle = "rgba(248,231,160,0.7)";
  ctx.lineWidth = Math.max(2, Math.round(line * 0.25));
  ctx.beginPath();
  ctx.ellipse(w / 2, h / 2, w * 0.44 - line * 0.6, h * 0.38 - line * 0.6, 0, 0, Math.PI * 2);
  ctx.stroke();

  const arm = Math.max(28, Math.round(Math.min(w, h) * 0.045));
  const thick = Math.max(4, Math.round(line * 0.6));
  const insetX = w * 0.06;
  const insetY = h * 0.12;
  ctx.strokeStyle = "#f0d47a";
  ctx.lineWidth = thick;
  ctx.lineCap = "square";
  const corners: Array<[number, number, 1 | -1, 1 | -1]> = [
    [insetX, insetY, 1, 1],
    [w - insetX, insetY, -1, 1],
    [insetX, h - insetY, 1, -1],
    [w - insetX, h - insetY, -1, -1],
  ];
  for (const [x, y, dx, dy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x, y + arm * dy);
    ctx.lineTo(x, y);
    ctx.lineTo(x + arm * dx, y);
    ctx.stroke();
  }
}

function drawNeonRing(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  accent: string,
) {
  const sx = w / 1600;
  const sy = h / 900;
  ctx.save();
  ctx.scale(sx, sy);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.ellipse(800, 640, 520, 140, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(800, 640, 490, 118, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawMidnightArch(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  accent: string,
) {
  const sx = w / 1600;
  const sy = h / 900;
  ctx.save();
  ctx.scale(sx, sy);
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(140, 820);
  ctx.lineTo(140, 360);
  ctx.quadraticCurveTo(800, 40, 1460, 360);
  ctx.lineTo(1460, 820);
  ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.arc(180, 120, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(1420, 120, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawClassicPlaque(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  names: string,
) {
  const padX = w * 0.04;
  const boxH = Math.max(48, Math.round(h * 0.1));
  const boxW = w - padX * 2;
  const x = padX;
  const y = h - boxH - h * 0.04;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.strokeStyle = "rgba(253,230,138,0.4)";
  ctx.lineWidth = Math.max(1, Math.round(h * 0.002));
  roundRect(ctx, x, y, boxW, boxH, Math.min(24, boxH / 2));
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#fef3c7";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  let size = Math.max(16, Math.round(boxH * 0.38));
  ctx.font = `600 ${size}px ui-sans-serif, system-ui, sans-serif`;
  const label = names.toUpperCase();
  while (size > 12 && ctx.measureText(label).width > boxW - 32) {
    size -= 1;
    ctx.font = `600 ${size}px ui-sans-serif, system-ui, sans-serif`;
  }
  ctx.fillText(label, w / 2, y + boxH / 2);
}

/**
 * Draw the current video frame, then the look-pack overlay, into `ctx`.
 * Minimal / unknown styles copy the video with no decoration.
 */
export function drawVideoWithFrame(
  ctx: CanvasRenderingContext2D,
  video: CanvasImageSource,
  frame: PreparedFrameBurn,
  width: number,
  height: number,
) {
  if (frame.style === "gold-oval") {
    drawGoldOval(ctx, video, width, height);
    return;
  }

  ctx.drawImage(video, 0, 0, width, height);

  if (frame.style === "none") return;

  if (frame.style === "christian-fellowship" && frame.image) {
    coverImage(ctx, frame.image, width, height);
    return;
  }

  if (frame.style === "neon-ring") {
    drawNeonRing(ctx, width, height, frame.accent);
    return;
  }

  if (frame.style === "midnight-arch") {
    drawMidnightArch(ctx, width, height, frame.accent);
    return;
  }

  if (frame.style === "classic-plaque") {
    drawClassicPlaque(ctx, width, height, frame.names);
  }
}
