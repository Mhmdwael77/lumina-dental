import type Lenis from "lenis";

/** Access the active Lenis instance (exposed by SmoothScroll), if any. */
export function getLenis(): Lenis | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { __lenis?: Lenis }).__lenis;
}
