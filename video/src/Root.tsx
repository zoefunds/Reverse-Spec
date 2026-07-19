import React from "react";
import { Composition } from "remotion";
import { Film, TOTAL_DURATION } from "./Film";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Master"
        component={Film}
        durationInFrames={TOTAL_DURATION}
        fps={30}
        width={1920}
        height={1080}
      />
      <Composition
        id="Vertical"
        component={Film}
        durationInFrames={TOTAL_DURATION}
        fps={30}
        width={1080}
        height={1920}
      />
      <Composition
        id="Square"
        component={Film}
        durationInFrames={TOTAL_DURATION}
        fps={30}
        width={1080}
        height={1080}
      />
    </>
  );
};
