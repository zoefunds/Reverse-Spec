import React from "react";
import { useCurrentFrame } from "remotion";
import { T } from "../theme";
import { fadeUp } from "../motion";
import { DATA } from "../data";
import { Logo, MonoTag } from "./core";

export const EndCard: React.FC<{ start?: number }> = ({ start = 0 }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
      <div style={fadeUp(frame, start)}>
        <Logo size={84} />
      </div>
      <div style={{ fontSize: 56, fontWeight: 700, color: T.ink, ...fadeUp(frame, start + 6) }}>ReverseSpec</div>
      <div style={{ fontSize: 26, color: T.inkSoft, ...fadeUp(frame, start + 12) }}>Solve the better problem.</div>
      <div style={{ display: "flex", gap: 14, marginTop: 8, ...fadeUp(frame, start + 18) }}>
        <MonoTag color={T.cyan}>LIVE ON GENLAYER STUDIONET</MonoTag>
      </div>
      <div style={{ fontFamily: T.fontMono, fontSize: 22, color: T.primary, marginTop: 10, ...fadeUp(frame, start + 24) }}>
        {DATA.url}
      </div>
    </div>
  );
};
