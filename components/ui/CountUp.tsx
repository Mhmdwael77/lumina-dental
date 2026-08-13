"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { prefersReducedMotion, useIsoLayoutEffect } from "@/lib/use-iso-layout-effect";

gsap.registerPlugin(ScrollTrigger);

type CountUpProps = {
  value: number;
  suffix?: string;
  decimals?: number;
  className?: string;
};

/**
 * Counts up to `value` (with an optional suffix like "+", "K+", "/5") when it
 * scrolls into view. Animates textContent via GSAP — no per-frame React state.
 * SSR renders the final value so it is correct without / before JS.
 */
export function CountUp({ value, suffix = "", decimals = 0, className }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const format = (v: number) => `${v.toFixed(decimals)}${suffix}`;

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.textContent = format(value);
      return;
    }

    const counter = { v: 0 };
    el.textContent = format(0);
    const ctx = gsap.context(() => {
      gsap.to(counter, {
        v: value,
        duration: 1.6,
        ease: "power2.out",
        scrollTrigger: { trigger: el, start: "top 85%", once: true },
        onUpdate: () => {
          el.textContent = format(counter.v);
        },
      });
    });
    return () => ctx.revert();
  }, [value, suffix, decimals]);

  return (
    <span ref={ref} className={className}>
      {format(value)}
    </span>
  );
}
