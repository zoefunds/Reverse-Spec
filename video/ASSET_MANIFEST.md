# ASSET_MANIFEST

| Asset | Type | Path / source | Status |
|---|---|---|---|
| Landing page (2×, viewport + full) | newly captured screenshot of deployed app | `video/assets/screens/landing(-full).png` | captured |
| Explorer page | newly captured screenshot | `video/assets/screens/explorer(-full).png` | captured |
| Bounty #1 detail (resolved, verdict ring) | newly captured screenshot | `video/assets/screens/bounty-1(-full).png` | captured |
| Bounty #4 detail (open) | newly captured screenshot | `video/assets/screens/bounty-4(-full).png` | captured |
| Create page | newly captured screenshot | `video/assets/screens/create(-full).png` | captured |
| Rewards / leaderboard page | newly captured screenshot | `video/assets/screens/rewards(-full).png` | captured |
| How-it-works page | newly captured screenshot | `video/assets/screens/how-it-works(-full).png` | captured |
| Logo mark (spec-bracket SVG) | existing repository asset | `frontend/public/favicon.svg` → `video/assets/logo.svg` | copied |
| Live platform stats (escrow, payouts, invariant) | real API response, frozen for deterministic render | `video/assets/stats.json` from `https://reverse-spec-api.fly.dev/api/v1/stats` | captured |
| Real bounty texts / verdicts | real API response | baked into scene copy (truth-mapped) | captured |
| Architecture / consensus / state visuals | Remotion-generated | `video/src/components/*` | generated |
| All headlines, captions, receipt, counters | Remotion-generated (deterministic text) | `video/src/*` | generated |
| Voiceover (Sterling, male preset, Higgsfield seed_audio TTS) | generated | `video/public/vo/s1.wav`–`s8.wav`, muxed via `<Audio>` per scene in `video/src/Film.tsx` | done — 8 clips, real durations drove final scene timing (99s total, up from the 90s storyboard estimate, because scene 2's line ran 17.8s of natural speech against a 10.5s budget) |
| Music bed | not generated | — | **declined** — the audio tool is TTS-only for this project; its own instructions say to decline general music/SFX requests rather than substitute a speech model. Film ships with VO only, no bed |
| UI tick / reveal SFX | missing | — | missing (same reason as music bed) |
| Wallet-signing screen recording | missing | requires user-held keys | missing — replaced by truthful static UI, no fabricated tx animation |
| Teaser cut (20–30 s) | optional deliverable | — | deferred |

No missing evidence was replaced with fabricated visuals.
