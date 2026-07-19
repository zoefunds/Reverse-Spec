import React from "react";
import { useCurrentFrame } from "remotion";
import { T } from "../theme";
import { clamp01 } from "../motion";
import { SceneBg, SafeArea, BrowserFrame, MonoTag, useLayoutMode } from "../components/core";
import { ArchitectureFlow } from "../components/technical";
import { DATA } from "../data";

// scene duration 360f (12s)
export const Scene7Status: React.FC = () => {
  const frame = useCurrentFrame();
  const mode = useLayoutMode();
  const pullBack = clamp01(frame, 0, 60);

  return (
    <SceneBg>
      <SafeArea style={{ display: "flex", flexDirection: mode === "landscape" ? "row" : "column", alignItems: "center", justifyContent: "center", gap: 50 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 26, flex: 1 }}>
          <MonoTag color={T.cyan}>live on genlayer studionet</MonoTag>
          <ArchitectureFlow
            vertical
            fontSize={mode === "landscape" ? 22 : 18}
            start={10}
            perStep={18}
            steps={[
              { label: "Frontend — Vercel", color: T.blue },
              { label: "Backend — Fly.io (24/7)", color: T.blue },
              { label: `Contract — ${DATA.contractAddress}`, color: T.success },
            ]}
          />
          <div style={{ fontFamily: T.fontMono, fontSize: mode === "landscape" ? 20 : 16, color: T.inkFaint, opacity: clamp01(frame, 120, 150) }}>
            designed to become native to mainnet
          </div>
        </div>
        <div style={{ flex: 1, opacity: pullBack, transform: `scale(${0.9 + pullBack * 0.1})` }}>
          <BrowserFrame src="screens/rewards.png" url="reverse-spec.vercel.app/rewards" width="100%" />
        </div>
      </SafeArea>
    </SceneBg>
  );
};
