import { cn } from "@/lib/utils";

// Decorative only: a rounded cabin window looking out over a sunset sea of clouds.
export function CabinWindow({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("relative", className)}>
      {/* Moulded white frame */}
      <div className="glass-panel relative rounded-[2.75rem] p-4 sm:p-5">
        <div className="neon-strip-pink animate-glow-pulse absolute top-10 bottom-10 -left-1 w-1" />
        <div className="relative aspect-[4/3] overflow-hidden rounded-[2rem] bg-sky shadow-[inset_0_6px_24px_oklch(0.3_0.05_260/0.45)]">
          {/* Distant horizon haze */}
          <div className="absolute inset-x-0 top-[52%] h-10 bg-[oklch(0.92_0.06_40/0.6)] blur-xl" />
          {/* Cloud sea */}
          <div className="animate-drift absolute -inset-x-8 bottom-0 h-[45%]">
            {CLOUDS.map((c, i) => (
              <span
                key={i}
                className="absolute rounded-full blur-[2px]"
                style={{
                  left: `${c.x}%`,
                  bottom: `${c.y}%`,
                  width: `${c.s}%`,
                  aspectRatio: "2.2 / 1",
                  background:
                    "radial-gradient(closest-side, oklch(0.97 0.04 60 / 0.95), oklch(0.85 0.08 40 / 0.7) 60%, transparent)",
                }}
              />
            ))}
          </div>
          {/* Glass reflection */}
          <div className="absolute inset-0 bg-[linear-gradient(120deg,oklch(1_0_0/0.35),transparent_35%,transparent_70%,oklch(1_0_0/0.15))]" />
        </div>
      </div>
      {/* Window-seat cushion */}
      <div className="mx-8 -mt-3 h-6 rounded-b-3xl bg-gradient-to-b from-[oklch(0.9_0.05_5)] to-[oklch(0.84_0.07_5)] shadow-[0_10px_20px_-10px_oklch(0.6_0.1_5/0.6)]" />
    </div>
  );
}

const CLOUDS = [
  { x: 0, y: 30, s: 22 },
  { x: 14, y: 8, s: 30 },
  { x: 30, y: 40, s: 18 },
  { x: 40, y: 12, s: 26 },
  { x: 58, y: 34, s: 20 },
  { x: 66, y: 4, s: 30 },
  { x: 82, y: 28, s: 22 },
  { x: 92, y: 6, s: 18 },
  { x: 8, y: 55, s: 14 },
  { x: 50, y: 58, s: 12 },
  { x: 76, y: 55, s: 14 },
];
