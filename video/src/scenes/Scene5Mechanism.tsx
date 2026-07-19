import React from "react";
import { useCurrentFrame } from "remotion";
import { T } from "../theme";
import { clamp01 } from "../motion";
import { SceneBg, SafeArea, MonoTag, useLayoutMode } from "../components/core";
import { ArchitectureFlow, StateMachine, ConsensusVisual } from "../components/technical";

// scene duration 540f (18s)
export const Scene5Mechanism: React.FC = () => {
  const frame = useCurrentFrame();
  const mode = useLayoutMode();
  const consensusIn = clamp01(frame, 260, 290);

  return (
    <SceneBg>
      <SafeArea style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 46 }}>
        <MonoTag color={T.cyan} style={{ textAlign: "center" }}>
          judged inside consensus
        </MonoTag>
        <ArchitectureFlow
          vertical={mode !== "landscape"}
          fontSize={mode === "landscape" ? 24 : 19}
          start={0}
          perStep={22}
          steps={[
            { label: "submission", color: T.purpleSoft },
            { label: "contract call", color: T.blue },
            { label: "validators fetch evidence", color: T.blue },
            { label: "independent judgment", color: T.cyan },
            { label: "consensus verdict", color: T.success },
          ]}
        />
        <div style={{ opacity: consensusIn, transform: `translateY(${(1 - consensusIn) * 16}px)` }}>
          <ConsensusVisual start={260} width={mode === "landscape" ? 900 : 620} />
        </div>
        <StateMachine
          start={430}
          perState={22}
          fontSize={mode === "landscape" ? 20 : 16}
          states={["SUBMITTED", "EVIDENCE FETCHED", "VALIDATED", "RESOLVED"]}
        />
      </SafeArea>
    </SceneBg>
  );
};
