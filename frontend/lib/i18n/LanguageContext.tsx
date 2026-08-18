"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { translations, type Locale } from "./translations";

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  dir: "ltr" | "rtl";
  /** Looks up a dot-path key (e.g. "admin.login.title") in the active
   *  locale's dictionary, falling back to English then the key itself so a
   *  missing translation is visible/debuggable instead of crashing. Pass
   *  `vars` to fill in `{placeholder}` tokens the string contains. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** False when this came from the no-provider fallback below (e.g. Navbar/
   *  Footer rendered on /booking, which has no LanguageProvider at all) —
   *  lets shared components hide language-switching UI there instead of
   *  showing a toggle that silently does nothing. */
  isProvided: boolean;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function lookup(dict: Record<string, unknown>, key: string): string | undefined {
  let node: unknown = dict;
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

function interpolate(raw: string, vars?: Record<string, string | number>): string {
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

/**
 * Two independent instances of this exist: app/admin/layout.tsx (RTL-capable,
 * its own storage key) and app/(site)/layout.tsx (LTR-only — the marketing
 * site's GSAP scroll choreography and 3D hero aren't safe to mirror, so
 * Arabic there is translated text only). /booking renders Navbar/Footer
 * directly with neither provider mounted — see useLanguage()'s fallback.
 */
export function LanguageProvider({
  children,
  storageKey = "lumina_locale",
  enableRtl = true,
}: {
  children: ReactNode;
  storageKey?: string;
  enableRtl?: boolean;
}) {
  const [locale, setLocaleState] = useState<Locale>("en");

  // Restore the saved choice once mounted (localStorage isn't available
  // during SSR, so this intentionally runs client-side only).
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved === "en" || saved === "ar") setLocaleState(saved);
  }, [storageKey]);

  const dir: "ltr" | "rtl" = enableRtl && locale === "ar" ? "rtl" : "ltr";

  // Applied to <html> while this provider is mounted, and reset back to the
  // site's defaults on unmount so navigating away never leaves the next
  // page stuck in Arabic/RTL.
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
    return () => {
      document.documentElement.lang = "en";
      document.documentElement.dir = "ltr";
    };
  }, [locale, dir]);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    localStorage.setItem(storageKey, next);
  };

  const toggleLocale = () => setLocale(locale === "en" ? "ar" : "en");

  const t = useMemo(() => {
    return (key: string, vars?: Record<string, string | number>) => {
      const raw = lookup(translations[locale], key) ?? lookup(translations.en, key) ?? key;
      return interpolate(raw, vars);
    };
  }, [locale]);

  const value = useMemo(
    () => ({ locale, setLocale, toggleLocale, dir, t, isProvided: true }),
    [locale, dir, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/** English/LTR fallback for components rendered outside any LanguageProvider. */
const fallback: LanguageContextValue = {
  locale: "en",
  setLocale: () => {},
  toggleLocale: () => {},
  dir: "ltr",
  t: (key, vars) => interpolate(lookup(translations.en, key) ?? key, vars),
  isProvided: false,
};

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  return ctx ?? fallback;
}
