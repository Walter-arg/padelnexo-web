import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Stats from "@/components/Stats";
import WhySection from "@/components/WhySection";
import BeforeAfter from "@/components/BeforeAfter";
import OrganizerSection from "@/components/OrganizerSection";
import PlayerSection from "@/components/PlayerSection";
import FeatureShowcase from "@/components/FeatureShowcase";
import PaymentCenter from "@/components/PaymentCenter";
import Community from "@/components/Community";
import FAQ from "@/components/FAQ";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <main className="overflow-x-hidden">
      <Navbar />
      <Hero />
      <Stats />
      <OrganizerSection />
      <FeatureShowcase />
      <PaymentCenter />
      <WhySection />
      <BeforeAfter />
      <PlayerSection />
      <Community />
      <FAQ />
      <Footer />
    </main>
  );
}
