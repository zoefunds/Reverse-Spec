import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { T } from "../theme";
import { clamp01, easeInOut, fadeUp } from "../motion";
import { DATA } from "../data";
import { MonoTag } from "./core";

export const EvidenceCard: React.FC<{
  tag: string;
  tagColor?: string;
  body: string;
  start?: number;
  accent?: string;
  width?: string;
  fontSize?: number;
}> = ({ tag, tagColor = T.inkFaint, body, start = 0, accent = T.purple, width = "44%", fontSize = 26 }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        width,
        background: T.surfaceLow,
        borderLeft: `4px solid ${accent}`,
        border: `1px solid ${T.lineSoft}`,
        borderLeftWidth: 4,
        borderLeftColor: accent,
        borderRadius: 10,
        padding: "28px 32px",
        ...fadeUp(frame, start),
      }}
    >
      <MonoTag color={tagColor} style={{ marginBottom: 14, fontSize: 18 }}>
        {tag}
      </MonoTag>
      <div style={{ fontSize, lineHeight: 1.5, color: T.inkSoft }}>{body}</div>
    </div>
  );
};

// Animated causal path: nodes appear only when the travelling line reaches them.
export const ArchitectureFlow: React.FC<{
  steps: { label: string; sub?: string; color?: string }[];
  start?: number;
  perStep?: number;
  vertical?: boolean;
  fontSize?: number;
}> = ({ steps, start = 0, perStep = 26, vertical = false, fontSize = 26 }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: vertical ? "column" : "row",
        alignItems: vertical ? "stretch" : "center",
        gap: 0,
        width: "100%",
        justifyContent: "center",
      }}
    >
      {steps.map((s, i) => {
        const nodeAt = start + i * perStep;
        const lineT = clamp01(frame, nodeAt - perStep * 0.7, nodeAt, easeInOut);
        const active = frame >= nodeAt;
        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <div
                style={
                  vertical
                    ? { width: 3, height: 44, margin: "6px auto", background: T.line, position: "relative", overflow: "hidden" }
                    : { height: 3, flex: "0 0 64px", background: T.line, position: "relative", overflow: "hidden" }
                }
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: `linear-gradient(${vertical ? "180deg" : "90deg"}, ${T.blue}, ${T.cyan})`,
                    transform: vertical ? `scaleY(${lineT})` : `scaleX(${lineT})`,
                    transformOrigin: vertical ? "top" : "left",
                  }}
                />
              </div>
            )}
            <div
              style={{
                background: active ? T.surfaceMid : T.surfaceLow,
                border: `1.5px solid ${active ? s.color ?? T.blue : T.lineSoft}`,
                boxShadow: active ? `0 0 24px ${(s.color ?? T.blue) + "44"}` : "none",
                borderRadius: 10,
                padding: "20px 26px",
                textAlign: "center",
                opacity: active ? 1 : 0.35,
                transform: `scale(${active ? 1 : 0.96})`,
                minWidth: vertical ? undefined : 150,
              }}
            >
              <div style={{ fontSize, fontWeight: 600, color: T.ink }}>{s.label}</div>
              {s.sub && (
                <div style={{ fontFamily: T.fontMono, fontSize: fontSize * 0.62, color: T.inkFaint, marginTop: 8 }}>{s.sub}</div>
              )}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

