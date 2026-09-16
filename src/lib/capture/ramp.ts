/**
 * Time-ramp playback profile.
 *
 * REAL: the RampPlayer applies these playbackRate keyframes live in the
 * browser (normal → slow-mo → freeze). That is what guests see on the
 * tablet preview and share screen.
 *
 * SIMULATED / NOT IN MVP: baking the ramp into a re-encoded MP4. Downloaded
 * files are the original capture (camera or demo) without the ramp baked in.
 */

export interface RampKeyframe {
  /** 0–1 progress through the source clip. */
  at: number;
  rate: number;
}

export const TIME_RAMP_V1: RampKeyframe[] = [
  { at: 0, rate: 1 },
  { at: 0.22, rate: 1 },
  { at: 0.38, rate: 0.42 },
  { at: 0.58, rate: 0.22 },
  { at: 0.78, rate: 0.14 },
  { at: 0.9, rate: 0.08 },
  { at: 0.96, rate: 0 },
];

export function playbackRateAt(progress: number, profile = TIME_RAMP_V1) {
  if (progress <= 0) return profile[0].rate;
  if (progress >= 1) return profile[profile.length - 1].rate;

  for (let i = 0; i < profile.length - 1; i += 1) {
    const a = profile[i];
    const b = profile[i + 1];
    if (progress >= a.at && progress <= b.at) {
      const t = (progress - a.at) / (b.at - a.at || 1);
      return a.rate + (b.rate - a.rate) * t;
    }
  }
  return profile[profile.length - 1].rate;
}
