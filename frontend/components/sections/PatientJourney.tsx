"use client";

import { useRef, useState } from "react";
import gsap, { ScrollTrigger } from "@/lib/gsap";
import { Check } from "lucide-react";
import { JOURNEY_STEPS } from "@/lib/constants";
import { prefersReducedMotion, useIsoLayoutEffect } from "@/lib/use-iso-layout-effect";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export function PatientJourney() {
  const { t } = useLanguage();
  const localizedSteps = JOURNEY_STEPS.map((step, i) => ({
    ...step,
    title: t(`site.patientJourney.s${i + 1}Title`),
    description: t(`site.patientJourney.s${i + 1}Desc`),
  }));
  const sectionRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  // number of steps reached (past the activation line)
  const [reached, setReached] = useState(0);

  useIsoLayoutEffect(() => {
    if (prefersReducedMotion()) {
      setReached(JOURNEY_STEPS.length);
      return;
    }
    const ctx = gsap.context(() => {
      gsap.from(".pj-head", {
        opacity: 0,
        y: 24,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.1,
        scrollTrigger: { trigger: sectionRef.current, start: "top 78%" },
      });

      // Connecting line fills as the timeline scrolls past the activation line.
      gsap.fromTo(
        ".pj-fill",
        { scaleY: 0 },
        {
          scaleY: 1,
          ease: "none",
          scrollTrigger: {
            trigger: listRef.current,
            start: "top 55%",
            end: "bottom 60%",
            scrub: true,
          },
        },
      );

      // Each step activates as its node crosses the activation line.
      gsap.utils.toArray<HTMLElement>(".pj-step").forEach((el, i) => {
        ScrollTrigger.create({
          trigger: el,
          start: "top 55%",
          onEnter: () => setReached((r) => Math.max(r, i + 1)),
          onLeaveBack: () => setReached((r) => Math.min(r, i)),
        });
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="patient-journey"
      className="relative w-full overflow-hidden bg-cream px-6 py-28 md:px-10 md:py-36 lg:px-14"
    >
      <div className="mx-auto grid max-w-[110rem] gap-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24">
        {/* Header */}
        <div className="lg:sticky lg:top-32 lg:self-start">
          <p className="pj-head mb-8 flex items-center gap-3 text-[0.7rem] font-medium uppercase tracking-[0.32em] text-ink/50">
            <span className="h-px w-8 bg-gold" aria-hidden="true" />
            {t("site.patientJourney.eyebrow")}
          </p>
          <h2 className="pj-head font-serif text-[2.5rem] font-medium leading-[1.02] tracking-[-0.02em] text-ink sm:text-5xl lg:text-6xl">
            {t("site.patientJourney.headingLine1")}
            <br />
            {t("site.patientJourney.headingPrefix")} <em className="italic text-ink/90">{t("site.patientJourney.headingSuffix")}</em>
          </h2>
        </div>

        {/* Timeline */}
        <ol ref={listRef} className="relative">
          {/* rail track + fill */}
          <div className="absolute bottom-6 left-[13px] top-3 w-px bg-ink/15 md:left-[15px]" aria-hidden="true" />
          <div
            className="pj-fill absolute bottom-6 left-[13px] top-3 w-px origin-top bg-gold md:left-[15px]"
            aria-hidden="true"
          />

          {localizedSteps.map((step, i) => {
            const active = i < reached;
            return (
              <li
                key={step.number}
                className="pj-step relative flex gap-6 pb-14 last:pb-0 md:gap-8"
              >
                {/* node */}
                <div
                  className={`relative z-10 mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border transition-all duration-500 md:h-8 md:w-8 ${
                    active
                      ? "border-gold bg-gold text-ink"
                      : "border-ink/25 bg-cream text-transparent"
                  }`}
                >
                  <Check
                    className={`h-3.5 w-3.5 transition-opacity duration-500 ${active ? "opacity-100" : "opacity-0"}`}
                    strokeWidth={2.5}
                    aria-hidden="true"
                  />
                </div>

                {/* content */}
                <div
                  className={`pb-1 transition-opacity duration-500 ${active ? "opacity-100" : "opacity-45"}`}
                >
                  <span
                    className={`text-xs font-medium tracking-[0.2em] transition-colors duration-500 ${active ? "text-gold" : "text-ink/40"}`}
                  >
                    {step.number}
                  </span>
                  <h3 className="mt-1 font-serif text-2xl font-medium tracking-tight text-ink sm:text-3xl">
                    {step.title}
                  </h3>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-ink/55 sm:text-base">
                    {step.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
