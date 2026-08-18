import { LanguageProvider } from "@/lib/i18n/LanguageContext";

/**
 * Arabic/English + RTL support is scoped to the admin dashboard only — the
 * public marketing site (GSAP scroll choreography, 3D hero) isn't wired up
 * for it and stays English/LTR regardless of what staff picked in /admin.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <LanguageProvider>{children}</LanguageProvider>;
}
