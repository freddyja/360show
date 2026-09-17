"use client";

import { useEffect, useRef } from "react";
import { playbackRateAt, rampKeyframes } from "@/lib/capture/ramp";
import { isDrivePlaybackUrl } from "@/lib/drive/urls";
import { DEMO_ASSET_PATH, type RampProfileId } from "@/lib/types";

export function RampPlayer({
  src,
  poster,
  className,
  rampProfile = "time-ramp-v1",
  liveRamp = true,
  allowSound = false,
  onPlayingChange,
}: {
  src: string | null;
  poster?: string | null;
  className?: string;
  rampProfile?: RampProfileId;
  /** When false, play the file as-is (already ramp-baked). */
  liveRamp?: boolean;
  /** Unmute the baked file after a user gesture (guest downloads with mixed audio). */
  allowSound?: boolean;
  onPlayingChange?: (playing: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const driveSrc = isDrivePlaybackUrl(src);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || driveSrc) return;
    if (!allowSound) {
      video.muted = true;
      return;
    }
    video.muted = true;
    const unmute = () => {
      video.muted = false;
      void video.play().catch(() => undefined);
    };
    window.addEventListener("pointerdown", unmute, { passive: true });
    window.addEventListener("keydown", unmute);
    return () => {
      window.removeEventListener("pointerdown", unmute);
      window.removeEventListener("keydown", unmute);
    };
  }, [src, allowSound, driveSrc]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !liveRamp || driveSrc) return;
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
  }, [src, rampProfile, liveRamp, driveSrc, onPlayingChange]);

  if (driveSrc && src) {
    return (
      <iframe
        src={src}
        className={className}
        style={{ border: 0 }}
        title="360 spin"
        allow="autoplay; fullscreen"
        allowFullScreen
      />
    );
  }

  return (
    <video
      ref={videoRef}
      className={className}
      src={src ?? DEMO_ASSET_PATH}
      poster={poster ?? "/demo/poster.png"}
      autoPlay
      muted
      playsInline
      loop={!liveRamp}
      onPlay={() => onPlayingChange?.(true)}
      onPause={() => onPlayingChange?.(false)}
    />
  );
}
