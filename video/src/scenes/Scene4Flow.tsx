import React from "react";
import { useCurrentFrame } from "remotion";
import { T } from "../theme";
import { clamp01 } from "../motion";
import { SceneBg, SafeArea, BrowserFrame, ClickPulse, MonoTag, useLayoutMode } from "../components/core";
import { DATA } from "../data";

// 22-40s -> local frames 0-540 (this scene rendered as its own Sequence, so frame is local)
export const Scene4Flow: React.FC = () => {
  const frame = useCurrentFrame();
  const mode = useLayoutMode();

  const seg1 = clamp01(frame, 0, 20); // explorer
  const seg2Start = 190;
  const seg2 = clamp01(frame, seg2Start, seg2Start + 20); // bounty detail
  const seg3Start = 380;
  const seg3 = clamp01(frame, seg3Start, seg3Start + 20); // payout

  const active = frame < seg2Start ? 1 : frame < seg3Start ? 2 : 3;

  return (
    <SceneBg>
      <SafeArea style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 30 }}>
        <MonoTag color={T.cyan}>
          {active === 1 ? "fund the problem" : active === 2 ? "evidence, not prose" : "how value flows"}
        </MonoTag>
        <div style={{ position: "relative", width: "100%", display: "flex", justifyContent: "center" }}>
          {active === 1 && (
            <div style={{ opacity: seg1, width: "100%", display: "flex", justifyContent: "center" }}>
              <BrowserFrame
                src="screens/explorer.png"
                url="reverse-spec.vercel.app/explorer"
                from={{ x: 0, y: 0, s: 1.02 }}
                to={{ x: 0, y: -4, s: 1.1 }}
                camStart={0}
                camEnd={190}
                width={mode === "landscape" ? "78%" : "94%"}
              />
              <ClickPulse x="50%" y="30%" at={40} />
            </div>
          )}
          {active === 2 && (
            <div style={{ opacity: seg2, width: "100%", display: "flex", justifyContent: "center" }}>
              <BrowserFrame
                src="screens/bounty-1.png"
                url="reverse-spec.vercel.app/bounty/1"
                from={{ x: 0, y: -2, s: 1.05 }}
                to={{ x: 0, y: -14, s: 1.32 }}
                camStart={seg2Start}
                camEnd={seg3Start}
                width={mode === "landscape" ? "78%" : "94%"}
              />
            </div>
          )}
          {active === 3 && (
            <div style={{ opacity: seg3, width: "100%", display: "flex", justifyContent: "center" }}>
              <BrowserFrame
                src="screens/bounty-1.png"
                url="reverse-spec.vercel.app/bounty/1"
                from={{ x: -14, y: -8, s: 1.6 }}
                to={{ x: -14, y: -8, s: 1.75 }}
                camStart={seg3Start}
                camEnd={540}
                width={mode === "landscape" ? "62%" : "88%"}
              />
            </div>
          )}
        </div>
        {active === 1 && (
          <div style={{ fontFamily: T.fontMono, fontSize: 26, color: T.ink, opacity: seg1 }}>
            escrow: {DATA.openEscrowGEN.toLocaleString("en-US")} GEN — live
          </div>
        )}
        {active === 3 && (
          <div style={{ fontFamily: T.fontMono, fontSize: 26, color: T.ink, opacity: seg3 }}>
            85% / 10% / 5% — winner · runner-up · creator
          </div>
        )}
      </SafeArea>
    </SceneBg>
  );
};
