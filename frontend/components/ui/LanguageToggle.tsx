"use client";

import { Languages } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

/**
 * EN/AR toggle. Deliberately shows the *other* language's name (tap "عربي"
 * while in English to switch to Arabic) — that's the label a reader in
 * either language can act on immediately, vs. showing their current
 * language back at them.
 */
export function LanguageToggle({ className = "" }: { className?: string }) {
  const { locale, toggleLocale } = useLanguage();
  return (
    <button
      type="button"
      onClick={toggleLocale}
      title={locale === "en" ? "التبديل للعربية" : "Switch to English"}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${className}`}
    >
      <Languages className="w-3.5 h-3.5" />
      <span>{locale === "en" ? "العربية" : "English"}</span>
    </button>
  );
}
