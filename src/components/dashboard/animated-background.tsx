"use client";

export function AnimatedBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="absolute inset-[-30%] animate-aurora opacity-60 [filter:blur(80px)]">
        <div
          className="absolute inset-0"
          style={{
            background:
              "conic-gradient(from 180deg at 50% 50%, #00E5FF 0deg, transparent 80deg, #D4AF37 160deg, transparent 240deg, #00E5FF 360deg)",
          }}
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/85 to-background" />
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.6) 1px, transparent 0)",
          backgroundSize: "24px 24px",
        }}
      />
    </div>
  );
}
