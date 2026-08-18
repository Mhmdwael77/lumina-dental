"use client";

import { useRef } from "react";
import gsap, { ScrollTrigger } from "@/lib/gsap";
import { Portrait } from "@/components/ui/Portrait";
import { DOCTOR } from "@/lib/constants";
import { prefersReducedMotion, useIsoLayoutEffect } from "@/lib/use-iso-layout-effect";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export function Doctor() {
  const { t } = useLanguage();
  const credentials = [0, 1, 2, 3].map((i) => t(`site.doctor.credential${i}`));
  const sectionRef = useRef<HTMLElement>(null);

  useIsoLayoutEffect(() => {
    if (prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.from(".dr-frame", {
        clipPath: "inset(0% 0% 100% 0%)",
        duration: 1.2,
        ease: "power3.out",
        scrollTrigger: { trigger: ".dr-frame", start: "top 85%" },
      });
      gsap.from(".dr-portrait", {
        scale: 1.3,
        duration: 1.4,
        ease: "power3.out",
        scrollTrigger: { trigger: ".dr-frame", start: "top 85%" },
      });
      gsap.to(".dr-portrait", {
        yPercent: 10,
        ease: "none",
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      });
      gsap.from(".dr-copy", {
        opacity: 0,
        y: 28,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.1,
        scrollTrigger: { trigger: sectionRef.current, start: "top 68%" },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="doctor"
      className="relative w-full overflow-hidden bg-cream px-6 py-28 md:px-10 md:py-36 lg:px-14"
    >
      <div className="mx-auto grid max-w-[110rem] items-center gap-12 lg:grid-cols-[0.85fr_1.15fr] lg:gap-20">
        {/* Portrait */}
        <div className="order-1">
          <div className="dr-frame relative aspect-[4/5] w-full overflow-hidden rounded-2xl">
            <div className="dr-portrait absolute inset-0 scale-[1.05]">
              <Portrait
                src={DOCTOR.image}
                alt={DOCTOR.name}
                monogram={DOCTOR.monogram}
              />
            </div>
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-6 md:p-7">
              <span className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-cream/90">
                {DOCTOR.role}
              </span>
            </div>
          </div>
        </div>

        {/* Copy */}
        <div className="order-2">
          <p className="dr-copy mb-8 flex items-center gap-3 text-[0.7rem] font-medium uppercase tracking-[0.32em] text-ink/50">
            <span className="h-px w-8 bg-gold" aria-hidden="true" />
            {t("site.doctor.eyebrow")}
          </p>

          <h2 className="dr-copy font-serif text-[2.75rem] font-medium leading-[1.0] tracking-[-0.02em] text-ink sm:text-6xl lg:text-7xl">
            {t("site.doctor.headingPrefix")} <em className="italic text-ink/90">{t("site.doctor.headingSuffix")}</em>
          </h2>

          <div className="dr-copy mt-8">
            <p className="font-serif text-2xl font-medium text-ink sm:text-3xl">
              {DOCTOR.name}
            </p>
            <p className="mt-1 text-sm uppercase tracking-[0.2em] text-gold">
              {DOCTOR.role}
            </p>
          </div>

          {/* Credentials */}
          <ul className="dr-copy mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-medium uppercase tracking-[0.15em] text-ink/55">
            {credentials.map((c, i) => (
              <li key={c} className="flex items-center gap-5">
                {i > 0 && (
                  <span className="h-3 w-px bg-ink/20" aria-hidden="true" />
                )}
                {c}
              </li>
            ))}
          </ul>

          {/* Quote */}
          <blockquote className="dr-copy mt-10 max-w-xl border-l-2 border-gold/50 pl-6 font-serif text-xl italic leading-relaxed text-ink/80 sm:text-2xl">
            “{t("site.doctor.quote")}”
          </blockquote>

          <p className="dr-copy mt-10 text-[0.68rem] uppercase tracking-[0.18em] text-ink/35">
            {t("site.doctor.disclaimer")}
          </p>
        </div>
      </div>
    </section>
  );
}
