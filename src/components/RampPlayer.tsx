"use client";

import { useEffect, useRef } from "react";
import { playbackRateAt, rampKeyframes } from "@/lib/capture/ramp";
import { DEMO_ASSET_PATH, type RampProfileId } from "@/lib/types";

export function RampPlayer({
  src,
  poster,
  className,
  rampProfile = "time-ramp-v1",
  onPlayingChange,
}: {
  src: string | null;
  poster?: string | null;
  className?: string;
  rampProfile?: RampProfileId;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const keyframes = rampKeyframes(rampProfile);

    let raf = 0;
    let freezeUntil = 0;
    const tick = () => {
      const duration = video.duration || 1;
      const progress = video.currentTime / duration;
      const rate = playbackRateAt(progress, keyframes);
      if (rate <= 0.02) {
        if (!video.paused) {
          video.pause();
          freezeUntil = performance.now() + 1200;
          onPlayingChange?.(false);
        } else if (freezeUntil && performance.now() > freezeUntil) {
          video.currentTime = 0;
          video.playbackRate = 1;
          void video.play().catch(() => undefined);
        }
      } else if (!video.paused) {
        video.playbackRate = Math.max(rate, 0.08);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [src, rampProfile, onPlayingChange]);

  return (
    <video
      ref={videoRef}
      className={className}
      src={src ?? DEMO_ASSET_PATH}
      poster={poster ?? "/demo/poster.png"}
      autoPlay
      muted
      playsInline
      onPlay={() => onPlayingChange?.(true)}
      onPause={() => onPlayingChange?.(false)}
    />
  );
}
