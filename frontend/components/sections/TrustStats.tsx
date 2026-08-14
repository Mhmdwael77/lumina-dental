"use client";

import { useRef } from "react";
import gsap, { ScrollTrigger } from "@/lib/gsap";
import { CountUp } from "@/components/ui/CountUp";
import { STATS } from "@/lib/constants";
import { prefersReducedMotion, useIsoLayoutEffect } from "@/lib/use-iso-layout-effect";

export function TrustStats() {
  const sectionRef = useRef<HTMLElement>(null);

  useIsoLayoutEffect(() => {
    if (prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.from(".stat-item", {
        opacity: 0,
        y: 30,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.12,
        scrollTrigger: { trigger: sectionRef.current, start: "top 75%" },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="trust-statistics"
      className="relative w-full bg-ink px-6 py-24 text-cream md:px-10 md:py-32 lg:px-14"
    >
      <div className="mx-auto max-w-[110rem]">
        <p className="mb-16 flex items-center justify-center gap-3 text-center text-[0.7rem] font-medium uppercase tracking-[0.32em] text-cream/45 md:mb-20">
          <span className="h-px w-8 bg-gold" aria-hidden="true" />
          A track record you can trust
          <span className="h-px w-8 bg-gold" aria-hidden="true" />
        </p>

        <dl className="grid grid-cols-2 gap-y-14 lg:grid-cols-4">
          {STATS.map((stat, i) => (
            <div
              key={stat.label}
              className={`stat-item flex flex-col items-center px-4 text-center ${
                i > 0 ? "lg:border-l lg:border-cream/10" : ""
              }`}
            >
              <dd className="flex items-baseline font-serif text-5xl font-medium leading-none tracking-tight text-cream md:text-6xl lg:text-7xl">
                <CountUp value={stat.value} decimals={stat.decimals} />
                <span className="text-gold">{stat.suffix}</span>
              </dd>
              <dt className="mt-5 text-[0.68rem] font-medium uppercase tracking-[0.22em] text-cream/50">
                {stat.label}
              </dt>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
