"use client";

import { musicBedSrc } from "./beds";

export const MIX_GAIN = 0.36;

export interface MusicMixHandle {
  stream: MediaStream;
  mixedAudio: boolean;
  stop: () => void;
}

/**
 * Decode a looping bed and add it as an audio track on the given (usually
 * canvas) stream. Best-effort: if Web Audio / decode fails, returns the
 * original video-only stream.
 */
export async function mixMusicIntoStream(
  videoStream: MediaStream,
  musicLabel: string | null | undefined,
): Promise<MusicMixHandle> {
  const src = musicBedSrc(musicLabel);
  if (!src) {
    return { stream: videoStream, mixedAudio: false, stop: () => undefined };
  }

  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) {
    return { stream: videoStream, mixedAudio: false, stop: () => undefined };
  }

  let ctx: AudioContext | null = null;
  let source: AudioBufferSourceNode | null = null;

  const stop = () => {
    try {
      source?.stop();
    } catch {
      // already stopped
    }
    source = null;
    if (ctx) {
      void ctx.close().catch(() => undefined);
      ctx = null;
    }
  };

  try {
    ctx = new AudioCtx();
    if (ctx.state === "suspended") await ctx.resume();
    const res = await fetch(src);
    if (!res.ok) throw new Error("Music bed missing");
    const raw = await res.arrayBuffer();
    const buffer = await ctx.decodeAudioData(raw.slice(0));
    const dest = ctx.createMediaStreamDestination();
    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = MIX_GAIN;
    source.connect(gain);
    gain.connect(dest);
    source.start(0);

    const audioTracks = dest.stream.getAudioTracks();
    if (!audioTracks.length) {
      stop();
      return { stream: videoStream, mixedAudio: false, stop: () => undefined };
    }

    const mixed = new MediaStream([...videoStream.getVideoTracks(), ...audioTracks]);
    return { stream: mixed, mixedAudio: true, stop };
  } catch {
    stop();
    return { stream: videoStream, mixedAudio: false, stop: () => undefined };
  }
}
