#!/usr/bin/env node
// Booth split guard: the /tablet remote must never pull in camera, recorder,
// frame-burn, music-mix, or Capture code. Walks the static import graph from
// the tablet entry points and fails if any booth-only module is reachable.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const src = join(root, "src");
const ENTRIES = ["src/app/tablet/page.tsx", "src/app/tablet/layout.tsx", "src/app/tablet-icon/route.tsx"];
const FORBIDDEN = [
  /^src\/lib\/capture\//,
  /^src\/lib\/hardware\//,
  /^src\/lib\/music\/(?!beds\.ts$)/,
  /^src\/lib\/store\.tsx$/,
  /^src\/lib\/db\.ts$/,
  /^src\/lib\/remote\/client\.ts$/,
  /^src\/components\/screens\/(?!TabletOperatorScreen\.tsx$)/,
  /^src\/components\/(RampPlayer|FrameOverlay|RemoteEnablePanel)\.tsx$/,
];
const EXT = ["", ".ts", ".tsx", ".js", "/index.ts", "/index.tsx"];

function resolveSpec(from, spec) {
  let base;
  if (spec.startsWith("@/")) base = join(src, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null; // package
  for (const ext of EXT) if (existsSync(base + ext) && !(base + ext).endsWith("/")) {
    try { readFileSync(base + ext); return base + ext; } catch { /* dir */ }
  }
  return null;
}

const seen = new Map();
const stack = ENTRIES.map((e) => [join(root, e), null]);
const bad = [];
while (stack.length) {
  const [file, parent] = stack.pop();
  if (seen.has(file)) continue;
  seen.set(file, parent);
  const rel = relative(root, file);
  if (FORBIDDEN.some((re) => re.test(rel))) {
    const chain = [];
    for (let f = file; f; f = seen.get(f)) chain.unshift(relative(root, f));
    bad.push(chain.join(" -> "));
    continue;
  }
  const code = readFileSync(file, "utf8");
  if (/getUserMedia|MediaRecorder|AudioContext/.test(code) && !rel.endsWith("deviceRole.ts")) {
    bad.push(`${rel} uses a camera/recorder/audio API`);
  }
  for (const m of code.matchAll(/(?:import|export)\s[^'"]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)) {
    const next = resolveSpec(file, m[1] || m[2]);
    if (next) stack.push([next, file]);
  }
}
if (bad.length) {
  console.error("Tablet bundle reaches booth-only code:\n  " + bad.join("\n  "));
  process.exit(1);
}
console.log(`tablet split OK: ${seen.size} modules reachable from /tablet, none booth-only.`);
