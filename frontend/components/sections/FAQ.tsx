"use client";

import { useRef, useState } from "react";
import gsap, { ScrollTrigger } from "@/lib/gsap";
import { Plus } from "lucide-react";
import { FAQ_ITEMS } from "@/lib/constants";
import { prefersReducedMotion, useIsoLayoutEffect } from "@/lib/use-iso-layout-effect";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export function FAQ() {
  const { t } = useLanguage();
  const localizedFaqItems = FAQ_ITEMS.map((item, i) => ({
    q: t(`site.faq.q${i + 1}`),
    a: t(`site.faq.a${i + 1}`),
  }));
  const sectionRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState<number | null>(0);

  useIsoLayoutEffect(() => {
    if (prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.from(".faq-reveal", {
        opacity: 0,
        y: 26,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.08,
        scrollTrigger: { trigger: sectionRef.current, start: "top 74%" },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="faq"
      className="relative w-full overflow-hidden bg-cream px-6 py-28 md:px-10 md:py-36 lg:px-14"
    >
      <div className="mx-auto grid max-w-[110rem] gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24">
        {/* Header */}
        <div className="lg:sticky lg:top-32 lg:self-start">
          <p className="faq-reveal mb-8 flex items-center gap-3 text-[0.7rem] font-medium uppercase tracking-[0.32em] text-ink/50">
            <span className="h-px w-8 bg-gold" aria-hidden="true" />
            {t("site.faq.eyebrow")}
          </p>
          <h2 className="faq-reveal font-serif text-[2.5rem] font-medium leading-[1.02] tracking-[-0.02em] text-ink sm:text-5xl lg:text-6xl">
            {t("site.faq.headingLine1")}
            <br />
            <em className="italic text-ink/90">{t("site.faq.headingLine2")}</em>
          </h2>
        </div>

        {/* Accordion */}
        <div className="faq-reveal">
          {localizedFaqItems.map((item, i) => {
            const isOpen = open === i;
            return (
              <div key={item.q} className="border-t border-ink/12 last:border-b">
                <h3>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    aria-controls={`faq-panel-${i}`}
                    id={`faq-trigger-${i}`}
                    className="flex w-full items-center justify-between gap-6 py-6 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold md:py-7"
                  >
                    <span className="font-serif text-lg font-medium tracking-tight text-ink sm:text-2xl">
                      {item.q}
                    </span>
                    <Plus
                      className={`h-5 w-5 shrink-0 text-gold transition-transform duration-500 ${isOpen ? "rotate-45" : ""}`}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                  </button>
                </h3>
                <div
                  id={`faq-panel-${i}`}
                  role="region"
                  aria-labelledby={`faq-trigger-${i}`}
                  className={`grid transition-[grid-template-rows,opacity] duration-500 ease-out ${
                    isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="max-w-2xl pb-7 pr-6 text-base leading-relaxed text-ink/60">
                      {item.a}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
