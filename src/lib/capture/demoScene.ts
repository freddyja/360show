const W = 1280;
const H = 720;

export function createDemoScene() {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");

  const particles = Array.from({ length: 42 }, (_, i) => ({
    r: 90 + (i % 7) * 36,
    speed: 0.4 + (i % 5) * 0.12,
    size: 1.5 + (i % 3),
    phase: i * 0.7,
  }));

  let start = performance.now();
  let raf = 0;
  let running = false;

  const draw = (now: number) => {
    const t = (now - start) / 1000;
    const cx = W / 2;
    const cy = H / 2 + 24;

    const g = ctx.createRadialGradient(cx, cy - 40, 40, cx, cy, 520);
    g.addColorStop(0, "#13203a");
    g.addColorStop(1, "#070b14");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(255, 236, 180, 0.18)";
    ctx.beginPath();
    ctx.ellipse(cx, 70, 28, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 248, 220, 0.7)";
    ctx.beginPath();
    ctx.ellipse(cx, 70, 10, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(12, 22, 42, 0.95)";
    ctx.beginPath();
    ctx.ellipse(cx, cy + 150, 340, 92, 0, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 7; i += 1) {
      ctx.strokeStyle = `rgba(59, 130, 246, ${0.55 - i * 0.06})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(cx, cy + 150, 250 - i * 8, 70 - i * 3, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    const ang = t * 1.15;
    for (let p = 0; p < 16; p += 1) {
      const a = ang + p * 0.09;
      const x = cx + 250 * Math.cos(a);
      const y = cy + 150 + 70 * Math.sin(a);
      ctx.fillStyle = `rgba(190, 220, 255, ${0.85 - p * 0.04})`;
      ctx.beginPath();
      ctx.arc(x, y, 6 - p * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }

    const sway = Math.sin(ang) * 16;
    drawFigure(ctx, cx - 36 + sway * 0.15, cy + 40, 1.08, -8);
    drawFigure(ctx, cx + 38 + sway * 0.15, cy + 34, 1, 8);
    ctx.strokeStyle = "rgba(40, 54, 86, 0.95)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy - 8);
    ctx.lineTo(cx + 12, cy - 10);
    ctx.stroke();

    for (const p of particles) {
      const a = t * p.speed + p.phase;
      const x = cx + p.r * Math.cos(a);
      const y = cy - 30 + 80 * Math.sin(a * 1.25);
      ctx.fillStyle = "rgba(210, 230, 255, 0.7)";
      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  const loop = (now: number) => {
    draw(now);
    if (running) raf = requestAnimationFrame(loop);
  };

  return {
    canvas,
    start() {
      running = true;
      start = performance.now();
      raf = requestAnimationFrame(loop);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    captureStream(fps = 30) {
      return canvas.captureStream(fps);
    },
  };
}

function drawFigure(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  scale: number,
  lean: number,
) {
  ctx.fillStyle = "rgba(16, 24, 42, 0.95)";
  ctx.beginPath();
  ctx.ellipse(x, y - 118 * scale, 16 * scale, 18 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 22 * scale + lean, y - 96 * scale);
  ctx.lineTo(x + 22 * scale + lean, y - 96 * scale);
  ctx.lineTo(x + 28 * scale, y + 8 * scale);
  ctx.lineTo(x - 28 * scale, y + 8 * scale);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 20 * scale, y - 20 * scale);
  ctx.lineTo(x + 20 * scale, y - 20 * scale);
  ctx.lineTo(x + 52 * scale, y + 88 * scale);
  ctx.lineTo(x - 50 * scale, y + 88 * scale);
  ctx.closePath();
  ctx.fill();
}
