"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import gsap, { ScrollTrigger } from "@/lib/gsap";
import { ArrowDown, ArrowUpRight, Star } from "lucide-react";
import { HERO_PIN_END } from "@/lib/animations";

// The 3D scene is browser-only (WebGL) — load it client-side.
const ToothScene = dynamic(
  () => import("@/components/3d/ToothScene").then((m) => m.ToothScene),
  { ssr: false, loading: () => null },
);

const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function Hero() {
  const sectionRef = useRef<HTMLElement>(null);
  const eyebrowRef = useRef<HTMLParagraphElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const descRef = useRef<HTMLParagraphElement>(null);
  const buttonsRef = useRef<HTMLDivElement>(null);
  const visualRef = useRef<HTMLDivElement>(null);
  const trustRef = useRef<HTMLElement>(null);
  const cueRef = useRef<HTMLAnchorElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);

  // Shared scroll progress (0..1) consumed by the 3D scene without React state.
  const scrollProgress = useRef(0);

  useIsoLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const copy = [
      eyebrowRef.current,
      headingRef.current,
      descRef.current,
      buttonsRef.current,
    ];

    const ctx = gsap.context(() => {
      if (reduce) return; // static, fully-visible Hero under reduced motion

      // Entrance on load — subtle fade + rise.
      gsap.from(copy, {
        autoAlpha: 0,
        y: 26,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.09,
        delay: 0.15,
      });
      gsap.from(trustRef.current, {
        autoAlpha: 0,
        y: 18,
        duration: 0.9,
        ease: "power3.out",
        delay: 0.9,
      });
      gsap.from(cueRef.current, {
        autoAlpha: 0,
        duration: 1,
        ease: "power2.out",
        delay: 1.1,
      });

      // Idle bob on the scroll-cue arrow.
      gsap.to(arrowRef.current, {
        y: 6,
        repeat: -1,
        yoyo: true,
        duration: 1.4,
        ease: "sine.inOut",
      });

      // Pinned cinematic timeline — scrubbed by scroll through the Hero.
      gsap
        .timeline({
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top top",
            end: HERO_PIN_END,
            scrub: 1,
            pin: true,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              scrollProgress.current = self.progress;
            },
          },
        })
        .to(cueRef.current, { autoAlpha: 0, y: 10, duration: 0.1 }, 0)
        .to(
          copy,
          {
            autoAlpha: 0,
            y: -44,
            stagger: 0.04,
            duration: 0.22,
            ease: "power2.in",
          },
          0.58,
        )
        .to(trustRef.current, { autoAlpha: 0, y: 24, duration: 0.16 }, 0.6)
        .to(visualRef.current, { autoAlpha: 0, duration: 0.24 }, 0.76);
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="hero"
      className="relative min-h-[100svh] w-full overflow-hidden bg-cream"
    >
      <div className="mx-auto grid min-h-[100svh] max-w-[110rem] grid-cols-1 items-center gap-4 px-6 pb-10 pt-24 md:px-10 sm:gap-6 sm:pb-16 sm:pt-28 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:px-14 lg:pb-0 lg:pt-0">
        {/* LEFT — editorial copy (top on mobile, left on desktop) */}
        <div className="relative z-10 order-1 max-w-xl lg:order-1">
          {/* Eyebrow */}
          <p
            ref={eyebrowRef}
            className="mb-5 text-[0.7rem] font-medium uppercase tracking-[0.32em] text-ink/55 sm:mb-7"
          >
            Modern Dentistry <span className="text-gold">•</span> Personalized
            Care
          </p>

          {/* Heading */}
          <h1
            ref={headingRef}
            className="text-[2.85rem] leading-[0.98] tracking-[-0.02em] text-ink sm:text-6xl lg:text-7xl xl:text-[5.25rem]"
          >
            A healthier
            <br />
            <span className="italic text-ink/90">smile</span>
            <br />
            starts here.
          </h1>

          {/* Supporting text */}
          <p
            ref={descRef}
            className="mt-6 max-w-md text-base leading-relaxed text-ink/65 sm:mt-8 sm:text-lg"
          >
            Exceptional dental care in a calm, modern environment — designed
            around your comfort and confidence.
          </p>

          {/* Buttons */}
          <div
            ref={buttonsRef}
            className="mt-7 flex flex-col gap-3 sm:mt-10 sm:flex-row sm:items-center sm:gap-4"
          >
            <Link
              href="/booking"
              className="group inline-flex items-center justify-center gap-2 rounded-full bg-ink px-8 py-4 text-xs font-medium uppercase tracking-[0.2em] text-cream transition-all duration-300 hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
            >
              Book an Appointment
              <ArrowUpRight
                className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </Link>
            <a
              href="#treatments"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-ink/15 px-8 py-4 text-xs font-medium uppercase tracking-[0.2em] text-ink transition-colors duration-300 hover:border-ink/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
            >
              Explore Treatments
            </a>
          </div>
        </div>

        {/* RIGHT — 3D tooth (bottom on mobile, right on desktop) */}
        <div
          ref={visualRef}
          className="relative order-2 h-[44svh] w-full min-h-[300px] sm:h-[50svh] lg:order-2 lg:h-[92svh]"
        >
          <ToothScene scrollProgress={scrollProgress} />

          {/* Trust indicator — subtle floating chip near the tooth */}
          <figure
            ref={trustRef}
            className="pointer-events-none absolute bottom-4 left-2 flex items-center gap-4 rounded-2xl border border-ink/5 bg-white/70 px-5 py-4 shadow-[0_10px_40px_-15px_rgba(16,24,32,0.25)] backdrop-blur-sm sm:bottom-8 sm:left-4 lg:bottom-10"
          >
            <div className="text-2xl font-medium leading-none text-ink">
              4.9<span className="text-base text-ink/40"> / 5</span>
            </div>
            <div className="h-8 w-px bg-ink/10" aria-hidden="true" />
            <figcaption>
              <div
                className="flex gap-0.5 text-gold"
                aria-label="Rated 4.9 out of 5"
              >
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className="h-3.5 w-3.5 fill-current"
                    strokeWidth={0}
                    aria-hidden="true"
                  />
                ))}
              </div>
              <p className="mt-1.5 text-[0.72rem] tracking-wide text-ink/55">
                Trusted by 2,000+ patients
              </p>
            </figcaption>
          </figure>
        </div>
      </div>

      {/* Scroll cue */}
      <a
        ref={cueRef}
        href="#brand-statement"
        className="absolute bottom-8 left-1/2 z-10 hidden -translate-x-1/2 items-center gap-3 lg:flex"
        aria-label="Scroll to explore"
      >
        <span className="text-[0.65rem] font-light uppercase tracking-[0.35em] text-ink/50">
          Scroll to Explore
        </span>
        <span ref={arrowRef} className="text-ink/50">
          <ArrowDown className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
        </span>
      </a>
    </section>
  );
}
