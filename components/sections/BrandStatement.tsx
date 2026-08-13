"use client";

import { useRef } from "react";
import gsap, { ScrollTrigger } from "@/lib/gsap";
import { prefersReducedMotion, useIsoLayoutEffect } from "@/lib/use-iso-layout-effect";

const LINES = ["Dentistry,", "designed", "around you."];

export function BrandStatement() {
  const sectionRef = useRef<HTMLElement>(null);

  useIsoLayoutEffect(() => {
    if (prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.from(".bs-line", {
        yPercent: 115,
        opacity: 0,
        duration: 1,
        ease: "power3.out",
        stagger: 0.12,
        scrollTrigger: { trigger: sectionRef.current, start: "top 70%" },
      });
      gsap.from(".bs-fade", {
        opacity: 0,
        y: 24,
        duration: 1,
        ease: "power3.out",
        delay: 0.35,
        scrollTrigger: { trigger: sectionRef.current, start: "top 70%" },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="brand-statement"
      className="relative w-full bg-cream px-6 py-28 md:px-10 md:py-40 lg:px-14 lg:py-48"
    >
      <div className="mx-auto max-w-[110rem]">
        {/* Eyebrow */}
        <p className="bs-fade mb-10 flex items-center gap-3 text-[0.7rem] font-medium uppercase tracking-[0.32em] text-ink/50 md:mb-14">
          <span className="h-px w-8 bg-gold" aria-hidden="true" />
          Our Philosophy
        </p>

        <div className="grid gap-12 lg:grid-cols-[1.4fr_0.6fr] lg:items-end lg:gap-16">
          {/* Editorial statement */}
          <h2 className="max-w-4xl text-[3rem] font-medium leading-[1.02] tracking-[-0.02em] text-ink sm:text-6xl lg:text-7xl xl:text-[5.5rem]">
            {LINES.map((line, i) => (
              <span key={i} className="block overflow-hidden pb-[0.08em]">
                <span className="bs-line block">
                  {i === 1 ? <em className="italic text-ink/90">{line}</em> : line}
                </span>
              </span>
            ))}
          </h2>

          {/* Supporting text */}
          <p className="bs-fade max-w-md text-base leading-relaxed text-ink/60 sm:text-lg lg:pb-4">
            Modern dental care combining clinical expertise, thoughtful
            technology, and a comfortable patient experience.
          </p>
        </div>
      </div>
    </section>
  );
}
