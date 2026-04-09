import type { Metadata } from "next";
import { AnimatedSection } from "@/components/marketing/AnimatedSection";
import { Smartphone } from "lucide-react";

export const metadata: Metadata = { title: "Download the app" };

export default function DownloadPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
      <AnimatedSection className="mb-12">
        <div className="w-20 h-20 rounded-3xl gradient-gold flex items-center justify-center mx-auto mb-6 shadow-xl shadow-primary/20">
          <Smartphone className="w-10 h-10 text-primary-foreground" />
        </div>
        <h1 className="font-heading font-bold text-5xl sm:text-6xl text-foreground mb-5">
          The Operator app
        </h1>
        <p className="text-xl text-muted-foreground max-w-lg mx-auto mb-10">
          Get the full calling experience on iOS and Android. Available now.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          {/* App Store */}
          <a
            href="#"
            className="flex items-center gap-3 px-6 py-4 bg-foreground text-background rounded-2xl hover:bg-foreground/90 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
              <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
            </svg>
            <div className="text-left">
              <div className="text-xs opacity-70">Download on the</div>
              <div className="font-heading font-semibold text-base leading-tight">App Store</div>
            </div>
          </a>

          {/* Google Play */}
          <a
            href="#"
            className="flex items-center gap-3 px-6 py-4 bg-foreground text-background rounded-2xl hover:bg-foreground/90 transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-7 h-7">
              <path d="M3.18 23.76c.3.16.65.18.97.06l12.52-6.45-2.72-2.72-10.77 9.11zm-1.4-20.8A1.5 1.5 0 001.5 4v16c0 .5.26.97.68 1.23l.08.05 8.97-9.26-8.97-9.06-.08.04zM20.46 10.5l-2.62-1.45-3.06 3.06 3.06 3.06 2.64-1.46c.75-.42.75-1.79-.02-2.21zM4.15.24L16.67 6.7l-2.72 2.72L3.18.31c.3-.13.67-.12.97-.07z"/>
            </svg>
            <div className="text-left">
              <div className="text-xs opacity-70">Get it on</div>
              <div className="font-heading font-semibold text-base leading-tight">Google Play</div>
            </div>
          </a>
        </div>
      </AnimatedSection>

      <AnimatedSection delay={0.2}>
        <p className="text-sm text-muted-foreground">
          Prefer the web?{" "}
          <a href="/signup" className="text-primary underline underline-offset-4">
            Use The Operator in your browser →
          </a>
        </p>
      </AnimatedSection>
    </div>
  );
}
