import type { Config } from "tailwindcss";

/**
 * Design tokens from DESIGN.md ("Cognitive Engineering System"),
 * with a deliberately reduced type scale: balanced, dense, professional.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0b1326",
        surface: {
          DEFAULT: "#0b1326",
          bright: "#31394d",
          lowest: "#060e20",
          low: "#131b2e",
          mid: "#171f33",
          high: "#222a3d",
          highest: "#2d3449",
        },
        ink: {
          DEFAULT: "#dae2fd",       // on-surface
          soft: "#c4c5d9",          // on-surface-variant
          faint: "#8e90a2",         // outline
        },
        line: {
          DEFAULT: "#434656",       // outline-variant
          soft: "rgba(255,255,255,0.08)",
        },
        primary: {
          DEFAULT: "#b8c3ff",
          strong: "#2e5bff",        // Intelligence Blue (actions)
          on: "#002388",
          onstrong: "#efefff",
        },
        secondary: {
          DEFAULT: "#d0bcff",
          strong: "#571bc1",        // Cognitive Purple (spec markers)
          on: "#c4abff",
        },
        tertiary: {
          DEFAULT: "#4cd7f6",
          strong: "#00788c",
          on: "#d7f6ff",
        },
        danger: { DEFAULT: "#ffb4ab", strong: "#93000a" },
        success: { DEFAULT: "#34d399" },
        warning: { DEFAULT: "#fbbf24" },
      },
      fontFamily: {
        head: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        body: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-jbmono)", "ui-monospace", "monospace"],
      },
      fontSize: {
        // Reduced scale — nothing shouty.
        display: ["34px", { lineHeight: "40px", letterSpacing: "-0.02em", fontWeight: "700" }],
        h1: ["26px", { lineHeight: "32px", letterSpacing: "-0.01em", fontWeight: "600" }],
        h2: ["20px", { lineHeight: "28px", fontWeight: "600" }],
        h3: ["16px", { lineHeight: "24px", fontWeight: "600" }],
        body: ["14px", { lineHeight: "22px" }],
        sm: ["13px", { lineHeight: "20px" }],
        label: ["12px", { lineHeight: "16px", letterSpacing: "0.02em", fontWeight: "500" }],
        tag: ["10.5px", { lineHeight: "14px", letterSpacing: "0.06em", fontWeight: "500" }],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        lg: "8px",
        xl: "10px",
      },
      maxWidth: { shell: "1280px" },
      boxShadow: {
        glowblue: "0 0 18px rgba(46,91,255,0.25)",
      },
    },
  },
  plugins: [],
};

export default config;
