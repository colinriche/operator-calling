"use client";

import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Phone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

const navLinks = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/features", label: "Features" },
  { href: "/groups", label: "Groups" },
  { href: "/use-cases", label: "Use cases" },
  { href: "/privacy", label: "Privacy" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);
  const { user, loading } = useAuth();

  return (
    <header className="sticky top-0 z-50 glass border-b border-border/50">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 font-heading font-bold text-xl text-foreground">
          <span className="w-8 h-8 rounded-full gradient-gold flex items-center justify-center">
            <Phone className="w-4 h-4 text-primary-foreground" />
          </span>
          The Operator
        </Link>

        {/* Desktop links */}
        <ul className="hidden md:flex items-center gap-6">
          {navLinks.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Desktop CTA */}
        <div className="hidden md:flex items-center gap-3">
          <ThemeToggle />
          {!loading && (
            <>
              {user ? (
                <Link href="/dashboard" className={cn(buttonVariants({ size: "sm" }))}>
                  Dashboard
                </Link>
              ) : (
                <>
                  <Link href="/login" className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                    Sign in
                  </Link>
                  <Link href="/signup" className={cn(buttonVariants({ size: "sm" }), "gradient-gold border-0 text-primary-foreground font-semibold")}>
                    Get started
                  </Link>
                </>
              )}
            </>
          )}
        </div>

        {/* Mobile toggle */}
        <div className="md:hidden flex items-center gap-1">
          <ThemeToggle />
        <button
          className="md:hidden p-2 rounded-lg hover:bg-muted transition-colors"
          onClick={() => setOpen((v) => !v)}
          aria-label="Toggle menu"
        >
          {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        </div>
      </nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="md:hidden overflow-hidden border-t border-border/50 bg-background/95 backdrop-blur"
          >
            <div className="px-4 py-4 flex flex-col gap-2">
              {navLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  className="py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {label}
                </Link>
              ))}
              <div className="pt-2 border-t border-border/50 flex flex-col gap-2">
                {!loading && (
                  <>
                    {user ? (
                      <Link href="/dashboard" onClick={() => setOpen(false)} className={cn(buttonVariants({ size: "sm" }))}>
                        Dashboard
                      </Link>
                    ) : (
                      <>
                        <Link href="/login" onClick={() => setOpen(false)} className={cn(buttonVariants({ variant: "ghost", size: "sm" }))}>
                          Sign in
                        </Link>
                        <Link href="/signup" onClick={() => setOpen(false)} className={cn(buttonVariants({ size: "sm" }), "gradient-gold border-0 text-primary-foreground font-semibold")}>
                          Get started
                        </Link>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
