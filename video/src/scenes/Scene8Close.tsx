import React from "react";
import { useCurrentFrame } from "remotion";
import { clamp01 } from "../motion";
import { SceneBg, SafeArea, KineticText, useLayoutMode } from "../components/core";
import { EndCard } from "../components/endcard";

// scene duration 180f (6s)
export const Scene8Close: React.FC = () => {
  const frame = useCurrentFrame();
  const mode = useLayoutMode();
  const lineOut = 1 - clamp01(frame, 70, 90);
  const cardIn = clamp01(frame, 85, 105);

  return (
    <SceneBg>
      <SafeArea style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ position: "absolute", opacity: lineOut }}>
          <KineticText
            text="The spec is a hypothesis. Pay for the truth."
            size={mode === "landscape" ? 54 : 40}
            align="center"
            style={{ textAlign: "center", maxWidth: 900 }}
          />
        </div>
        <div style={{ opacity: cardIn, transform: `translateY(${(1 - cardIn) * 16}px)` }}>
          <EndCard start={85} />
        </div>
      </SafeArea>
    </SceneBg>
  );
};
