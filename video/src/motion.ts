import { Easing, interpolate } from "remotion";

// Shared motion system: entrance 12f (400ms), exit 9f (300ms), ease-out primary.
export const ENTER = 12;
export const EXIT = 9;
export const easeOut = Easing.out(Easing.cubic);
export const easeInOut = Easing.inOut(Easing.cubic);

export const fadeUp = (frame: number, start: number, dist = 24) => {
  const t = interpolate(frame, [start, start + ENTER], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeOut,
  });
  return { opacity: t, transform: `translateY(${(1 - t) * dist}px)` };
};

export const fadeOutAt = (frame: number, start: number) =>
  interpolate(frame, [start, start + EXIT], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: easeInOut,
  });

export const clamp01 = (frame: number, a: number, b: number, easing = easeOut) =>
  interpolate(frame, [a, b], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });
