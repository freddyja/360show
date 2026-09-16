"use client";

import { useEffect } from "react";
import { musicBedSrc } from "./beds";

export const BOOTH_MUSIC_VOLUME = 0.28;

let bed: HTMLAudioElement | null = null;
let currentSrc = "";
let wantsPlay = false;
let listenersBound = false;

function bindGestureUnlock() {
  if (listenersBound || typeof window === "undefined") return;
  listenersBound = true;
  const resume = () => {
    if (!wantsPlay || !bed) return;
    void bed.play().catch(() => undefined);
  };
  for (const event of ["pointerdown", "keydown", "touchstart"] as const) {
    window.addEventListener(event, resume, { passive: true });
  }
}

function ensure(src: string) {
  bindGestureUnlock();
  if (bed && currentSrc === src) return bed;
  if (bed) {
    bed.pause();
    bed.removeAttribute("src");
    bed.load();
  }
  const audio = new Audio(src);
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = BOOTH_MUSIC_VOLUME;
  bed = audio;
  currentSrc = src;
  return audio;
}

export function syncBoothMusic(options: {
  src: string | null;
  playing: boolean;
  muted?: boolean;
}) {
  const shouldPlay = Boolean(options.src && options.playing && !options.muted);
  wantsPlay = shouldPlay;
  if (!options.src || !shouldPlay) {
    wantsPlay = false;
    bed?.pause();
    return;
  }
  const audio = ensure(options.src);
  audio.volume = BOOTH_MUSIC_VOLUME;
  void audio.play().catch(() => undefined);
}

/** Call from a click handler (START SPIN, Preview, etc.) so autoplay is allowed. */
export function nudgeBoothMusic() {
  bindGestureUnlock();
  if (!wantsPlay || !bed) return;
  void bed.play().catch(() => undefined);
}

export function useBoothMusic(options: {
  label?: string | null;
  active: boolean;
  muted?: boolean;
}) {
  const src = musicBedSrc(options.label);
  const playing = options.active;
  const muted = Boolean(options.muted);

  useEffect(() => {
    syncBoothMusic({ src, playing, muted });
    return () => {
      syncBoothMusic({ src: null, playing: false });
    };
  }, [src, playing, muted]);
}
