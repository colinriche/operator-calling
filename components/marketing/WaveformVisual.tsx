"use client";

import { motion } from "framer-motion";

export function WaveformVisual() {
  const bars = Array.from({ length: 28 }, (_, i) => i);

  return (
    <div className="flex items-center justify-center gap-[3px] h-16">
      {bars.map((i) => (
        <motion.div
          key={i}
          className="w-1 rounded-full bg-primary"
          animate={{
            height: ["12px", `${20 + Math.random() * 32}px`, "12px"],
            opacity: [0.4, 1, 0.4],
          }}
          transition={{
            duration: 1.2 + Math.random() * 0.8,
            repeat: Infinity,
            delay: i * 0.06,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

export function PulseRing({ size = 200 }: { size?: number }) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {[1, 2, 3].map((n) => (
        <motion.div
          key={n}
          className="absolute rounded-full border-2 border-primary/30"
          animate={{ scale: [1, 1.8], opacity: [0.6, 0] }}
          transition={{
            duration: 2,
            repeat: Infinity,
            delay: n * 0.6,
            ease: "easeOut",
          }}
          style={{ width: size * 0.45, height: size * 0.45 }}
        />
      ))}
      <div
        className="relative z-10 rounded-full gradient-gold flex items-center justify-center shadow-2xl"
        style={{ width: size * 0.45, height: size * 0.45 }}
      >
        <svg
          className="text-primary-foreground"
          style={{ width: size * 0.18, height: size * 0.18 }}
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M6.62 10.79c1.44 2.83 3.76 5.15 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
        </svg>
      </div>
    </div>
  );
}
