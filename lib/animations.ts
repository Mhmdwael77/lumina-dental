/**
 * Shared animation configuration for the Hero cinematic scroll.
 * Keeping the choreography here (not inline) makes the timing easy to tune.
 */

export type Keyframes = readonly (readonly [number, number])[];

/** Piecewise smoothstep interpolation of `p` (0..1) through [progress, value] points. */
export function kf(p: number, pts: Keyframes): number {
  const n = pts.length;
  if (n === 0) return 0;
  if (p <= pts[0][0]) return pts[0][1];
  if (p >= pts[n - 1][0]) return pts[n - 1][1];
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    if (p >= x0 && p <= x1) {
      const t = (p - x0) / (x1 - x0);
      const s = t * t * (3 - 2 * t); // smoothstep
      return y0 + (y1 - y0) * s;
    }
  }
  return pts[n - 1][1];
}

/** How far (in extra viewport height) the Hero stays pinned while the story plays. */
export const HERO_PIN_END = "+=150%";

/** Cubic-bezier easing shared with framer-motion entrances (navbar). */
export const EASE_SOFT = [0.22, 1, 0.36, 1] as const;

/**
 * Tooth scroll choreography — progress (0..1) mapped to each transform channel.
 * No 360° spins; every move is small and physically believable.
 *
 *   0.00–0.10  floating
 *   0.10–0.20  rotates slightly
 *   0.20–0.35  scales up
 *   0.35–0.50  drifts right
 *   0.50–0.65  rises up / right
 *   0.65–1.00  continues up-right, then fades (opacity handled in the Hero)
 */
export const TOOTH_ROT_Y: Keyframes = [
  [0, 0],
  [0.1, 0],
  [0.2, 0.3],
  [1, 0.34],
];
export const TOOTH_ROT_X: Keyframes = [
  [0, 0],
  [0.1, 0],
  [0.2, 0.09],
  [0.65, 0.09],
  [1, -0.04],
];
export const TOOTH_SCALE: Keyframes = [
  [0, 1],
  [0.2, 1],
  [0.35, 1.07],
  [0.8, 1.09],
  [1, 1.0],
];
export const TOOTH_POS_X: Keyframes = [
  [0, 0],
  [0.35, 0],
  [0.5, 0.28],
  [0.65, 0.42],
  [1, 0.5],
];
export const TOOTH_POS_Y: Keyframes = [
  [0, 0],
  [0.5, 0],
  [0.65, 0.24],
  [0.8, 0.44],
  [1, 0.6],
];
