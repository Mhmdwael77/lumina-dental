/**
 * Subtle film-grain overlay — turns flat gradient panels into art-directed,
 * photographic-feeling surfaces. Pure inline SVG noise (no asset requests).
 */
const NOISE =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

export function Grain({
  className = "",
  opacity = 0.09,
}: {
  className?: string;
  opacity?: number;
}) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 mix-blend-overlay ${className}`}
      style={{
        backgroundImage: NOISE,
        backgroundSize: "140px 140px",
        opacity,
      }}
    />
  );
}
