"use client";

import { MessageCircle, Phone } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export function EmergencyCTA() {
  const { t } = useLanguage();
  return (
    <section
      id="emergency-cta"
      className="relative w-full overflow-hidden bg-ink px-6 py-16 text-cream md:px-10 md:py-20 lg:px-14"
    >
      <div className="mx-auto flex max-w-[110rem] flex-col gap-8 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="mb-3 flex items-center gap-3 text-[0.68rem] font-medium uppercase tracking-[0.28em] text-gold">
            <span className="h-px w-6 bg-gold" aria-hidden="true" />
            {t("site.emergencyCTA.eyebrow")}
          </p>
          <h2 className="font-serif text-3xl font-medium tracking-tight text-cream sm:text-4xl">
            {t("site.emergencyCTA.heading")}
          </h2>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-cream/60 sm:text-base">
            {t("site.emergencyCTA.description")}
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <a
            href="tel:+201000000000"
            className="inline-flex items-center justify-center gap-2.5 rounded-full bg-cream px-7 py-3.5 text-xs font-medium uppercase tracking-[0.2em] text-ink transition-colors duration-300 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
          >
            <Phone className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            {t("site.emergencyCTA.callNow")}
          </a>
          <a
            href="https://wa.me/201000000000"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2.5 rounded-full border border-cream/25 px-7 py-3.5 text-xs font-medium uppercase tracking-[0.2em] text-cream transition-colors duration-300 hover:border-cream/60 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
          >
            <MessageCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            {t("site.emergencyCTA.whatsapp")}
          </a>
        </div>
      </div>
    </section>
  );
}
