#!/usr/bin/env node
/**
 * Generate original, royalty-free looping WAV beds for 360show.
 * These are synthesized here — they are not recordings of commercial songs.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SAMPLE_RATE = 22050;
const DURATION_SEC = 16;
const CHANNELS = 2;
const TOTAL = SAMPLE_RATE * DURATION_SEC;

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "music");
mkdirSync(outDir, { recursive: true });

function midi(note) {
  return 440 * 2 ** ((note - 69) / 12);
}

function clamp(value, min = -1, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function env(t, attack, decay, sustain, release, dur) {
  if (t < 0 || t > dur) return 0;
  if (t < attack) return t / (attack || 1e-4);
  if (t < attack + decay) {
    const u = (t - attack) / (decay || 1e-4);
    return 1 - u * (1 - sustain);
  }
  if (t > dur - release) {
    const u = (dur - t) / (release || 1e-4);
    return sustain * u;
  }
  return sustain;
}

function expDecay(t, rate) {
  return Math.exp(-Math.max(0, t) * rate);
}

function sine(freq, t, phase = 0) {
  return Math.sin(2 * Math.PI * freq * t + phase);
}

function triangle(freq, t) {
  const p = (freq * t) % 1;
  return 4 * Math.abs(p - 0.5) - 1;
}

function squareSoft(freq, t) {
  return Math.tanh(1.8 * sine(freq, t));
}

function noise() {
  return Math.random() * 2 - 1;
}

function lowpassState() {
  return { y: 0 };
}

function lowpass(state, x, cutoff) {
  const a = clamp(cutoff, 0.01, 0.99);
  state.y += a * (x - state.y);
  return state.y;
}

function tanhLimit(x, drive = 1.15) {
  return Math.tanh(x * drive);
}

function stereo(left, right, pan) {
  const angle = ((pan + 1) / 2) * (Math.PI / 2);
  return [left * Math.cos(angle), right * Math.sin(angle)];
}

function writeWav(name, samples) {
  const bytes = TOTAL * CHANNELS * 2;
  const buffer = Buffer.alloc(44 + bytes);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + bytes, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(CHANNELS, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * CHANNELS * 2, 28);
  buffer.writeUInt16LE(CHANNELS * 2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(bytes, 40);
  for (let i = 0; i < TOTAL; i += 1) {
    const l = clamp(samples[i * 2] ?? 0);
    const r = clamp(samples[i * 2 + 1] ?? 0);
    buffer.writeInt16LE((l * 32767) | 0, 44 + i * 4);
    buffer.writeInt16LE((r * 32767) | 0, 44 + i * 4 + 2);
  }
  const path = join(outDir, name);
  writeFileSync(path, buffer);
  console.log(`wrote ${name} (${(buffer.length / 1024).toFixed(0)} KB)`);
}

function fadeLoop(samples) {
  const fade = Math.floor(SAMPLE_RATE * 0.06);
  for (let i = 0; i < fade; i += 1) {
    const a = i / fade;
    const b = (fade - i) / fade;
    samples[i * 2] *= a;
    samples[i * 2 + 1] *= a;
    const j = TOTAL - fade + i;
    samples[j * 2] *= b;
    samples[j * 2 + 1] *= b;
  }
  return samples;
}

function mixAt(samples, i, l, r, gain = 1) {
  if (i < 0 || i >= TOTAL) return;
  samples[i * 2] += l * gain;
  samples[i * 2 + 1] += r * gain;
}

function renderNote(samples, startSec, dur, freq, gain, pan, voice) {
  const start = Math.floor(startSec * SAMPLE_RATE);
  const n = Math.floor(dur * SAMPLE_RATE);
  for (let i = 0; i < n; i += 1) {
    const t = i / SAMPLE_RATE;
    const amp = voice(t, freq, dur);
    const [l, r] = stereo(amp, amp, pan);
    mixAt(samples, start + i, l, r, gain);
  }
}

function pianoVoice(t, freq, dur) {
  const a = env(t, 0.008, 0.18, 0.28, 0.35, dur);
  const hammer = expDecay(t, 28) * 0.12 * noise();
  return (
    a *
    (0.62 * sine(freq, t) +
      0.28 * sine(freq * 2, t) * expDecay(t, 4.2) +
      0.12 * sine(freq * 3, t) * expDecay(t, 6.5) +
      0.06 * sine(freq * 4.02, t) * expDecay(t, 9) +
      hammer)
  );
}

function padVoice(t, freq, dur) {
  const a = env(t, 0.9, 1.2, 0.7, 1.4, dur);
  return (
    a *
    (0.45 * sine(freq, t) +
      0.28 * sine(freq * 1.5, t, 0.4) +
      0.18 * sine(freq * 2.003, t, 1.1) +
      0.09 * triangle(freq * 0.5, t))
  );
}

function bassVoice(t, freq, dur) {
  const a = env(t, 0.01, 0.08, 0.55, 0.08, dur);
  return a * (0.7 * sine(freq, t) + 0.3 * sine(freq * 2, t) * expDecay(t, 8));
}

function cinematicSwell() {
  const samples = new Float64Array(TOTAL * 2);
  const bars = [
    [45, 48, 52, 57], // A minor
    [41, 45, 48, 53], // F
    [48, 52, 55, 60], // C
    [43, 47, 50, 55], // G
  ];
  const barDur = 4;
  for (let bar = 0; bar < 4; bar += 1) {
    const start = bar * barDur;
    const chord = bars[bar];
    chord.forEach((note, idx) => {
      renderNote(samples, start, barDur + 0.4, midi(note), 0.16, (idx - 1.5) * 0.28, padVoice);
    });
    const motif = [69, 72, 76, 74];
    motif.forEach((note, i) => {
      renderNote(samples, start + i * 0.85, 1.3, midi(note), 0.11, 0.15, (t, freq, dur) => {
        const a = env(t, 0.12, 0.3, 0.45, 0.4, dur);
        return a * sine(freq, t) * (0.7 + 0.3 * sine(0.4, t));
      });
    });
  }
  const lpL = lowpassState();
  const lpR = lowpassState();
  for (let i = 0; i < TOTAL; i += 1) {
    const t = i / SAMPLE_RATE;
    const swell = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin((Math.PI * t) / DURATION_SEC - Math.PI / 2));
    const cutoff = 0.04 + 0.12 * swell;
    samples[i * 2] = tanhLimit(lowpass(lpL, samples[i * 2] * swell, cutoff) * 1.8);
    samples[i * 2 + 1] = tanhLimit(lowpass(lpR, samples[i * 2 + 1] * swell, cutoff) * 1.8);
  }
  return fadeLoop(samples);
}

function romanticPiano() {
  const samples = new Float64Array(TOTAL * 2);
  // Original waltz in C — not based on any commercial melody.
  const left = [
    [48, 52, 55],
    [47, 50, 55],
    [45, 48, 52],
    [43, 47, 50],
    [41, 45, 48],
    [45, 48, 53],
    [43, 47, 50],
    [48, 52, 55],
  ];
  const melody = [76, 79, 81, 79, 76, 72, 74, 76, 74, 71, 72, 67, 69, 71, 72, 74];
  const beat = 60 / 90;
  left.forEach((chord, bar) => {
    const start = bar * beat * 3;
    chord.forEach((note, idx) => {
      renderNote(samples, start + idx * beat * 0.08, beat * 2.6, midi(note), 0.2, -0.35, pianoVoice);
    });
  });
  melody.forEach((note, i) => {
    const start = i * beat;
    renderNote(samples, start, beat * 1.15, midi(note), 0.34, 0.22, pianoVoice);
  });
  for (let i = 0; i < TOTAL; i += 1) {
    samples[i * 2] = tanhLimit(samples[i * 2] * 1.35);
    samples[i * 2 + 1] = tanhLimit(samples[i * 2 + 1] * 1.35);
  }
  return fadeLoop(samples);
}

function firstDancePiano() {
  const samples = new Float64Array(TOTAL * 2);
  const arp = [
    [55, 59, 62, 67], // G
    [52, 55, 59, 64], // Em
    [48, 52, 55, 60], // C
    [50, 54, 57, 62], // D
  ];
  const melody = [74, 71, 67, 69, 71, 69, 66, 67, 69, 71, 74, 72, 71, 67, 69, 67];
  const step = 0.25;
  for (let bar = 0; bar < 8; bar += 1) {
    const chord = arp[bar % 4];
    for (let n = 0; n < 8; n += 1) {
      const note = chord[n % chord.length];
      const start = bar * 2 + n * step;
      renderNote(samples, start, 0.55, midi(note), 0.16, -0.4 + (n % 4) * 0.12, pianoVoice);
    }
  }
  melody.forEach((note, i) => {
    renderNote(samples, i * 1, 1.15, midi(note), 0.3, 0.28, pianoVoice);
  });
  for (let i = 0; i < TOTAL; i += 1) {
    samples[i * 2] = tanhLimit(samples[i * 2] * 1.25);
    samples[i * 2 + 1] = tanhLimit(samples[i * 2 + 1] * 1.25);
  }
  return fadeLoop(samples);
}

function upbeatHouse() {
  const samples = new Float64Array(TOTAL * 2);
  const bpm = 120;
  const beat = 60 / bpm;
  const bassNotes = [33, 33, 36, 31, 33, 33, 28, 31];
  const stab = [
    [57, 60, 64],
    [57, 60, 64],
    [60, 64, 67],
    [55, 59, 62],
  ];
  const lpHat = lowpassState();

  for (let i = 0; i < TOTAL; i += 1) {
    const t = i / SAMPLE_RATE;
    const beatPos = (t / beat) % 1;
    const bar = Math.floor(t / (beat * 4)) % 4;
    const eighth = Math.floor(t / (beat / 2));

    const kickT = beatPos * beat;
    const kick = Math.sin(2 * Math.PI * (90 - kickT * 280) * kickT) * expDecay(kickT, 16);
    const hatRaw = ((eighth % 2 === 1 ? 1 : 0.15) * expDecay((t / (beat / 2)) % 1, 22) * (0.35 + 0.2 * noise()));
    const hat = lowpass(lpHat, hatRaw, 0.55);
    const snareT = ((t / beat + 2) % 2) * beat;
    const snare = (Math.abs((t / beat) % 2 - 1) < 0.04 ? 1 : 0) * (0.22 * noise() + 0.08 * sine(180, t)) * expDecay(snareT, 14);

    const bassNote = bassNotes[Math.floor(t / (beat * 2)) % bassNotes.length];
    const bass = bassVoice((t / (beat * 2)) % 1, midi(bassNote), 1) * 0.7;

    let chord = 0;
    if (beatPos < 0.18 && Math.floor(t / beat) % 2 === 0) {
      stab[bar].forEach((note, idx) => {
        chord += 0.12 * squareSoft(midi(note), t) * env(beatPos * beat, 0.01, 0.05, 0.4, 0.08, 0.18) * (idx === 1 ? 1 : 0.8);
      });
    }

    const l = kick * 0.7 + bass * 0.45 + hat * 0.12 + snare * 0.22 + chord * 0.55;
    const r = kick * 0.7 + bass * 0.4 + hat * 0.16 + snare * 0.22 + chord * 0.6;
    samples[i * 2] = tanhLimit(l * 1.15);
    samples[i * 2 + 1] = tanhLimit(r * 1.15);
  }
  return fadeLoop(samples);
}

function silentDiscoPulse() {
  const samples = new Float64Array(TOTAL * 2);
  const bpm = 120;
  const beat = 60 / bpm;
  const arp = [69, 72, 76, 79, 76, 72, 69, 64];
  const lpL = lowpassState();
  const lpR = lowpassState();

  for (let i = 0; i < TOTAL; i += 1) {
    const t = i / SAMPLE_RATE;
    const sixteenth = beat / 4;
    const step = Math.floor(t / sixteenth);
    const note = arp[step % arp.length];
    const local = (t / sixteenth) % 1;
    const pulse = env(local * sixteenth, 0.005, 0.04, 0.25, 0.03, sixteenth) * triangle(midi(note), t);
    const sub = sine(midi(note - 24), t) * (0.22 + 0.08 * sine(2 / beat, t));
    const kickT = (t / beat) % 1;
    const kick = Math.sin(2 * Math.PI * (70 - kickT * 180) * kickT * beat) * expDecay(kickT * beat, 11) * 0.35;
    const hat = ((step % 2) * 0.08 + 0.03) * expDecay(local * sixteenth, 30) * noise();
    const sweep = 0.08 + 0.2 * (0.5 + 0.5 * Math.sin(2 * Math.PI * t / 8));
    const l = lowpass(lpL, pulse * 0.42 + sub * 0.3 + kick + hat, sweep);
    const r = lowpass(lpR, pulse * 0.38 + sub * 0.32 + kick + hat * 1.2, sweep + 0.02);
    samples[i * 2] = tanhLimit(l * 1.4);
    samples[i * 2 + 1] = tanhLimit(r * 1.4);
  }
  return fadeLoop(samples);
}

writeWav("cinematic-swell.wav", cinematicSwell());
writeWav("romantic-piano.wav", romanticPiano());
writeWav("first-dance-piano.wav", firstDancePiano());
writeWav("upbeat-house.wav", upbeatHouse());
writeWav("silent-disco-pulse.wav", silentDiscoPulse());
console.log(`music beds written to ${outDir}`);
