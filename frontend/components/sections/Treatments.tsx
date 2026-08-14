"use client";

import { useRef, useState } from "react";
import gsap, { ScrollTrigger } from "@/lib/gsap";
import { ArrowUpRight, Plus } from "lucide-react";
import { TREATMENTS } from "@/lib/constants";
import { prefersReducedMotion, useIsoLayoutEffect } from "@/lib/use-iso-layout-effect";

// High resolution photography preview images for each treatment.
const TREATMENT_PREVIEWS = [
  "/images/featured_makeover.png", // 01 Cosmetic Dentistry
  "/images/equipment.png",         // 02 Dental Implants
  "/images/whitening_after.png",    // 03 Teeth Whitening
  "/images/makeover_after.png",     // 04 Orthodontics
  "/images/treatment.png",          // 05 General Dentistry
  "/images/interior.png",           // 06 Pediatric Dentistry
];

const PREVIEW_W = 300;
const PREVIEW_H = 208;

export function Treatments() {
  const sectionRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const quickX = useRef<((v: number) => void) | null>(null);
  const quickY = useRef<((v: number) => void) | null>(null);
  const enabled = useRef(false);

  const [active, setActive] = useState<number | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  useIsoLayoutEffect(() => {
    const reduce = prefersReducedMotion();
    const ctx = gsap.context(() => {
      if (!reduce) {
        gsap.from(".tr-head", {
          opacity: 0,
          y: 28,
          duration: 0.9,
          ease: "power3.out",
          stagger: 0.12,
          scrollTrigger: { trigger: sectionRef.current, start: "top 72%" },
        });
        gsap.from(".tr-row", {
          opacity: 0,
          y: 26,
          duration: 0.7,
          ease: "power3.out",
          stagger: 0.08,
          scrollTrigger: { trigger: listRef.current, start: "top 80%" },
        });
      }

      // Cursor-following preview — desktop pointers only, and not reduced-motion.
      const hoverable = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
      enabled.current = hoverable && !reduce;
      if (enabled.current && previewRef.current) {
        gsap.set(previewRef.current, { autoAlpha: 0, scale: 0.9 });
        quickX.current = gsap.quickTo(previewRef.current, "x", { duration: 0.5, ease: "power3" });
        quickY.current = gsap.quickTo(previewRef.current, "y", { duration: 0.5, ease: "power3" });
      }
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  const handleMove = (e: React.MouseEvent) => {
    if (!enabled.current || !listRef.current) return;
    const rect = listRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + 24;
    const y = e.clientY - rect.top - PREVIEW_H / 2;
    const cx = Math.min(Math.max(x, 0), rect.width - PREVIEW_W);
    const cy = Math.min(Math.max(y, 0), rect.height - PREVIEW_H);
    quickX.current?.(cx);
    quickY.current?.(cy);
  };

  const handleRowEnter = (i: number) => {
    setActive(i);
    if (enabled.current && previewRef.current) {
      gsap.to(previewRef.current, {
        autoAlpha: 1,
        scale: 1,
        duration: 0.35,
        ease: "power3.out",
      });
    }
  };

  const handleListLeave = () => {
    if (enabled.current && previewRef.current) {
      gsap.to(previewRef.current, {
        autoAlpha: 0,
        scale: 0.9,
        duration: 0.3,
        ease: "power2.out",
      });
    }
  };

  return (
    <section
      ref={sectionRef}
      id="treatments"
      className="relative w-full bg-cream px-6 py-28 md:px-10 md:py-36 lg:px-14"
    >
      <div className="mx-auto max-w-[110rem]">
        {/* Header */}
        <div className="mb-16 max-w-3xl md:mb-20">
          <p className="tr-head mb-8 flex items-center gap-3 text-[0.7rem] font-medium uppercase tracking-[0.32em] text-ink/50">
            <span className="h-px w-8 bg-gold" aria-hidden="true" />
            Treatments
          </p>
          <h2 className="tr-head text-[2.5rem] font-medium leading-[1.02] tracking-[-0.02em] text-ink sm:text-5xl lg:text-6xl">
            Exceptional care
            <br />
            for every <em className="italic text-ink/90">smile.</em>
          </h2>
          <p className="tr-head mt-6 max-w-lg text-base leading-relaxed text-ink/60 sm:text-lg">
            From everyday dental care to complete smile transformations.
          </p>
        </div>

        {/* Interactive list */}
        <div
          ref={listRef}
          className="relative"
          onMouseMove={handleMove}
          onMouseLeave={handleListLeave}
        >
          {/* Floating preview (desktop) */}
          <div
            ref={previewRef}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 z-20 hidden overflow-hidden rounded-xl shadow-[0_30px_60px_-20px_rgba(16,24,32,0.45)] lg:block"
            style={{ width: PREVIEW_W, height: PREVIEW_H }}
          >
            {active !== null && (
              <div className="relative h-full w-full">
                <img
                  src={TREATMENT_PREVIEWS[active]}
                  alt={TREATMENTS[active].title}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/20 to-transparent" />
                <span className="absolute left-5 top-3 font-serif text-6xl leading-none text-white/30">
                  {TREATMENTS[active].number}
                </span>
                <span className="absolute bottom-4 left-5 text-xs font-medium uppercase tracking-[0.22em] text-white">
                  {TREATMENTS[active].title}
                </span>
              </div>
            )}
          </div>

          {/* Rows */}
          {TREATMENTS.map((t, i) => (
            <div
              key={t.number}
              className="tr-row group border-t border-ink/12 last:border-b"
            >
              <button
                type="button"
                onMouseEnter={() => handleRowEnter(i)}
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
                className="relative flex w-full items-center gap-4 py-7 text-left transition-colors duration-500 md:gap-8 md:py-9 lg:group-hover:bg-beige/40"
              >
                <span className="w-8 shrink-0 text-xs font-medium tabular-nums tracking-widest text-ink/40 transition-colors duration-300 group-hover:text-gold md:w-12">
                  {t.number}
                </span>

                <span className="flex-1 font-serif text-[1.6rem] font-medium leading-tight tracking-tight text-ink transition-transform duration-500 group-hover:translate-x-1 md:text-4xl lg:group-hover:translate-x-3">
                  {t.title}
                </span>

                {/* Desktop inline description */}
                <span className="hidden max-w-[15rem] text-sm leading-snug text-ink/50 lg:block xl:max-w-xs">
                  {t.description}
                </span>

                {/* Desktop arrow */}
                <ArrowUpRight
                  className="hidden h-6 w-6 shrink-0 text-ink/30 transition-all duration-500 group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-gold lg:block"
                  strokeWidth={1.25}
                  aria-hidden="true"
                />

                {/* Mobile toggle */}
                <Plus
                  className={`h-5 w-5 shrink-0 text-ink/50 transition-transform duration-500 lg:hidden ${
                    open === i ? "rotate-45" : ""
                  }`}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </button>

              {/* Mobile accordion panel */}
              <div
                className={`grid transition-[grid-template-rows] duration-500 ease-out lg:hidden ${
                  open === i ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
              >
                <div className="overflow-hidden">
                  <div className="pb-8 pl-12 pr-2">
                    <p className="max-w-md text-sm leading-relaxed text-ink/60">
                      {t.description}
                    </p>
                    <div className="relative mt-5 h-36 w-full overflow-hidden rounded-lg">
                      <img
                        src={TREATMENT_PREVIEWS[i]}
                        alt={t.title}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
