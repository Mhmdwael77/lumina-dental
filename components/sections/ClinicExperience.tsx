"use client";

import { useRef } from "react";
import gsap, { ScrollTrigger } from "@/lib/gsap";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Grain } from "@/components/ui/Grain";
import { CLINIC_IMAGES } from "@/lib/constants";
import { getLenis } from "@/lib/lenis";
import { prefersReducedMotion, useIsoLayoutEffect } from "@/lib/use-iso-layout-effect";

export function ClinicExperience() {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const stRef = useRef<ScrollTrigger | null>(null);

  // Advance the gallery by one panel — via the pinned scroll on desktop, or by
  // scrolling the native horizontal track on mobile / reduced-motion.
  const nudge = (dir: number) => {
    const track = trackRef.current;
    const wrapper = wrapperRef.current;
    if (!track || track.children.length < 2) return;
    const first = track.children[0] as HTMLElement;
    const second = track.children[1] as HTMLElement;
    const step = second.offsetLeft - first.offsetLeft;
    const st = stRef.current;
    const desktop = window.matchMedia("(min-width: 1024px)").matches;

    if (desktop && st) {
      const lenis = getLenis();
      const current = lenis ? lenis.scroll : window.scrollY;
      const idx = Math.round((current - st.start) / step) + dir;
      const target = Math.max(st.start, Math.min(st.end, st.start + idx * step));
      if (lenis) lenis.scrollTo(target, { duration: 0.8 });
      else window.scrollTo({ top: target, behavior: "smooth" });
    } else if (wrapper) {
      wrapper.scrollBy({ left: dir * step, behavior: "smooth" });
    }
  };

  useIsoLayoutEffect(() => {
    const reduce = prefersReducedMotion();
    const desktop = window.matchMedia("(min-width: 1024px)").matches;

    const ctx = gsap.context(() => {
      gsap.from(".ce-head", {
        opacity: 0,
        y: 24,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.1,
        scrollTrigger: { trigger: sectionRef.current, start: "top 80%" },
      });

      // Desktop: pin the section and drive the track horizontally with scroll.
      if (desktop && !reduce && trackRef.current && wrapperRef.current) {
        const track = trackRef.current;
        const distance = () => track.scrollWidth - wrapperRef.current!.clientWidth;

        const horiz = gsap.to(track, {
          x: () => -distance(),
          ease: "none",
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top top",
            end: () => "+=" + distance(),
            pin: true,
            scrub: 1,
            invalidateOnRefresh: true,
          },
        });
        stRef.current = horiz.scrollTrigger ?? null;

        // Subtle per-panel zoom-out as each crosses the viewport.
        gsap.utils.toArray<HTMLElement>(".ce-img").forEach((img) => {
          gsap.fromTo(
            img,
            { scale: 1.18 },
            {
              scale: 1,
              ease: "none",
              scrollTrigger: {
                trigger: img.parentElement,
                containerAnimation: horiz,
                start: "left right",
                end: "right left",
                scrub: true,
              },
            },
          );
        });
      }
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={sectionRef}
      id="clinic-experience"
      className="relative w-full overflow-hidden bg-cream lg:h-[100svh]"
    >
      <div className="flex h-full flex-col py-24 lg:py-0">
        {/* Header */}
        <div className="mx-auto w-full max-w-[110rem] px-6 md:px-10 lg:px-14 lg:pt-28">
          <p className="ce-head mb-6 flex items-center gap-3 text-[0.7rem] font-medium uppercase tracking-[0.32em] text-ink/50">
            <span className="h-px w-8 bg-gold" aria-hidden="true" />
            The Experience
          </p>
          <h2 className="ce-head font-serif text-[2.5rem] font-medium leading-[1.02] tracking-[-0.02em] text-ink sm:text-5xl lg:text-6xl">
            Step inside <em className="italic text-ink/90">Lumina.</em>
          </h2>
        </div>

        {/* Gallery */}
        <div className="relative mt-12 flex-1 lg:mt-14">
          <div
            ref={wrapperRef}
            className="h-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden lg:snap-none [scrollbar-width:none] motion-safe:lg:overflow-hidden [&::-webkit-scrollbar]:hidden"
          >
            <div
              ref={trackRef}
              className="flex h-full items-center gap-5 px-6 md:gap-6 md:px-10 lg:px-14"
            >
              {CLINIC_IMAGES.map((item) => (
              <figure
                key={item.number}
                className="relative aspect-[3/4] h-[58svh] w-[80vw] shrink-0 snap-center overflow-hidden rounded-2xl sm:w-[62vw] md:aspect-[4/5] lg:aspect-[3/4] lg:h-[64svh] lg:w-[40vw] xl:w-[34vw]"
              >
                <div
                  className="ce-img absolute inset-0 scale-[1.02] bg-cover bg-center"
                  style={{ backgroundImage: `url(${item.image})` }}
                >
                  <div className="absolute -left-1/4 -top-1/4 h-2/3 w-2/3 rounded-full bg-white/25 blur-3xl" />
                  <div className="absolute inset-0 bg-gradient-to-t from-ink/45 via-transparent to-transparent" />
                  <Grain opacity={0.09} />
                </div>
                <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between p-6 md:p-7">
                  <span className="text-sm font-medium uppercase tracking-[0.2em] text-cream">
                    {item.label}
                  </span>
                  <span className="font-serif text-3xl leading-none text-cream/40">
                    {item.number}
                  </span>
                </figcaption>
              </figure>
              ))}
            </div>
          </div>

          {/* Side navigation */}
          <button
            type="button"
            aria-label="Previous image"
            onClick={() => nudge(-1)}
            className="absolute left-4 top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-cream/95 text-ink shadow-[0_10px_30px_-10px_rgba(16,24,32,0.5)] backdrop-blur transition-transform duration-200 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold md:left-6 md:h-12 md:w-12 lg:left-10"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next image"
            onClick={() => nudge(1)}
            className="absolute right-4 top-1/2 z-20 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-cream/95 text-ink shadow-[0_10px_30px_-10px_rgba(16,24,32,0.5)] backdrop-blur transition-transform duration-200 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold md:right-6 md:h-12 md:w-12 lg:right-10"
          >
            <ArrowRight className="h-5 w-5" strokeWidth={1.5} aria-hidden="true" />
          </button>
        </div>

        {/* Hint */}
        <p className="ce-head mx-auto mt-8 w-full max-w-[110rem] px-6 text-[0.65rem] uppercase tracking-[0.28em] text-ink/40 md:px-10 lg:mb-10 lg:px-14">
          <span className="lg:hidden">Swipe to explore →</span>
          <span className="hidden lg:inline">Scroll to explore →</span>
        </p>
      </div>
    </section>
  );
}
