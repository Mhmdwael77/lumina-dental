import { LanguageProvider } from "@/lib/i18n/LanguageContext";

/**
 * English/Arabic toggle for the public marketing site — scoped to this
 * route group so /booking (outside it) and /admin (its own provider
 * instance) are untouched. Layout stays LTR in both languages: the GSAP
 * scroll choreography and 3D hero aren't safe to mirror.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider storageKey="lumina_site_locale" enableRtl={false}>
      {children}
    </LanguageProvider>
  );
}
