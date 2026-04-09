import Link from "next/link";
import { Phone } from "lucide-react";

const footerLinks = {
  Product: [
    { href: "/how-it-works", label: "How it works" },
    { href: "/features", label: "Features" },
    { href: "/groups", label: "Groups" },
    { href: "/use-cases", label: "Use cases" },
    { href: "/download", label: "Download app" },
  ],
  Company: [
    { href: "/privacy", label: "Privacy & safety" },
    { href: "/faq", label: "FAQ" },
    { href: "/faq#contact", label: "Contact" },
  ],
  Account: [
    { href: "/login", label: "Sign in" },
    { href: "/signup", label: "Get started" },
  ],
};

export function Footer() {
  return (
    <footer className="bg-foreground text-background/80 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-12">
          {/* Brand */}
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-2 font-heading font-bold text-xl text-background mb-4">
              <span className="w-8 h-8 rounded-full gradient-gold flex items-center justify-center">
                <Phone className="w-4 h-4 text-primary-foreground" />
              </span>
              The Operator
            </Link>
            <p className="text-sm leading-relaxed max-w-xs">
              Voice-first calling. A 5-minute call beats a hundred messages.
              Only connects when both of you answer.
            </p>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([section, links]) => (
            <div key={section}>
              <h3 className="text-background font-heading font-semibold text-sm mb-4">{section}</h3>
              <ul className="space-y-2">
                {links.map(({ href, label }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="text-sm hover:text-background transition-colors"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-background/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-background/50">
          <p>© {new Date().getFullYear()} The Operator. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-background/80 transition-colors">Privacy</Link>
            <Link href="/faq#terms" className="hover:text-background/80 transition-colors">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
