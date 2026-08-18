"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap, { ScrollTrigger } from "@/lib/gsap";
import { NAV_LINKS } from "@/lib/constants";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { LanguageToggle } from "@/components/ui/LanguageToggle";

const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

// NAV_LINKS is shared, locale-agnostic data — map each href to its
// translation key here rather than making the constant itself bilingual.
const NAV_LINK_KEYS: Record<string, string> = {
  "#brand-statement": "site.nav.about",
  "#treatments": "site.nav.treatments",
  "#before-after": "site.nav.results",
  "#doctor": "site.nav.doctor",
  "#clinic-experience": "site.nav.clinic",
};

export function Navbar({ minimal = false }: { minimal?: boolean }) {
  const headerRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const { t, isProvided } = useLanguage();

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
        {/* Brand — links to the section anchor on the home page, or straight
            home when the navbar is in minimal (focused-flow) mode. */}
        {minimal ? (
          <Link
            href="/"
            className="whitespace-nowrap text-sm font-medium uppercase tracking-[0.18em] text-ink transition-opacity hover:opacity-70 sm:tracking-[0.28em]"
            aria-label={t("site.nav.brandAria")}
          >
            Lumina <span className="text-gold">Dental</span>
          </Link>
        ) : (
          <a
            href="#hero"
            className="whitespace-nowrap text-sm font-medium uppercase tracking-[0.18em] text-ink transition-opacity hover:opacity-70 sm:tracking-[0.28em]"
            aria-label={t("site.nav.brandAria")}
          >
            Lumina <span className="text-gold">Dental</span>
          </a>
        )}

        {/* Primary links — hidden in minimal mode to keep the booking flow
            focused (no way to wander off mid-booking from the header). The
            language toggle stays available either way — switching language
            isn't "wandering off" the way a nav link would be. */}
        {!minimal && (
          <ul className="hidden items-center gap-10 lg:flex">
            {NAV_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className="text-xs font-light uppercase tracking-[0.22em] text-ink/60 transition-colors duration-300 hover:text-ink"
                >
                  {NAV_LINK_KEYS[link.href] ? t(NAV_LINK_KEYS[link.href]) : link.label}
                </a>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-3">
          {isProvided && (
            <LanguageToggle className="border border-ink/15 text-ink/60 hover:text-ink hover:border-ink/40" />
          )}
          {!minimal && (
            <Link
              href="/booking"
              className="whitespace-nowrap rounded-full bg-ink px-4 py-2.5 text-[0.62rem] font-medium uppercase tracking-[0.14em] text-cream transition-all duration-300 hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold sm:px-6 sm:py-3 sm:text-[0.7rem] sm:tracking-[0.2em]"
            >
              {t("site.nav.bookAppointment")}
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
