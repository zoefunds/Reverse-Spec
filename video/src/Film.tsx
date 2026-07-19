import React from "react";
import { Audio, Sequence, AbsoluteFill, staticFile } from "remotion";
import { CaptionLine } from "./components/core";
import { Scene1Hook } from "./scenes/Scene1Hook";
import { Scene2Trust } from "./scenes/Scene2Trust";
import { Scene3Reveal } from "./scenes/Scene3Reveal";
import { Scene4Flow } from "./scenes/Scene4Flow";
import { Scene5Mechanism } from "./scenes/Scene5Mechanism";
import { Scene6Proof } from "./scenes/Scene6Proof";
import { Scene7Status } from "./scenes/Scene7Status";
import { Scene8Close } from "./scenes/Scene8Close";

// Real generated voiceover durations (seconds), from Higgsfield seed_audio jobs — see VOICEOVER_SCRIPT.md.
const VO_SECONDS = [4.81, 17.84, 6.06, 13.805, 11.38, 10.96, 8.32, 3.795];
const VO_FRAMES = VO_SECONDS.map((s) => Math.round(s * 30));

// Scene duration = max(original storyboard timing, VO length + 20f tail buffer).
const ORIGINAL_DURATIONS = [135, 315, 210, 540, 540, 420, 360, 180];
const DURATIONS = ORIGINAL_DURATIONS.map((d, i) => Math.max(d, VO_FRAMES[i] + 20));

const BOUNDS: number[] = [0];
DURATIONS.forEach((d) => BOUNDS.push(BOUNDS[BOUNDS.length - 1] + d));

const VO_SRC = ["vo/s1.wav", "vo/s2.wav", "vo/s3.wav", "vo/s4.wav", "vo/s5.wav", "vo/s6.wav", "vo/s7.wav", "vo/s8.wav"];

const CAPTIONS: { text: string; highlight?: string[] }[] = [
  { text: "Every bounty starts with a spec. And sometimes the spec is wrong.", highlight: ["wrong"] },
  {
    text: "Traditional bounties pay for compliance. No server can fairly judge who solved the real problem.",
    highlight: ["compliance"],
  },
  { text: "ReverseSpec inverts the bounty. The deeper problem is the prize.", highlight: ["inverts", "prize"] },
  {
    text: "A creator escrows real GEN. Solvers respond with evidence, not just prose.",
    highlight: ["escrows", "evidence"],
  },
  {
    text: "GenLayer's AI validators fetch each artifact themselves, inside consensus.",
    highlight: ["validators", "consensus"],
  },
  { text: "A real verdict, on-chain today: 47,500 GEN paid out of the contract.", highlight: ["47,500"] },
  { text: "Live on GenLayer StudioNet — designed to become native to mainnet.", highlight: ["StudioNet", "mainnet"] },
  { text: "The spec is a hypothesis. Pay for the truth.", highlight: ["truth"] },
];

export const Film: React.FC = () => {
  const scenes = [Scene1Hook, Scene2Trust, Scene3Reveal, Scene4Flow, Scene5Mechanism, Scene6Proof, Scene7Status, Scene8Close];
  return (
    <AbsoluteFill>
      {scenes.map((SceneComp, i) => {
        const from = BOUNDS[i];
        const duration = DURATIONS[i];
        const captionDuration = Math.min(duration - 10, VO_FRAMES[i] + 30);
        return (
          <Sequence key={i} from={from} durationInFrames={duration}>
            <SceneComp />
            <Sequence from={6} durationInFrames={captionDuration}>
              <CaptionLine text={CAPTIONS[i].text} highlight={CAPTIONS[i].highlight} />
            </Sequence>
            <Audio src={staticFile(VO_SRC[i])} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

export const TOTAL_DURATION = BOUNDS[BOUNDS.length - 1];
