import { AbsoluteFill, Composition, Img, Sequence, useCurrentFrame, spring, interpolate, interpolateColors, random, staticFile } from "remotion";
import React from "react";
import "./index.css";
import { Buster } from "./Buster";

// ------------------------------------------------------------------
// NITRATE NOIR OVERLAY (Global Film Grain, Scratches, Vignette)
// ------------------------------------------------------------------
const NitrateNoirOverlay: React.FC = () => {
  const frame = useCurrentFrame();

  // Erratic projector flicker (1920s style)
  const flicker = random(frame) * 0.1 + 0.9;
  
  // Film damage (random scratches)
  const scratchX = random(frame + 100) * 100;
  const showScratch = random(frame + 200) > 0.8;

  return (
    <AbsoluteFill style={{ pointerEvents: "none", zIndex: 100 }}>
      {/* Heavy vignette */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        background: "radial-gradient(circle, transparent 40%, rgba(11, 10, 8, 0.8) 100%)",
        opacity: flicker
      }} />
      
      {/* Sepia film grain / dust simulator */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: "rgba(232, 223, 200, 0.03)", // subtle bone grain
        mixBlendMode: "overlay",
        opacity: Math.random()
      }} />

      {/* Random film scratch line */}
      {showScratch && (
        <div style={{
          position: "absolute",
          top: 0, bottom: 0,
          left: `${scratchX}%`,
          width: 2,
          backgroundColor: "rgba(255,255,255,0.2)",
          mixBlendMode: "overlay"
        }} />
      )}

      {/* Aged Borders */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0, bottom: 0,
        border: "12px solid #0B0A08", // ink
        borderRadius: "24px",
      }} />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------
// SCENE: THE CONTINUOUS LONG TAKE
// ------------------------------------------------------------------
const TheUnbrokenMemory: React.FC = () => {
  const frame = useCurrentFrame();
  
  // THE CONTINUOUS PUSH (Tarkovsky)
  // Scale from 1 to 5 over 24 seconds (720 frames)
  const cameraScale = interpolate(frame, [0, 720], [1, 5], {
    extrapolateRight: "clamp"
  });

  // METAPHOR: NITRATE ROT (Decay of the scene)
  // Background shifts from warm Sepia to cold Ink
  const bgColor = interpolateColors(
    frame,
    [0, 240, 480],
    ["#3b2f21", "#1a1612", "#0B0A08"] // Warm dark sepia -> cold ink
  );

  // The Founders fading away
  const foundersOpacity = interpolate(frame, [240, 480], [0.6, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  // Buster's state
  const busterMood = frame < 300 ? "smiling" : frame < 600 ? "crying" : "neutral";
  
  // Splicing: Glowing Code Elements (16s - 24s) -> Frames 480 - 720
  const codeOpacity = interpolate(frame, [480, 540], [0, 1], { extrapolateRight: "clamp" });
  
  // Lens Reveal Flash (24s) -> Frame 720
  const flashOpacity = interpolate(frame, [700, 720, 740], [0, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ backgroundColor: bgColor }}>
      
      {/* 
        THE SCENE (Wrapped in the continuous camera push)
      */}
      <AbsoluteFill 
        style={{
          transform: `scale(${cameraScale})`,
          transformOrigin: "center center",
          justifyContent: "center",
          alignItems: "center"
        }}
      >
        {/* The 6 Founders (abstract blurry shapes) */}
        <div style={{ opacity: foundersOpacity, position: "absolute", width: "100%", height: "100%", display: "flex", justifyContent: "space-around", alignItems: "center" }}>
          <div style={{ width: 80, height: 180, background: "#1C1710", filter: "blur(20px)", transform: "translateY(-40px)" }} />
          <div style={{ width: 100, height: 200, background: "#1C1710", filter: "blur(20px)" }} />
          <div style={{ width: 80, height: 160, background: "#1C1710", filter: "blur(20px)", transform: "translateY(30px)" }} />
        </div>

        {/* The Centerpiece: Buster */}
        <div style={{ position: "absolute" }}>
          <Buster size={180} mood={busterMood} />
        </div>

        {/* The Splicing (Glowing Code) */}
        {frame > 480 && frame < 720 && (
          <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", opacity: codeOpacity }}>
            <div style={{
              fontFamily: "'Courier Prime', monospace",
              color: "#F2E8A0", // flicker glow
              fontSize: "12px",
              textShadow: "0 0 10px #F2E8A0",
              animation: "spin 10s linear infinite",
              transform: `rotate(${frame}deg) translateY(100px)`
            }}>
              {"<Infiltrate The Lounge />".repeat(3)}
            </div>
          </AbsoluteFill>
        )}

      </AbsoluteFill>

      {/* BLINDING FLASH (Projector Lens) */}
      <AbsoluteFill style={{ backgroundColor: "#F8F0C0", opacity: flashOpacity, zIndex: 50 }} />

      {/* SCENE 4: THE APP REVEAL (Frame 720 - 900) */}
      {frame >= 720 && (
        <AbsoluteFill style={{ zIndex: 60, justifyContent: "center", alignItems: "center", backgroundColor: "#0B0A08" }}>
          <Img src={staticFile("reelhouse-native-post-slide-5.png")} style={{ height: "100%", objectFit: "contain" }} />
          
          <div style={{
            position: "absolute",
            bottom: "10%",
            fontFamily: "'Rye', cursive",
            fontSize: "40px",
            color: "#E8DFC8", // bone
            textShadow: "2px 2px 0px #0A0703",
            opacity: interpolate(frame, [740, 760], [0, 1], { extrapolateLeft: "clamp" })
          }}>
            THE SOCIETY REBORN
          </div>
        </AbsoluteFill>
      )}

      <NitrateNoirOverlay />
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------
// MAIN ROOT
// ------------------------------------------------------------------
export const MyComposition: React.FC = () => {
  return (
    <>
      <Composition
        id="TheUnbrokenMemory"
        component={TheUnbrokenMemory}
        durationInFrames={900} // 30 seconds
        fps={30}
        width={1080}
        height={1080}
      />
    </>
  );
};