// Validator dots converge on a verdict chip.
export const ConsensusVisual: React.FC<{ start?: number; width?: number }> = ({ start = 0, width = 900 }) => {
  const frame = useCurrentFrame();
  const n = 5;
  const converge = clamp01(frame, start + 30, start + 70, easeInOut);
  const verdictIn = clamp01(frame, start + 72, start + 86);
  return (
    <div style={{ position: "relative", width, height: 300, margin: "0 auto" }}>
      {Array.from({ length: n }).map((_, i) => {
        const x0 = (i / (n - 1)) * (width - 60);
        const xC = width / 2 - 30;
        const x = interpolate(converge, [0, 1], [x0, xC]);
        const y0 = 30 + (i % 2) * 40;
        const y = interpolate(converge, [0, 1], [y0, 90]);
        const thinking = clamp01(frame, start + i * 5, start + i * 5 + 10);
        return (
          <div key={i} style={{ position: "absolute", left: x, top: y, opacity: thinking }}>
            <div
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                background: T.surfaceMid,
                border: `2px solid ${converge > 0.9 ? T.success : T.purpleSoft}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: T.fontMono,
                fontSize: 20,
                color: T.purpleSoft,
              }}
            >
              V{i + 1}
            </div>
          </div>
        );
      })}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 200,
          transform: `translateX(-50%) translateY(${(1 - verdictIn) * 20}px)`,
          opacity: verdictIn,
          background: "rgba(52,211,153,0.12)",
          border: `1.5px solid ${T.success}`,
          borderRadius: 10,
          padding: "16px 34px",
          fontFamily: T.fontMono,
          fontSize: 27,
          color: T.success,
          whiteSpace: "nowrap",
        }}
      >
        VERDICT: {DATA.verdictTier} · depth {DATA.verdictDepth}
      </div>
    </div>
  );
};

export const StateMachine: React.FC<{ states: string[]; start?: number; perState?: number; fontSize?: number }> = ({
  states,
  start = 0,
  perState = 24,
  fontSize = 22,
}) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", gap: 18, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
      {states.map((s, i) => {
        const at = start + i * perState;
        const active = frame >= at;
        const isCurrent = active && (i === states.length - 1 || frame < start + (i + 1) * perState);
        return (
          <React.Fragment key={s}>
            {i > 0 && <div style={{ color: T.inkFaint, fontSize, opacity: active ? 1 : 0.3 }}>→</div>}
            <div
              style={{
                fontFamily: T.fontMono,
                fontSize,
                letterSpacing: "0.08em",
                padding: "10px 20px",
                borderRadius: 8,
                border: `1.5px solid ${isCurrent ? T.cyan : active ? T.success : T.lineSoft}`,
                color: isCurrent ? T.cyan : active ? T.success : T.inkFaint,
                background: active ? T.surfaceLow : "transparent",
                opacity: active ? 1 : 0.4,
                boxShadow: isCurrent ? `0 0 18px rgba(76,215,246,0.25)` : "none",
              }}
            >
              {s}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};

export const MetricReveal: React.FC<{
  value: number;
  suffix?: string;
  label: string;
  start?: number;
  size?: number;
  color?: string;
}> = ({ value, suffix = "", label, start = 0, size = 96, color = T.cyan }) => {
  const frame = useCurrentFrame();
  const t = clamp01(frame, start, start + 30);
  const v = Math.round(value * t);
  return (
    <div style={{ textAlign: "center", ...fadeUp(frame, start) }}>
      <div style={{ fontSize: size, fontWeight: 700, color, letterSpacing: "-0.02em", fontVariantNumeric: "tabular-nums" }}>
        {v.toLocaleString("en-US")}
        {suffix}
      </div>
      <MonoTag style={{ marginTop: 10, fontSize: size * 0.2 }}>{label}</MonoTag>
    </div>
  );
};

export const TransactionReceipt: React.FC<{ start?: number; width?: number; fontSize?: number }> = ({
  start = 0,
  width = 620,
  fontSize = 25,
}) => {
  const frame = useCurrentFrame();
  const rows = [
    ["Bounty #1", "RESOLVED", T.success],
    ["Verdict", `${DATA.verdictTier} · composite ${DATA.verdictComposite}`, T.ink],
    ["Winner (85%)", "42,500 GEN", T.cyan],
    ["Runner-up (10%)", "5,000 GEN", T.ink],
    ["Creator reserve (5%)", "2,500 GEN", T.ink],
    ["claim_rewards", "native transfer ✓ claimed", T.success],
    ["Invariant", "healthy — balance = escrow + unclaimed", T.success],
  ] as const;
  return (
    <div
      style={{
        width,
        background: T.bgLowest,
        border: `1px solid ${T.line}`,
        borderRadius: 12,
        padding: "26px 30px",
        fontFamily: T.fontMono,
        ...fadeUp(frame, start),
      }}
    >
      <MonoTag color={T.cyan} style={{ marginBottom: 18, fontSize: 17 }}>
        ON-CHAIN RECEIPT · GENLAYER STUDIONET · {DATA.contractAddress}
      </MonoTag>
      {rows.map(([k, v, c], i) => (
        <div
          key={k}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 24,
            padding: "10px 0",
            borderBottom: i < rows.length - 1 ? `1px solid ${T.lineSoft}` : "none",
            fontSize,
            ...fadeUp(frame, start + 8 + i * 7, 10),
          }}
        >
          <span style={{ color: T.inkFaint }}>{k}</span>
          <span style={{ color: c, textAlign: "right" }}>{v}</span>
        </div>
      ))}
    </div>
  );
};
