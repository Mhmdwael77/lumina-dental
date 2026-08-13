"use client";

import { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ArrowUpRight, Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { Grain } from "@/components/ui/Grain";
import { CLINIC } from "@/lib/constants";
import { prefersReducedMotion, useIsoLayoutEffect } from "@/lib/use-iso-layout-effect";

gsap.registerPlugin(ScrollTrigger);

export function Contact() {
  const sectionRef = useRef<HTMLElement>(null);

  useIsoLayoutEffect(() => {
    if (prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.from(".ct-reveal", {
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
      id="contact"
      className="relative w-full overflow-hidden bg-cream px-6 py-28 md:px-10 md:py-36 lg:px-14"
    >
      <div className="mx-auto max-w-[110rem]">
        <div className="mb-14 md:mb-20">
          <p className="ct-reveal mb-8 flex items-center gap-3 text-[0.7rem] font-medium uppercase tracking-[0.32em] text-ink/50">
            <span className="h-px w-8 bg-gold" aria-hidden="true" />
            Contact
          </p>
          <h2 className="ct-reveal font-serif text-[2.5rem] font-medium leading-[1.02] tracking-[-0.02em] text-ink sm:text-5xl lg:text-6xl">
            Visit our <em className="italic text-ink/90">clinic.</em>
          </h2>
        </div>

        <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
          {/* Details */}
          <div className="ct-reveal order-2 lg:order-1">
            <p className="font-serif text-2xl font-medium tracking-tight text-ink">
              {CLINIC.name}
            </p>

            <dl className="mt-8 space-y-7">
              <div className="flex gap-4">
                <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-gold" strokeWidth={1.5} aria-hidden="true" />
                <div>
                  <dt className="text-[0.68rem] font-medium uppercase tracking-[0.18em] text-ink/40">
                    Address
                  </dt>
                  <dd className="mt-1 text-ink/80">{CLINIC.address}</dd>
                </div>
              </div>

              <div className="flex gap-4">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-gold" strokeWidth={1.5} aria-hidden="true" />
                <div>
                  <dt className="text-[0.68rem] font-medium uppercase tracking-[0.18em] text-ink/40">
                    Opening Hours
                  </dt>
                  {CLINIC.hours.map((h) => (
                    <dd key={h.days} className="mt-1 flex flex-wrap gap-x-3 text-ink/80">
                      <span>{h.days}</span>
                      <span className="text-ink/50">{h.time}</span>
                    </dd>
                  ))}
                </div>
              </div>

              <div className="flex gap-4">
                <Phone className="mt-0.5 h-5 w-5 shrink-0 text-gold" strokeWidth={1.5} aria-hidden="true" />
                <div>
                  <dt className="text-[0.68rem] font-medium uppercase tracking-[0.18em] text-ink/40">
                    Phone
                  </dt>
                  <dd className="mt-1">
                    <a href={CLINIC.phoneHref} className="text-ink/80 transition-colors hover:text-ink">
                      {CLINIC.phone}
                    </a>
                  </dd>
                </div>
              </div>

              <div className="flex gap-4">
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-gold" strokeWidth={1.5} aria-hidden="true" />
                <div>
                  <dt className="text-[0.68rem] font-medium uppercase tracking-[0.18em] text-ink/40">
                    Email
                  </dt>
                  <dd className="mt-1">
                    <a href={`mailto:${CLINIC.email}`} className="text-ink/80 transition-colors hover:text-ink">
                      {CLINIC.email}
                    </a>
                  </dd>
                </div>
              </div>
            </dl>

            {/* Buttons */}
            <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a
                href={CLINIC.directions}
                target="_blank"
                rel="noopener noreferrer"
                className="group inline-flex items-center justify-center gap-2 rounded-full bg-ink px-6 py-3.5 text-xs font-medium uppercase tracking-[0.2em] text-cream transition-all duration-300 hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
              >
                Get Directions
                <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" strokeWidth={1.5} aria-hidden="true" />
              </a>
              <a
                href={CLINIC.phoneHref}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-ink/15 px-6 py-3.5 text-xs font-medium uppercase tracking-[0.2em] text-ink transition-colors duration-300 hover:border-ink/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
              >
                <Phone className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                Call Clinic
              </a>
              <a
                href={CLINIC.whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-full border border-ink/15 px-6 py-3.5 text-xs font-medium uppercase tracking-[0.2em] text-ink transition-colors duration-300 hover:border-ink/40 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
              >
                <MessageCircle className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
                WhatsApp
              </a>
            </div>
          </div>

          {/* Map placeholder */}
          <div className="ct-reveal order-1 lg:order-2">
            <a
              href={CLINIC.directions}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open clinic location in maps"
              className="group relative block aspect-[4/3] w-full overflow-hidden rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold lg:aspect-auto lg:h-full lg:min-h-[26rem]"
            >
              <div
                className="absolute inset-0"
                style={{ backgroundImage: "linear-gradient(150deg, #e7e1d4 0%, #cbc7bd 55%, #b7bfbc 100%)" }}
              />
              {/* faux map grid */}
              <div
                className="absolute inset-0 opacity-40"
                style={{
                  backgroundImage:
                    "linear-gradient(#10182010 1px, transparent 1px), linear-gradient(90deg, #10182010 1px, transparent 1px)",
                  backgroundSize: "48px 48px",
                }}
                aria-hidden="true"
              />
              <div className="absolute left-1/2 top-1/3 h-40 w-40 -translate-x-1/2 rounded-full bg-white/40 blur-3xl" aria-hidden="true" />
              <Grain opacity={0.08} />

              {/* pin */}
              <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
                <span className="grid h-12 w-12 place-items-center rounded-full bg-ink text-cream shadow-[0_10px_30px_-8px_rgba(16,24,32,0.6)] transition-transform duration-300 group-hover:-translate-y-1">
                  <MapPin className="h-5 w-5 text-gold" strokeWidth={2} aria-hidden="true" />
                </span>
              </div>

              <div className="absolute bottom-5 left-5 rounded-full bg-cream/90 px-4 py-2 text-[0.68rem] font-medium uppercase tracking-[0.18em] text-ink backdrop-blur">
                {CLINIC.address}
              </div>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
