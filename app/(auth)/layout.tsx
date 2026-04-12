import Link from "next/link";
import { Phone } from "lucide-react";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Link href="/" className="flex items-center gap-2 font-heading font-bold text-xl text-foreground mb-10">
        <span className="w-9 h-9 rounded-full gradient-gold flex items-center justify-center">
          <Phone className="w-4 h-4 text-primary-foreground" />
        </span>
        The Operator
      </Link>
      <div className="w-full max-w-sm">
        {children}
      </div>
    </div>
  );
}
