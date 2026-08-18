"use client";

import { useRef, useState } from "react";
import gsap, { ScrollTrigger } from "@/lib/gsap";
import { ArrowLeft, ArrowRight, Star } from "lucide-react";
import { REVIEW_SUMMARY, TESTIMONIALS } from "@/lib/constants";
import { prefersReducedMotion, useIsoLayoutEffect } from "@/lib/use-iso-layout-effect";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export function Testimonials() {
  const { t } = useLanguage();
  const localizedTestimonials = TESTIMONIALS.map((ts, i) => ({
    ...ts,
    quote: t(`site.testimonials.t${i + 1}Quote`),
    detail: t(`site.testimonials.t${i + 1}Detail`),
  }));
  const sectionRef = useRef<HTMLElement>(null);
  const startX = useRef<number | null>(null);
  const [index, setIndex] = useState(0);
  const total = localizedTestimonials.length;
  const active = localizedTestimonials[index];

  const go = (dir: number) => setIndex((i) => (i + dir + total) % total);

  useIsoLayoutEffect(() => {
    if (prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.from(".ts-head", {
        opacity: 0,
        y: 26,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.1,
        scrollTrigger: { trigger: sectionRef.current, start: "top 75%" },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      go(1);
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (startX.current === null) return;
    const dx = e.clientX - startX.current;
    startX.current = null;
    if (Math.abs(dx) > 45) go(dx < 0 ? 1 : -1);
  };

  return (
    <section
      ref={sectionRef}
      id="testimonials"
      className="relative w-full overflow-hidden bg-ink px-6 py-28 text-cream md:px-10 md:py-36 lg:px-14"
    >
      <div className="mx-auto max-w-[90rem]">
        {/* Header */}
        <div className="mb-14 flex flex-col gap-10 md:mb-20 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="ts-head mb-8 flex items-center gap-3 text-[0.7rem] font-medium uppercase tracking-[0.32em] text-cream/45">
              <span className="h-px w-8 bg-gold" aria-hidden="true" />
              {t("site.testimonials.eyebrow")}
            </p>
            <h2 className="ts-head max-w-2xl font-serif text-[2.5rem] font-medium leading-[1.02] tracking-[-0.02em] text-cream sm:text-5xl lg:text-6xl">
              {t("site.testimonials.headingPrefix")} <em className="italic text-cream/85">{t("site.testimonials.headingSuffix")}</em>
            </h2>
          </div>

          {/* Rating */}
          <div className="ts-head flex items-center gap-5">
            <div className="flex items-baseline font-serif text-5xl font-medium leading-none text-cream">
              {REVIEW_SUMMARY.rating}
              <span className="text-xl text-cream/40">/{REVIEW_SUMMARY.outOf}</span>
            </div>
            <div className="h-10 w-px bg-cream/15" aria-hidden="true" />
            <div>
              <div className="flex gap-0.5 text-gold" aria-label={t("site.testimonials.ratingAria")}>
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className="h-4 w-4 fill-current" strokeWidth={0} aria-hidden="true" />
                ))}
              </div>
              <p className="mt-1.5 text-xs uppercase tracking-[0.18em] text-cream/50">
                {REVIEW_SUMMARY.count} {t("site.testimonials.patientReviews")}
              </p>
            </div>
          </div>
        </div>

        {/* Carousel */}
        <div
          role="group"
          aria-roledescription="carousel"
          aria-label="Patient testimonials"
          tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          className="ts-head relative touch-pan-y select-none rounded-2xl outline-none focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-gold"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -left-2 -top-10 font-serif text-[9rem] leading-none text-gold/20 sm:text-[12rem]"
          >
            &ldquo;
          </span>

          <blockquote key={index} className="relative animate-[testi-in_0.55s_cubic-bezier(0.22,1,0.36,1)]">
            <p className="max-w-4xl font-serif text-2xl font-medium leading-[1.35] tracking-tight text-cream sm:text-4xl lg:text-[2.75rem]">
              {active.quote}
            </p>
            <footer className="mt-8 flex items-center gap-4">
              <span className="text-base font-medium tracking-wide text-cream">
                — {active.name}
              </span>
              <span className="h-4 w-px bg-cream/20" aria-hidden="true" />
              <span className="text-sm uppercase tracking-[0.18em] text-gold">
                {active.detail}
              </span>
            </footer>
          </blockquote>

          {/* Controls */}
          <div className="mt-12 flex items-center gap-6">
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label={t("site.testimonials.prev")}
                className="grid h-12 w-12 place-items-center rounded-full border border-cream/20 text-cream transition-colors duration-300 hover:border-cream/60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
              >
                <ArrowLeft className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label={t("site.testimonials.next")}
                className="grid h-12 w-12 place-items-center rounded-full border border-cream/20 text-cream transition-colors duration-300 hover:border-cream/60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
              >
                <ArrowRight className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>

            <p className="font-serif text-sm text-cream/50 tabular-nums">
              <span className="text-gold">{String(index + 1).padStart(2, "0")}</span>
              <span className="mx-2 text-cream/25">/</span>
              {String(total).padStart(2, "0")}
            </p>
          </div>
        </div>

        <p className="mt-12 text-[0.68rem] uppercase tracking-[0.18em] text-cream/30">
          {t("site.testimonials.disclaimer")}
        </p>
      </div>
    </section>
  );
}
