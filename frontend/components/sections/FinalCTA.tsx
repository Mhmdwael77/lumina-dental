"use client";

import { useRef } from "react";
import Link from "next/link";
import gsap, { ScrollTrigger } from "@/lib/gsap";
import { ArrowUpRight } from "lucide-react";
import { prefersReducedMotion, useIsoLayoutEffect } from "@/lib/use-iso-layout-effect";

export function FinalCTA() {
  const sectionRef = useRef<HTMLElement>(null);

  useIsoLayoutEffect(() => {
    if (prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.from(".fc-reveal", {
        opacity: 0,
        y: 34,
        duration: 1,
        ease: "power3.out",
        stagger: 0.12,
        scrollTrigger: { trigger: sectionRef.current, start: "top 72%" },
      });
      gsap.to(".fc-glow", {
        scale: 1.15,
        opacity: 0.85,
        ease: "none",
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="final-cta"
      className="relative w-full overflow-hidden bg-ink px-6 py-40 text-cream md:px-10 md:py-52 lg:px-14"
    >
      {/* ambient glow */}
      <div
        className="fc-glow pointer-events-none absolute left-1/2 top-1/2 h-[42rem] w-[42rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-60"
        style={{
          background:
            "radial-gradient(circle, rgba(185,154,107,0.28) 0%, rgba(185,154,107,0.06) 42%, transparent 70%)",
        }}
        aria-hidden="true"
      />

      <div className="relative mx-auto flex max-w-4xl flex-col items-center text-center">
        <p className="fc-reveal mb-8 flex items-center gap-3 text-[0.7rem] font-medium uppercase tracking-[0.32em] text-gold">
          <span className="h-px w-8 bg-gold/60" aria-hidden="true" />
          Ready when you are
          <span className="h-px w-8 bg-gold/60" aria-hidden="true" />
        </p>

        <h2 className="fc-reveal font-serif text-[3rem] font-medium leading-[0.98] tracking-[-0.02em] text-cream sm:text-7xl lg:text-8xl">
          Your smile
          <br />
          <em className="italic text-cream/90">starts here.</em>
        </h2>

        <Link
          href="/booking"
          className="group mt-12 inline-flex items-center gap-2.5 rounded-full bg-cream px-9 py-5 text-xs font-medium uppercase tracking-[0.2em] text-ink transition-all duration-300 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
        >
          Book an Appointment
          <ArrowUpRight
            className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </Link>
      </div>
    </section>
  );
}
