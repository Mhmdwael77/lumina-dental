"use client";

import { useRef } from "react";
import gsap, { ScrollTrigger } from "@/lib/gsap";
import { ArrowRight } from "lucide-react";
import { Grain } from "@/components/ui/Grain";
import { prefersReducedMotion, useIsoLayoutEffect } from "@/lib/use-iso-layout-effect";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export function FeaturedTreatment() {
  const { t } = useLanguage();
  const sectionRef = useRef<HTMLElement>(null);

  useIsoLayoutEffect(() => {
    const reduce = prefersReducedMotion();
    const ctx = gsap.context(() => {
      if (reduce) return;

      // Image reveal (wipe up) + inner scale settle.
      gsap.from(".ft-frame", {
        clipPath: "inset(100% 0% 0% 0%)",
        duration: 1.2,
        ease: "power3.out",
        scrollTrigger: { trigger: ".ft-frame", start: "top 85%" },
      });
      gsap.from(".ft-image", {
        scale: 1.35,
        duration: 1.4,
        ease: "power3.out",
        scrollTrigger: { trigger: ".ft-frame", start: "top 85%" },
      });

      // Subtle parallax while scrolling through.
      gsap.to(".ft-image", {
        yPercent: 12,
        ease: "none",
        scrollTrigger: {
          trigger: sectionRef.current,
          start: "top bottom",
          end: "bottom top",
          scrub: true,
        },
      });

      // Text reveal.
      gsap.from(".ft-copy", {
        opacity: 0,
        y: 30,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.12,
        scrollTrigger: { trigger: sectionRef.current, start: "top 68%" },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="featured-treatment"
      className="relative w-full overflow-hidden bg-cream px-6 py-28 md:px-10 md:py-36 lg:px-14"
    >
      <div className="mx-auto grid max-w-[110rem] items-center gap-12 lg:grid-cols-2 lg:gap-20">
        {/* Copy */}
        <div className="order-2 lg:order-1">
          <p className="ft-copy mb-8 flex items-center gap-3 text-[0.7rem] font-medium uppercase tracking-[0.32em] text-ink/50">
            <span className="h-px w-8 bg-gold" aria-hidden="true" />
            {t("site.featuredTreatment.eyebrow")}
          </p>
          <h2 className="ft-copy font-serif text-[3.25rem] font-medium leading-[0.95] tracking-[-0.02em] text-ink sm:text-7xl lg:text-8xl">
            {t("site.featuredTreatment.headingLine1")}
            <br />
            <span className="italic text-ink/90">{t("site.featuredTreatment.headingLine2")}</span>
          </h2>
          <p className="ft-copy mt-8 max-w-md text-base leading-relaxed text-ink/60 sm:text-lg">
            {t("site.featuredTreatment.description")}
          </p>
          <a
            href="#treatments"
            className="ft-copy group mt-10 inline-flex items-center gap-3 text-xs font-medium uppercase tracking-[0.22em] text-ink"
          >
            <span className="relative">
              {t("site.featuredTreatment.exploreTreatment")}
              <span className="absolute -bottom-1 left-0 h-px w-full origin-left scale-x-0 bg-gold transition-transform duration-500 group-hover:scale-x-100" />
            </span>
            <ArrowRight
              className="h-4 w-4 text-gold transition-transform duration-500 group-hover:translate-x-1.5"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </a>
        </div>

        {/* Image */}
        <div className="order-1 lg:order-2">
          <div className="ft-frame relative aspect-[4/5] w-full overflow-hidden rounded-2xl sm:aspect-[3/4] lg:aspect-[4/5]">
            <div className="absolute inset-0">
              <img
                src="/images/featured_makeover.png"
                alt="Smile Makeover Signature Service"
                loading="lazy"
                decoding="async"
                className="ft-image h-full w-full object-cover scale-[1.12]"
              />
              {/* soft studio highlight */}
              <div className="absolute -left-1/4 -top-1/4 h-2/3 w-2/3 rounded-full bg-white/40 blur-3xl" />
              {/* depth vignette */}
              <div className="absolute inset-0 bg-gradient-to-t from-ink/35 via-transparent to-transparent" />
              <Grain opacity={0.1} />
            </div>

            {/* Overlay caption */}
            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between p-6 md:p-8">
              <span className="text-[0.65rem] font-medium uppercase tracking-[0.28em] text-cream/90">
                {t("site.featuredTreatment.signatureService")}
              </span>
              <span className="font-serif text-5xl leading-none text-cream/30">
                01
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
