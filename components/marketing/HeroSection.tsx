"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Users } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WaveformVisual, PulseRing } from "./WaveformVisual";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden min-h-[90vh] flex items-center">
      {/* Background decoration */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-20 right-[10%] w-96 h-96 rounded-full bg-primary/8 blur-3xl" />
        <div className="absolute bottom-20 left-[5%] w-72 h-72 rounded-full bg-accent/8 blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 w-full">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left — copy */}
          <div>
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/12 text-primary text-xs font-semibold tracking-wide uppercase mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                Voice-first calling
              </span>
            </motion.div>

            <motion.h1
              className="font-heading font-bold text-5xl sm:text-6xl lg:text-7xl text-foreground leading-[1.05] tracking-tight mb-6"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
            >
              Talk properly.
              <span className="block gradient-text-gold">No pressure.</span>
            </motion.h1>

            <motion.p
              className="text-lg sm:text-xl text-muted-foreground leading-relaxed mb-8 max-w-lg"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              A 5-minute call beats a hundred messages. The Operator only connects
              you when both of you answer — so there's no missed timing, no pressure,
              just real conversation.
            </motion.p>

            <motion.div
              className="flex flex-col sm:flex-row gap-4"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
            >
              <Link
                href="/signup"
                className={cn(buttonVariants({ size: "lg" }), "gradient-gold border-0 text-primary-foreground font-semibold text-base h-12 px-8 shadow-lg shadow-primary/20 hover:shadow-primary/30 hover:scale-[1.02] transition-all")}
              >
                Get started free <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
              <Link
                href="/how-it-works"
                className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-12 px-8 text-base border-border/60 font-medium")}
              >
                See how it works
              </Link>
            </motion.div>

            <motion.div
              className="flex items-center gap-3 mt-8 text-sm text-muted-foreground"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
            >
              <div className="flex -space-x-2">
                {["#F5A623", "#4A90A4", "#7B6CF6", "#E85D75"].map((color) => (
                  <div
                    key={color}
                    className="w-7 h-7 rounded-full border-2 border-background"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <span>
                <strong className="text-foreground font-semibold">2,400+</strong> calls made this week
              </span>
            </motion.div>
          </div>

          {/* Right — visual */}
          <motion.div
            className="flex flex-col items-center gap-8"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <PulseRing size={240} />
            <WaveformVisual />

            {/* Mock call card */}
            <motion.div
              className="glass rounded-2xl p-5 w-full max-w-xs shadow-xl"
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-heading font-bold text-sm">
                  JM
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Jamie M.</p>
                  <p className="text-xs text-muted-foreground">Both answered — connecting...</p>
                </div>
              </div>
              <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                <motion.div
                  className="h-full rounded-full gradient-gold"
                  animate={{ width: ["0%", "100%"] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                />
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Users className="w-3.5 h-3.5" />
                Only connects when both answer
              </div>
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
