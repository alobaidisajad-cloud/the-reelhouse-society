import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig, spring, Easing } from "remotion";

const COLORS = {
  ink: "#0B0A08",
  parchment: "#EDE5D8",
  fog: "#6B6055",
};

export const Scene2BusterMemory: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 1. Tarkovsky pacing: Extremely slow, deliberate floating.
  const floatY = Math.sin(frame / 40) * 20;
  
  // 2. Wes Anderson symmetry: Perfectly centered, strict composition.
  // 3. David Lynch surrealism: Flickering spotlight from above.
  const flicker = interpolate(
    Math.random(), // wait, Math.random() in Remotion causes flicker but it's not pure functional.
    [0, 1],
    [0.85, 1]
  );
  // Actually, for deterministic flicker:
  const deterministicFlicker = interpolate(
    Math.sin(frame * 0.5) * Math.cos(frame * 0.3),
    [-1, 1],
    [0.7, 1]
  );

  // Rubber hose blinking
  const isBlinking = frame % 150 > 140 && frame % 150 < 145;
  const eyeScaleY = isBlinking ? 0.1 : 1;

  // Zoom towards camera at the end of the scene (starts at frame 700 of the 840 duration)
  const zoomIn = interpolate(frame, [700, 840], [1, 20], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in(Easing.exp),
  });
  
  const ghostOpacity = interpolate(frame, [0, 30], [0, 1], { extrapolateRight: "clamp" });
  
  // Ghost morphing (rubber hose wobble)
  const wobbleX = Math.sin(frame / 15) * 5;
  const wobbleY = Math.cos(frame / 20) * 5;

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.ink, opacity: ghostOpacity }}>
      {/* Symmetrical Spotlight */}
      <div style={{
        position: "absolute",
        top: "-10%",
        left: "50%",
        transform: "translateX(-50%)",
        width: "80%",
        height: "120%",
        background: "radial-gradient(ellipse at top, rgba(237,229,216,0.15), transparent 70%)",
        opacity: deterministicFlicker,
      }} />

      {/* Buster the Ghost */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div style={{ 
          transform: `translateY(${floatY}px) scale(${zoomIn})`,
          display: "flex",
          justifyContent: "center",
          alignItems: "center"
        }}>
          <svg width="400" height="500" viewBox="0 0 200 250" style={{ filter: "drop-shadow(0 20px 30px rgba(0,0,0,0.8))" }}>
            <defs>
              <filter id="blur">
                <feGaussianBlur stdDeviation="2" />
              </filter>
            </defs>
            {/* Ghost Body: A rubber hose rounded shape that trails off at the bottom */}
            <path 
              d={`M 50 100 
                 C 50 ${30 + wobbleY}, 150 ${30 - wobbleY}, 150 100 
                 C 150 180, 180 230, 100 240 
                 C 20 230, 50 180, 50 100 Z`} 
              fill={COLORS.parchment} 
            />
            {/* Ghost Eyes (Rubber Hose Style) */}
            <ellipse 
              cx="85" cy="100" 
              rx="10" ry={18 * eyeScaleY} 
              fill={COLORS.ink} 
              style={{ transform: `translateX(${wobbleX}px)` }}
            />
            <ellipse 
              cx="115" cy="100" 
              rx="10" ry={18 * eyeScaleY} 
              fill={COLORS.ink} 
              style={{ transform: `translateX(${wobbleX}px)` }}
            />
            {/* Melancholic mouth */}
            <path 
              d="M 95 130 Q 100 135 105 130" 
              stroke={COLORS.ink} 
              strokeWidth="2" 
              fill="transparent" 
              style={{ transform: `translateX(${wobbleX}px)` }}
            />
          </svg>
        </div>
      </AbsoluteFill>

      {/* Floating Dust Particles (Surreal Lynchian atmosphere) */}
      {[...Array(20)].map((_, i) => {
        const startY = (i * 47) % 1080;
        const startX = (i * 83) % 1080;
        const speed = 0.5 + (i % 3) * 0.2;
        return (
          <div key={i} style={{
            position: "absolute",
            top: startY - (frame * speed),
            left: startX + Math.sin(frame / 30 + i) * 20,
            width: 4,
            height: 4,
            backgroundColor: COLORS.parchment,
            borderRadius: "50%",
            opacity: 0.2 + Math.sin(frame / 10 + i) * 0.1,
            boxShadow: `0 0 10px ${COLORS.parchment}`
          }} />
        );
      })}
    </AbsoluteFill>
  );
};
