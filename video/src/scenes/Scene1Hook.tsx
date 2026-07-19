import React from "react";
import { useCurrentFrame } from "remotion";
import { T } from "../theme";
import { clamp01 } from "../motion";
import { DATA } from "../data";
import { SceneBg, SafeArea, MonoTag, useLayoutMode } from "../components/core";

export const Scene1Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const mode = useLayoutMode();
  const typeChars = Math.floor(clamp01(frame, 4, 70) * DATA.specExcerpt.length);
  const strike = clamp01(frame, 78, 96);
  const headlineIn = clamp01(frame, 100, 118);

  return (
    <SceneBg>
      <SafeArea style={{ display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", gap: 40 }}>
        <MonoTag color={T.purpleSoft}>ORIGINAL SPEC</MonoTag>
        <div
          style={{
            position: "relative",
            fontFamily: T.fontMono,
            fontSize: mode === "landscape" ? 28 : 24,
            lineHeight: 1.6,
            color: T.inkSoft,
            maxWidth: mode === "landscape" ? "70%" : "92%",
            textAlign: "center",
          }}
        >
          {DATA.specExcerpt.slice(0, typeChars)}
          <span
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: `${strike * 100}%`,
              height: 3,
              background: T.danger,
              transform: "translate(-50%, -50%)",
            }}
          />
        </div>
        <div
          style={{
            fontSize: mode === "landscape" ? 68 : 52,
            fontWeight: 700,
            color: T.ink,
            opacity: headlineIn,
            transform: `translateY(${(1 - headlineIn) * 20}px)`,
            textAlign: "center",
          }}
        >
          The spec was wrong.
        </div>
      </SafeArea>
    </SceneBg>
  );
};
