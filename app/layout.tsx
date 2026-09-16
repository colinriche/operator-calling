import type { Metadata } from "next";
import { Inter, Sora } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/shared/Providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: {
    default: "The Operator — Voice-first calling",
    template: "%s | The Operator",
  },
  description:
    "Real conversation, better timed. The Operator connects you when both of you are ready — no pressure, no missed timing.",
  openGraph: {
    title: "The Operator",
    description: "Voice-first calling. Only connects when both answer.",
    type: "website",
    // Relative: Vercel supplies the production origin as metadataBase.
    images: [
      {
        url: "/og-default.jpg",
        width: 1200,
        height: 630,
        type: "image/jpeg",
        alt: "An incoming call from The Operator",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["/og-default.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${sora.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
