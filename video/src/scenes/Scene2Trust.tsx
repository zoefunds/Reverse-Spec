import React from "react";
import { useCurrentFrame } from "remotion";
import { T } from "../theme";
import { fadeUp, clamp01 } from "../motion";
import { SceneBg, SafeArea, KineticText, useLayoutMode } from "../components/core";
import { EvidenceCard } from "../components/technical";

export const Scene2Trust: React.FC = () => {
  const frame = useCurrentFrame();
  const mode = useLayoutMode();
  const dim = clamp01(frame, 260, 300);
  const questionIn = clamp01(frame, 270, 300);

  return (
    <SceneBg>
      <SafeArea style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 56 }}>
        <KineticText
          text="compliance ≠ solved"
          start={0}
          size={mode === "landscape" ? 60 : 48}
          align="center"
          style={{ textAlign: "center" }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: mode === "landscape" ? "row" : "column",
            gap: 24,
            justifyContent: "center",
            opacity: 1 - dim * 0.75,
          }}
        >
          <EvidenceCard
            tag="WHAT WAS ASKED"
            accent={T.purple}
            start={40}
            width={mode === "landscape" ? "38%" : "100%"}
            fontSize={mode === "landscape" ? 24 : 22}
            body="Improve wallet UX. Restyle the confirmation dialog with clearer warnings."
          />
          <EvidenceCard
            tag="WHAT GOT REWARDED"
            accent={T.blue}
            start={70}
            width={mode === "landscape" ? "38%" : "100%"}
            fontSize={mode === "landscape" ? 24 : 22}
            body="Dialogs were never the problem. The solver built transaction simulation — users finally see what a signature will do."
          />
        </div>
        <div
          style={{
            textAlign: "center",
            fontSize: mode === "landscape" ? 44 : 34,
            fontWeight: 700,
            color: T.cyan,
            opacity: questionIn,
            transform: `translateY(${(1 - questionIn) * 16}px)`,
          }}
        >
          who judges the better answer?
        </div>
      </SafeArea>
    </SceneBg>
  );
};
