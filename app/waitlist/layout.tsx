import Link from "next/link";
import { Phone } from "lucide-react";

// Deliberately outside the (public) route group: no Navbar, no marketing
// footer. Most visitors arrive here from a forum post with no idea what The
// Operator is, and the form is the only thing on the page that matters.

export default function WaitlistLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-full flex flex-col">
      <header className="border-b border-border/50">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 h-16 flex items-center">
          <span className="flex items-center gap-2 font-heading font-bold text-xl text-foreground">
            <span className="w-8 h-8 rounded-full gradient-gold flex items-center justify-center">
              <Phone className="w-4 h-4 text-primary-foreground" />
            </span>
            The Operator
          </span>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border/50 py-6">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground transition-colors">
            Privacy policy
          </Link>
          <span>© {new Date().getFullYear()} The Operator</span>
        </div>
      </footer>
    </div>
  );
}
