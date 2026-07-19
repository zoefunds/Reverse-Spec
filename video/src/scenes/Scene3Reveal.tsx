import React from "react";
import { useCurrentFrame } from "remotion";
import { T } from "../theme";
import { clamp01, fadeUp } from "../motion";
import { SceneBg, SafeArea, Logo, BrowserFrame, useLayoutMode } from "../components/core";

export const Scene3Reveal: React.FC = () => {
  const frame = useCurrentFrame();
  const mode = useLayoutMode();
  const logoScale = clamp01(frame, 0, 16);
  const heroIn = clamp01(frame, 90, 130);

  return (
    <SceneBg>
      <SafeArea style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            opacity: 1 - clamp01(frame, 80, 100),
            transform: `scale(${0.7 + logoScale * 0.3})`,
            position: heroIn > 0.05 ? "absolute" : "relative",
          }}
        >
          <Logo size={mode === "landscape" ? 90 : 70} />
          <div style={{ fontSize: mode === "landscape" ? 74 : 54, fontWeight: 700, color: T.ink }}>ReverseSpec</div>
        </div>
        <div
          style={{
            opacity: heroIn,
            transform: `translateY(${(1 - heroIn) * 30}px) scale(${0.94 + heroIn * 0.06})`,
            width: "100%",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <BrowserFrame src="screens/landing.png" url="reverse-spec.vercel.app" width={mode === "landscape" ? "62%" : "84%"} aspect={16 / 9.6} />
        </div>
      </SafeArea>
    </SceneBg>
  );
};
