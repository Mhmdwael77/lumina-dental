"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap, { ScrollTrigger } from "@/lib/gsap";
import { NAV_LINKS } from "@/lib/constants";

const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

export function Navbar() {
  const headerRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);

  // Entrance (GSAP so SSR markup matches the client — no hydration mismatch).
  useIsoLayoutEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const ctx = gsap.context(() => {
      gsap.from(headerRef.current, {
        autoAlpha: 0,
        y: -16,
        duration: 0.8,
        ease: "power3.out",
        delay: 0.1,
      });
    }, headerRef);
    return () => ctx.revert();
  }, []);

  // Condensed / blurred state — flips once when crossing the threshold.
  useEffect(() => {
    const st = ScrollTrigger.create({
      start: 64,
      end: "max",
      onToggle: (self) => setScrolled(self.isActive),
    });
    return () => st.kill();
  }, []);

  return (
    <header
      ref={headerRef}
      data-scrolled={scrolled}
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,backdrop-filter,box-shadow] duration-500 ${
        scrolled
          ? "bg-cream/80 shadow-[0_1px_0_0_rgba(16,24,32,0.06)] backdrop-blur-md"
          : "bg-transparent"
      }`}
    >
      <nav
        className={`mx-auto flex max-w-[110rem] items-center justify-between px-5 transition-[padding] duration-500 sm:px-6 md:px-10 lg:px-14 ${
          scrolled ? "py-4" : "py-6"
        }`}
      >
        {/* Brand */}
        <a
          href="#hero"
          className="whitespace-nowrap text-sm font-medium uppercase tracking-[0.18em] text-ink transition-opacity hover:opacity-70 sm:tracking-[0.28em]"
          aria-label="Lumina Dental — home"
        >
          Lumina <span className="text-gold">Dental</span>
        </a>

        {/* Primary links */}
        <ul className="hidden items-center gap-10 lg:flex">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                className="text-xs font-light uppercase tracking-[0.22em] text-ink/60 transition-colors duration-300 hover:text-ink"
              >
                {link.label}
              </a>
            </li>
          ))}
        </ul>

        {/* CTA */}
        <a
          href="#booking"
          className="whitespace-nowrap rounded-full bg-ink px-4 py-2.5 text-[0.62rem] font-medium uppercase tracking-[0.14em] text-cream transition-all duration-300 hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold sm:px-6 sm:py-3 sm:text-[0.7rem] sm:tracking-[0.2em]"
        >
          Book Appointment
        </a>
      </nav>
    </header>
  );
}
