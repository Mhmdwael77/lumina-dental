"use client";

import { useRef, useState } from "react";
import gsap, { ScrollTrigger } from "@/lib/gsap";
import { ChevronsLeftRight, Sparkles } from "lucide-react";
import { Grain } from "@/components/ui/Grain";
import { BEFORE_AFTER_CASES } from "@/lib/constants";
import { prefersReducedMotion, useIsoLayoutEffect } from "@/lib/use-iso-layout-effect";

export function BeforeAfter() {
  const sectionRef = useRef<HTMLElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const beforeRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const sliderBtnRef = useRef<HTMLButtonElement>(null);
  const dragging = useRef(false);
  const pos = useRef(50);

  const [activeCase, setActiveCase] = useState(0);
  const active = BEFORE_AFTER_CASES[activeCase];

  const applyPos = (p: number) => {
    const clamped = Math.max(1, Math.min(99, p));
    pos.current = clamped;
    if (beforeRef.current)
      beforeRef.current.style.clipPath = `inset(0 ${100 - clamped}% 0 0)`;
    if (handleRef.current) handleRef.current.style.left = `${clamped}%`;
    sliderBtnRef.current?.setAttribute(
      "aria-valuenow",
      String(Math.round(clamped)),
    );
  };

  const posFromClientX = (clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    applyPos(((clientX - rect.left) / rect.width) * 100);
  };

  // Keep the divider where it is when switching cases / on mount.
  useIsoLayoutEffect(() => {
    applyPos(pos.current);
    const reduce = prefersReducedMotion();
    if (reduce) return;
    const ctx = gsap.context(() => {
      gsap.from(".ba-head", {
        opacity: 0,
        y: 26,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.1,
        scrollTrigger: { trigger: sectionRef.current, start: "top 72%" },
      });
      gsap.from(".ba-stage", {
        opacity: 0,
        y: 34,
        scale: 0.98,
        duration: 1,
        ease: "power3.out",
        scrollTrigger: { trigger: ".ba-stage", start: "top 82%" },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    containerRef.current?.setPointerCapture(e.pointerId);
    posFromClientX(e.clientX);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    posFromClientX(e.clientX);
  };
  const stopDrag = (e: React.PointerEvent) => {
    dragging.current = false;
    try {
      containerRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* no-op */
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 8 : 2;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      applyPos(pos.current - step);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      applyPos(pos.current + step);
    } else if (e.key === "Home") {
      e.preventDefault();
      applyPos(0);
    } else if (e.key === "End") {
      e.preventDefault();
      applyPos(100);
    }
  };

  return (
    <section
      ref={sectionRef}
      id="before-after"
      className="relative w-full overflow-hidden bg-beige px-6 py-28 md:px-10 md:py-36 lg:px-14"
    >
      <div className="mx-auto max-w-[100rem]">
        {/* Header */}
        <div className="mb-12 md:mb-16">
          <p className="ba-head mb-8 flex items-center gap-3 text-[0.7rem] font-medium uppercase tracking-[0.32em] text-ink/50">
            <span className="h-px w-8 bg-gold" aria-hidden="true" />
            Before / After
          </p>
          <h2 className="ba-head max-w-3xl font-serif text-[2.5rem] font-medium leading-[1.02] tracking-[-0.02em] text-ink sm:text-5xl lg:text-6xl">
            Real smiles.
            <br />
            <span className="italic text-ink/90">Real transformations.</span>
          </h2>
        </div>

        {/* Case selector */}
        <div className="ba-head mb-8 flex flex-wrap gap-x-8 gap-y-3">
          {BEFORE_AFTER_CASES.map((c, i) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveCase(i)}
              aria-pressed={activeCase === i}
              className={`relative pb-1.5 text-xs font-medium uppercase tracking-[0.18em] transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold ${
                activeCase === i ? "text-ink" : "text-ink/40 hover:text-ink/70"
              }`}
            >
              {c.treatment}
              <span
                className={`absolute bottom-0 left-0 h-px w-full origin-left bg-gold transition-transform duration-500 ${
                  activeCase === i ? "scale-x-100" : "scale-x-0"
                }`}
              />
            </button>
          ))}
        </div>

        {/* Slider stage */}
        <figure className="ba-stage">
          <div
            ref={containerRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={stopDrag}
            onPointerCancel={stopDrag}
            className="relative aspect-[4/3] w-full touch-pan-y select-none overflow-hidden rounded-2xl shadow-[0_40px_80px_-40px_rgba(16,24,32,0.5)] sm:aspect-[16/10] lg:aspect-[2/1]"
          >
            {/* AFTER (base layer) */}
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${active.after})` }}
            >
              <div className="absolute right-[12%] top-[18%] h-1/2 w-1/2 rounded-full bg-white/30 blur-3xl" />
              <Sparkles
                className="absolute right-[10%] top-[16%] h-8 w-8 text-gold/70"
                strokeWidth={1}
                aria-hidden="true"
              />
              <Grain opacity={0.08} />
              <span className="absolute right-5 top-5 rounded-full bg-ink/10 px-3 py-1.5 text-[0.6rem] font-medium uppercase tracking-[0.22em] text-ink/70 backdrop-blur-sm">
                After
              </span>
            </div>

            {/* BEFORE (clipped layer) */}
            <div
              ref={beforeRef}
              className="absolute inset-0 bg-cover bg-center"
              style={{
                backgroundImage: `url(${active.before})`,
                clipPath: "inset(0 50% 0 0)",
              }}
            >
              <div className="absolute inset-0 bg-ink/10" />
              <Grain opacity={0.12} />
              <span className="absolute left-5 top-5 rounded-full bg-ink/25 px-3 py-1.5 text-[0.6rem] font-medium uppercase tracking-[0.22em] text-cream/90 backdrop-blur-sm">
                Before
              </span>
            </div>

            {/* Handle */}
            <div
              ref={handleRef}
              className="absolute inset-y-0 z-10"
              style={{ left: "50%" }}
            >
              <div className="absolute inset-y-0 -ml-px w-0.5 bg-cream/90 shadow-[0_0_12px_rgba(16,24,32,0.35)]" />
              <button
                ref={sliderBtnRef}
                type="button"
                role="slider"
                aria-label={`Reveal before and after — ${active.treatment}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={50}
                tabIndex={0}
                onKeyDown={onKeyDown}
                className="absolute left-1/2 top-1/2 grid h-12 w-12 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full bg-cream text-ink shadow-[0_8px_24px_-6px_rgba(16,24,32,0.5)] transition-transform duration-200 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
              >
                <ChevronsLeftRight className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>
          </div>

          {/* Caption */}
          <figcaption className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between">
            <h3 className="font-serif text-2xl font-medium tracking-tight text-ink">
              {active.treatment}
            </h3>
            <p className="max-w-md text-sm leading-relaxed text-ink/60 sm:text-right">
              {active.description}
            </p>
          </figcaption>
        </figure>

        <p className="mt-8 text-[0.68rem] uppercase tracking-[0.18em] text-ink/35">
          Illustrative demonstration — not actual patient results.
        </p>
      </div>
    </section>
  );
}
