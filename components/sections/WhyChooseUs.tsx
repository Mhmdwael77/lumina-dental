"use client";

import { useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { PRINCIPLES } from "@/lib/constants";
import { prefersReducedMotion, useIsoLayoutEffect } from "@/lib/use-iso-layout-effect";

gsap.registerPlugin(ScrollTrigger);

export function WhyChooseUs() {
  const sectionRef = useRef<HTMLElement>(null);
  // -1 = all active (reduced motion); otherwise the single active index.
  const [active, setActive] = useState(0);
  const reduced = useRef(false);

  useIsoLayoutEffect(() => {
    reduced.current = prefersReducedMotion();
    if (reduced.current) {
      setActive(-1);
      return;
    }

    const desktop = window.matchMedia("(min-width: 1024px)").matches;

    const ctx = gsap.context(() => {
      gsap.from(".wc-head", {
        opacity: 0,
        y: 26,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.1,
        scrollTrigger: { trigger: sectionRef.current, start: "top 80%" },
      });

      if (desktop) {
        // Pin the section and step through principles as it is scrubbed.
        ScrollTrigger.create({
          trigger: sectionRef.current,
          start: "top top",
          end: `+=${PRINCIPLES.length * 60}%`,
          pin: true,
          scrub: true,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            const idx = Math.min(
              PRINCIPLES.length - 1,
              Math.floor(self.progress * PRINCIPLES.length),
            );
            setActive((prev) => (prev === idx ? prev : idx));
          },
        });
      } else {
        // Mobile: no pin — activate whichever principle passes the centre.
        gsap.utils.toArray<HTMLElement>(".wc-item").forEach((el, i) => {
          ScrollTrigger.create({
            trigger: el,
            start: "top 55%",
            onEnter: () => setActive(i),
            onEnterBack: () => setActive(i),
          });
        });
      }
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  const counter = active === -1 ? PRINCIPLES.length : active + 1;

  return (
    <section
      ref={sectionRef}
      id="why-choose-us"
      className="relative w-full overflow-hidden bg-ink text-cream"
    >
      <div className="mx-auto flex max-w-[110rem] flex-col gap-12 px-6 py-24 md:px-10 lg:grid lg:min-h-[100svh] lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:justify-center lg:gap-20 lg:px-14">
        {/* Left — heading */}
        <div>
          <p className="wc-head mb-8 flex items-center gap-3 text-[0.7rem] font-medium uppercase tracking-[0.32em] text-cream/45">
            <span className="h-px w-8 bg-gold" aria-hidden="true" />
            Why Lumina
          </p>
          <h2 className="wc-head font-serif text-[2.5rem] font-medium leading-[1.02] tracking-[-0.02em] text-cream sm:text-5xl lg:text-6xl">
            Care that goes
            <br />
            <span className="italic text-cream/85">beyond the chair.</span>
          </h2>
          <p className="wc-head mt-10 flex items-center gap-3 font-serif text-lg text-cream/50 tabular-nums">
            <span className="text-gold">
              {String(counter).padStart(2, "0")}
            </span>
            <span className="h-px w-10 bg-cream/20" aria-hidden="true" />
            <span>{String(PRINCIPLES.length).padStart(2, "0")}</span>
          </p>
        </div>

        {/* Right — principles */}
        <ul className="wc-head">
          {PRINCIPLES.map((p, i) => {
            const isActive = active === -1 || i === active;
            return (
              <li
                key={p.number}
                className={`wc-item border-t border-cream/10 py-5 transition-all duration-500 ease-out last:border-b md:py-6 ${
                  isActive ? "opacity-100" : "opacity-35"
                }`}
              >
                <div
                  className={`flex items-baseline gap-5 transition-transform duration-500 ${
                    isActive ? "translate-x-0 md:translate-x-2" : "translate-x-0"
                  }`}
                >
                  <span
                    className={`text-xs font-medium tabular-nums tracking-widest transition-colors duration-500 ${
                      isActive ? "text-gold" : "text-cream/40"
                    }`}
                  >
                    {p.number}
                  </span>
                  <h3
                    className={`font-serif text-[1.9rem] font-medium leading-tight tracking-tight transition-colors duration-500 sm:text-4xl lg:text-5xl ${
                      isActive ? "text-cream" : "text-cream/70"
                    }`}
                  >
                    {p.title}
                  </h3>
                </div>
                <div
                  className={`grid transition-[grid-template-rows,opacity] duration-500 ease-out max-lg:!grid-rows-[1fr] max-lg:!opacity-100 ${
                    isActive
                      ? "grid-rows-[1fr] opacity-100"
                      : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="max-w-md pl-9 pt-3 text-sm leading-relaxed text-cream/55 sm:text-base">
                      {p.description}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
