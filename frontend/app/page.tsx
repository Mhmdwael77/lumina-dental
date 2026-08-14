import { Navbar } from "@/components/layout/Navbar";
import { Hero } from "@/components/sections/Hero";
import { BrandStatement } from "@/components/sections/BrandStatement";
import { TrustStats } from "@/components/sections/TrustStats";
import { Treatments } from "@/components/sections/Treatments";
import { FeaturedTreatment } from "@/components/sections/FeaturedTreatment";
import { BeforeAfter } from "@/components/sections/BeforeAfter";
import { Doctor } from "@/components/sections/Doctor";
import { WhyChooseUs } from "@/components/sections/WhyChooseUs";
import { ClinicExperience } from "@/components/sections/ClinicExperience";
import { Testimonials } from "@/components/sections/Testimonials";
import { PatientJourney } from "@/components/sections/PatientJourney";
import { Booking } from "@/components/sections/Booking";
import { EmergencyCTA } from "@/components/sections/EmergencyCTA";
import { Contact } from "@/components/sections/Contact";
import { FAQ } from "@/components/sections/FAQ";
import { FinalCTA } from "@/components/sections/FinalCTA";
import { Footer } from "@/components/layout/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <BrandStatement />
        <TrustStats />
        <Treatments />
        <FeaturedTreatment />
        <BeforeAfter />
        <Doctor />
        <WhyChooseUs />
        <ClinicExperience />
        <Testimonials />
        <PatientJourney />
        <Booking />
        <EmergencyCTA />
        <Contact />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}
