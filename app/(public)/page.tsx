import { HeroSection } from "@/components/marketing/HeroSection";
import { FeatureSections, WhyCallingSection, HowConnectingWorksSection } from "@/components/marketing/FeatureSections";
import { GroupsSection, TestimonialsSection, FinalCTASection } from "@/components/marketing/GroupsSection";

export default function HomePage() {
  return (
    <>
      <HeroSection />
      <WhyCallingSection />
      <HowConnectingWorksSection />
      <FeatureSections />
      <GroupsSection />
      <TestimonialsSection />
      <FinalCTASection />
    </>
  );
}
