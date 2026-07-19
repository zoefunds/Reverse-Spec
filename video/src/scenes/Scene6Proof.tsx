import React from "react";
import { useCurrentFrame } from "remotion";
import { T } from "../theme";
import { clamp01 } from "../motion";
import { SceneBg, SafeArea, BrowserFrame, MonoTag, useLayoutMode } from "../components/core";
import { TransactionReceipt, MetricReveal } from "../components/technical";
import { DATA } from "../data";

// scene duration 420f (14s)
export const Scene6Proof: React.FC = () => {
  const frame = useCurrentFrame();
  const mode = useLayoutMode();
  const verdictOpacity = clamp01(frame, 0, 20);
  const receiptStart = 90;
  const receiptOpacity = clamp01(frame, receiptStart, receiptStart + 20);
  const invariantIn = clamp01(frame, 260, 290);

  return (
    <SceneBg>
      <SafeArea style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 34 }}>
        {frame < receiptStart + 10 && (
          <div
            style={{
              opacity: verdictOpacity * (1 - clamp01(frame, receiptStart, receiptStart + 15)),
              width: "100%",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <BrowserFrame
              src="screens/bounty-1.png"
              url="reverse-spec.vercel.app/bounty/1"
              from={{ x: -14, y: -32, s: 2.1 }}
              to={{ x: -14, y: -32, s: 2.25 }}
              camStart={0}
              camEnd={90}
              width={mode === "landscape" ? "50%" : "76%"}
            />
          </div>
        )}
        {frame >= receiptStart - 10 && (
          <div style={{ opacity: receiptOpacity, position: frame < receiptStart + 10 ? "absolute" : "relative" }}>
            <TransactionReceipt start={receiptStart} width={mode === "landscape" ? 640 : 520} fontSize={mode === "landscape" ? 24 : 19} />
          </div>
        )}
        <div style={{ display: "flex", gap: 60, opacity: invariantIn, transform: `translateY(${(1 - invariantIn) * 14}px)` }}>
          <MetricReveal value={DATA.totalPaidGEN} suffix=" GEN" label="paid out" start={260} size={mode === "landscape" ? 64 : 46} />
          <MetricReveal value={1} suffix="" label="invariant: healthy" start={260} size={mode === "landscape" ? 64 : 46} color={T.success} />
        </div>
      </SafeArea>
    </SceneBg>
  );
};
