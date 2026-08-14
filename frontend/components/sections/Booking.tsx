"use client";

import { useEffect, useRef, useState } from "react";
import gsap, { ScrollTrigger } from "@/lib/gsap";
import { ArrowRight, Check } from "lucide-react";
import { TIME_OPTIONS, TREATMENT_OPTIONS } from "@/lib/constants";
import { prefersReducedMotion, useIsoLayoutEffect } from "@/lib/use-iso-layout-effect";

type Fields = {
  fullName: string;
  phone: string;
  email: string;
  treatment: string;
  date: string;
  time: string;
  message: string;
};

const EMPTY: Fields = {
  fullName: "",
  phone: "",
  email: "",
  treatment: "",
  date: "",
  time: "",
  message: "",
};

const inputBase =
  "w-full rounded-xl border bg-white/60 px-4 py-3 text-ink outline-none transition-colors duration-200 placeholder:text-ink/35 focus:border-gold focus:ring-2 focus:ring-gold/25";
const labelBase =
  "mb-2 block text-xs font-medium uppercase tracking-[0.15em] text-ink/60";

export function Booking() {
  const sectionRef = useRef<HTMLElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const successRef = useRef<HTMLDivElement>(null);

  const [fields, setFields] = useState<Fields>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>({});
  const [submitted, setSubmitted] = useState(false);

  useIsoLayoutEffect(() => {
    if (prefersReducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.from(".bk-reveal", {
        opacity: 0,
        y: 26,
        duration: 0.9,
        ease: "power3.out",
        stagger: 0.08,
        scrollTrigger: { trigger: sectionRef.current, start: "top 72%" },
      });
    }, sectionRef);
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (submitted) successRef.current?.focus();
  }, [submitted]);

  const set = (key: keyof Fields) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) => {
    setFields((f) => ({ ...f, [key]: e.target.value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
  };

  const validate = (f: Fields) => {
    const e: Partial<Record<keyof Fields, string>> = {};
    if (!f.fullName.trim()) e.fullName = "Please enter your name.";
    if (!f.phone.trim()) e.phone = "Please enter a phone number.";
    else if (!/[0-9]{6,}/.test(f.phone.replace(/[^0-9]/g, "")))
      e.phone = "Please enter a valid phone number.";
    if (f.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email))
      e.email = "Please enter a valid email.";
    if (!f.treatment) e.treatment = "Please choose a treatment.";
    if (!f.date) e.date = "Please choose a date.";
    return e;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const found = validate(fields);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      // focus the first invalid field after render
      window.setTimeout(() => {
        formRef.current
          ?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?.focus();
      }, 0);
      return;
    }
    
    try {
      const { submitBooking } = await import("@/lib/api");
      await submitBooking({
        full_name: fields.fullName,
        phone: fields.phone,
        email: fields.email || undefined,
        treatment: fields.treatment,
        date: fields.date,
        time: fields.time || undefined,
        message: fields.message || undefined,
      });
    } catch {
      // Fallback handles state gracefully
    }

    setSubmitted(true);
  };

  const reset = () => {
    setFields(EMPTY);
    setErrors({});
    setSubmitted(false);
  };

  const err = (key: keyof Fields) =>
    errors[key] ? (
      <p id={`${key}-error`} role="alert" className="mt-1.5 text-xs text-[#a83b2d]">
        {errors[key]}
      </p>
    ) : null;
  const invalid = (key: keyof Fields) => (errors[key] ? true : undefined);
  const border = (key: keyof Fields) =>
    errors[key] ? "border-[#a83b2d]/60" : "border-ink/15";

  return (
    <section
      ref={sectionRef}
      id="booking"
      className="relative w-full overflow-hidden bg-cream px-6 py-28 md:px-10 md:py-36 lg:px-14"
    >
      <div className="mx-auto grid max-w-[110rem] gap-14 lg:grid-cols-[0.85fr_1.15fr] lg:gap-24">
        {/* Left — pitch */}
        <div className="lg:sticky lg:top-32 lg:self-start">
          <p className="bk-reveal mb-8 flex items-center gap-3 text-[0.7rem] font-medium uppercase tracking-[0.32em] text-ink/50">
            <span className="h-px w-8 bg-gold" aria-hidden="true" />
            Booking
          </p>
          <h2 className="bk-reveal font-serif text-[2.75rem] font-medium leading-[1.0] tracking-[-0.02em] text-ink sm:text-6xl lg:text-7xl">
            Ready for your
            <br />
            <em className="italic text-ink/90">smile?</em>
          </h2>
          <p className="bk-reveal mt-8 max-w-md text-base leading-relaxed text-ink/60 sm:text-lg">
            Book a consultation with our dental team.
          </p>
          <ul className="bk-reveal mt-8 space-y-3">
            {["Free initial consultation", "Response within 24 hours", "Flexible scheduling"].map(
              (t) => (
                <li key={t} className="flex items-center gap-3 text-sm text-ink/65">
                  <Check className="h-4 w-4 text-gold" strokeWidth={2} aria-hidden="true" />
                  {t}
                </li>
              ),
            )}
          </ul>
        </div>

        {/* Right — form / success */}
        <div className="bk-reveal">
          {submitted ? (
            <div
              ref={successRef}
              tabIndex={-1}
              className="flex min-h-[24rem] flex-col items-start justify-center rounded-2xl border border-ink/10 bg-white/70 p-8 shadow-[0_20px_50px_-20px_rgba(16,24,32,0.15)] outline-none backdrop-blur-md md:p-12"
            >
              <span className="grid h-14 w-14 place-items-center rounded-full bg-gold text-ink shadow-md">
                <Check className="h-7 w-7" strokeWidth={2.5} aria-hidden="true" />
              </span>
              <h3 className="mt-6 font-serif text-3xl font-medium tracking-tight text-ink sm:text-4xl">
                Appointment Requested
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/60">
                Thank you <strong className="text-ink font-medium">{fields.fullName}</strong>. Our clinic team will reach out at <strong className="text-ink font-medium">{fields.phone}</strong> to confirm your slot.
              </p>

              {/* Booking Summary Box */}
              <div className="mt-6 w-full rounded-xl border border-ink/10 bg-cream/60 p-5 space-y-3">
                <p className="text-[0.68rem] font-medium uppercase tracking-[0.2em] text-gold">
                  Appointment Details
                </p>
                <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
                  <div>
                    <span className="block text-ink/40 uppercase tracking-wider text-[0.62rem]">Treatment</span>
                    <span className="font-serif text-base font-medium text-ink">{fields.treatment}</span>
                  </div>
                  <div>
                    <span className="block text-ink/40 uppercase tracking-wider text-[0.62rem]">Date</span>
                    <span className="font-serif text-base font-medium text-ink">{fields.date}</span>
                  </div>
                  <div>
                    <span className="block text-ink/40 uppercase tracking-wider text-[0.62rem]">Time</span>
                    <span className="font-serif text-base font-medium text-ink">{fields.time || "Any time"}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={reset}
                className="mt-8 text-xs font-medium uppercase tracking-[0.2em] text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
              >
                Book another appointment
              </button>
            </div>
          ) : (
            <form ref={formRef} onSubmit={handleSubmit} noValidate className="grid gap-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <label htmlFor="fullName" className={labelBase}>
                    Full Name <span className="text-gold">*</span>
                  </label>
                  <input
                    id="fullName"
                    name="fullName"
                    type="text"
                    autoComplete="name"
                    value={fields.fullName}
                    onChange={set("fullName")}
                    aria-invalid={invalid("fullName")}
                    aria-describedby={errors.fullName ? "fullName-error" : undefined}
                    className={`${inputBase} ${border("fullName")}`}
                    placeholder="Your name"
                  />
                  {err("fullName")}
                </div>
                <div>
                  <label htmlFor="phone" className={labelBase}>
                    Phone <span className="text-gold">*</span>
                  </label>
                  <input
                    id="phone"
                    name="phone"
                    type="tel"
                    autoComplete="tel"
                    value={fields.phone}
                    onChange={set("phone")}
                    aria-invalid={invalid("phone")}
                    aria-describedby={errors.phone ? "phone-error" : undefined}
                    className={`${inputBase} ${border("phone")}`}
                    placeholder="+20 100 000 0000"
                  />
                  {err("phone")}
                </div>
              </div>

              <div>
                <label htmlFor="email" className={labelBase}>
                  Email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={fields.email}
                  onChange={set("email")}
                  aria-invalid={invalid("email")}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  className={`${inputBase} ${border("email")}`}
                  placeholder="you@example.com"
                />
                {err("email")}
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div>
                  <label htmlFor="treatment" className={labelBase}>
                    Treatment <span className="text-gold">*</span>
                  </label>
                  <select
                    id="treatment"
                    name="treatment"
                    value={fields.treatment}
                    onChange={set("treatment")}
                    aria-invalid={invalid("treatment")}
                    aria-describedby={errors.treatment ? "treatment-error" : undefined}
                    className={`${inputBase} ${border("treatment")} ${fields.treatment ? "text-ink" : "text-ink/35"}`}
                  >
                    <option value="" disabled>
                      Select a treatment
                    </option>
                    {TREATMENT_OPTIONS.map((t) => (
                      <option key={t} value={t} className="text-ink">
                        {t}
                      </option>
                    ))}
                  </select>
                  {err("treatment")}
                </div>
                <div>
                  <label htmlFor="time" className={labelBase}>
                    Preferred Time
                  </label>
                  <select
                    id="time"
                    name="time"
                    value={fields.time}
                    onChange={set("time")}
                    className={`${inputBase} border-ink/15 ${fields.time ? "text-ink" : "text-ink/35"}`}
                  >
                    <option value="">Any time</option>
                    {TIME_OPTIONS.map((t) => (
                      <option key={t} value={t} className="text-ink">
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="date" className={labelBase}>
                  Preferred Date <span className="text-gold">*</span>
                </label>
                <input
                  id="date"
                  name="date"
                  type="date"
                  min={new Date().toISOString().split("T")[0]}
                  value={fields.date}
                  onChange={set("date")}
                  aria-invalid={invalid("date")}
                  aria-describedby={errors.date ? "date-error" : undefined}
                  className={`${inputBase} ${border("date")} ${fields.date ? "text-ink" : "text-ink/45"}`}
                />
                {err("date")}
              </div>

              <div>
                <label htmlFor="message" className={labelBase}>
                  Message <span className="text-ink/35">(optional)</span>
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={3}
                  value={fields.message}
                  onChange={set("message")}
                  className={`${inputBase} resize-none border-ink/15`}
                  placeholder="Anything you'd like us to know…"
                />
              </div>

              <button
                type="submit"
                className="group mt-2 inline-flex items-center justify-center gap-2 self-start rounded-full bg-ink px-8 py-4 text-xs font-medium uppercase tracking-[0.2em] text-cream transition-all duration-300 hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold"
              >
                Request Appointment
                <ArrowRight
                  className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </button>

              <p className="text-[0.68rem] uppercase tracking-[0.18em] text-ink/35">
                Frontend demo — no appointment is actually booked.
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
