import React from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { T } from "../theme";
import { clamp01, easeInOut, fadeUp } from "../motion";
import type { LayoutMode } from "../data";

export const useLayoutMode = (): LayoutMode => {
  const { width, height } = useVideoConfig();
  if (height > width) return "vertical";
  if (height === width) return "square";
  return "landscape";
};

// Root background with a very subtle brand gradient — no floating particles.
export const SceneBg: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ backgroundColor: T.bg, fontFamily: T.fontHead, color: T.ink }}>
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 90% at 15% 0%, rgba(46,91,255,0.10), transparent 55%),
                     radial-gradient(100% 80% at 100% 100%, rgba(87,27,193,0.12), transparent 55%)`,
      }}
    />
    {children}
  </AbsoluteFill>
);

// 5% title-safe padding container.
export const SafeArea: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style,
}) => (
  <AbsoluteFill style={{ padding: "5.5%", boxSizing: "border-box", ...style }}>{children}</AbsoluteFill>
);

export const MonoTag: React.FC<{ children: React.ReactNode; color?: string; style?: React.CSSProperties }> = ({
  children,
  color = T.inkFaint,
  style,
}) => (
  <div
    style={{
      fontFamily: T.fontMono,
      fontSize: 22,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color,
      ...style,
    }}
  >
    {children}
  </div>
);

export const KineticText: React.FC<{
  text: string;
  start?: number;
  size?: number;
  weight?: number;
  color?: string;
  align?: "left" | "center";
  perWord?: number;
  style?: React.CSSProperties;
}> = ({ text, start = 0, size = 72, weight = 700, color = T.ink, align = "left", perWord = 3, style }) => {
  const frame = useCurrentFrame();
  const words = text.split(" ");
  return (
    <div
      style={{
        fontSize: size,
        fontWeight: weight,
        color,
        letterSpacing: "-0.02em",
        lineHeight: 1.12,
        textAlign: align,
        ...style,
      }}
    >
      {words.map((w, i) => (
        <span key={i} style={{ display: "inline-block", whiteSpace: "pre", ...fadeUp(frame, start + i * perWord, 18) }}>
          {w}
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </div>
  );
};

// Phrase-level caption inside safe area.
export const CaptionLine: React.FC<{ text: string; highlight?: string[] }> = ({ text, highlight = [] }) => {
  const frame = useCurrentFrame();
  const mode = useLayoutMode();
  return (
    <div
      style={{
        position: "absolute",
        bottom: mode === "vertical" ? "12%" : "7%",
        left: 0,
        right: 0,
        textAlign: "center",
        ...fadeUp(frame, 0, 12),
      }}
    >
      <div
        style={{
          width: mode === "landscape" ? "62%" : "86%",
          margin: "0 auto",
          background: "rgba(6,14,32,0.72)",
          border: `1px solid ${T.lineSoft}`,
          borderRadius: 10,
          padding: "14px 26px",
          fontSize: mode === "landscape" ? 28 : 34,
          lineHeight: 1.35,
          textAlign: "center",
          color: T.inkSoft,
          fontWeight: 500,
        }}
      >
        {text.split(" ").map((w, i) => {
          const hot = highlight.some((h) => w.toLowerCase().includes(h.toLowerCase()));
          return (
            <span key={i} style={{ color: hot ? T.cyan : undefined }}>
              {w}{" "}
            </span>
          );
        })}
      </div>
    </div>
  );
};

// Browser chrome around a real screenshot, with deterministic pan/zoom.
export const BrowserFrame: React.FC<{
  src: string;
  url: string;
  // camera: from/to as {x,y,scale} in percent offsets of the image
  from?: { x: number; y: number; s: number };
  to?: { x: number; y: number; s: number };
  camStart?: number;
  camEnd?: number;
  width?: string;
  aspect?: number;
  style?: React.CSSProperties;
}> = ({ src, url, from = { x: 0, y: 0, s: 1 }, to = { x: 0, y: 0, s: 1 }, camStart = 0, camEnd = 90, width = "84%", aspect = 16 / 10, style }) => {
  const frame = useCurrentFrame();
  const t = clamp01(frame, camStart, camEnd, easeInOut);
  const x = interpolate(t, [0, 1], [from.x, to.x]);
  const y = interpolate(t, [0, 1], [from.y, to.y]);
  const s = interpolate(t, [0, 1], [from.s, to.s]);
  return (
    <div
      style={{
        width,
        borderRadius: 14,
        overflow: "hidden",
        border: `1px solid ${T.line}`,
        boxShadow: "0 30px 80px rgba(0,0,0,0.55), 0 0 40px rgba(46,91,255,0.12)",
        background: T.bgLowest,
        ...style,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 18px",
          background: T.surfaceLow,
          borderBottom: `1px solid ${T.lineSoft}`,
        }}
      >
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <div key={c} style={{ width: 12, height: 12, borderRadius: 6, background: c, opacity: 0.85 }} />
        ))}
        <div
          style={{
            marginLeft: 12,
            fontFamily: T.fontMono,
            fontSize: 17,
            color: T.inkFaint,
            background: T.bgLowest,
            borderRadius: 6,
            padding: "5px 16px",
          }}
        >
          {url}
        </div>
      </div>
      <div style={{ overflow: "hidden", position: "relative", width: "100%", aspectRatio: String(aspect) }}>
        <Img
          src={staticFile(src)}
          style={{
            width: "100%",
            display: "block",
            position: "absolute",
            top: 0,
            left: 0,
            transform: `scale(${s}) translate(${x}%, ${y}%)`,
            transformOrigin: "center top",
          }}
        />
      </div>
    </div>
  );
};

export const ClickPulse: React.FC<{ x: string; y: string; at: number }> = ({ x, y, at }) => {
  const frame = useCurrentFrame();
  const t = clamp01(frame, at, at + 14);
  if (t <= 0 || t >= 1) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: 56,
        height: 56,
        marginLeft: -28,
        marginTop: -28,
        borderRadius: "50%",
        border: `3px solid ${T.cyan}`,
        opacity: 1 - t,
        transform: `scale(${0.4 + t * 1.2})`,
      }}
    />
  );
};

export const Logo: React.FC<{ size?: number }> = ({ size = 96 }) => (
  <Img src={staticFile("logo.svg")} style={{ width: size, height: size, borderRadius: size * 0.22 }} />
);
