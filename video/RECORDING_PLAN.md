# RECORDING_PLAN

## Captured (done, automated via Playwright, clean state)
- Viewport 1600×1000 @ 2× DPR, headless Chromium, no extensions/tabs/notifications, anonymous (no wallet) state — no personal data on screen.
- Pages: landing, explorer, bounty/1 (resolved), bounty/4 (open), create, rewards, how-it-works — viewport + full-page variants.
- All motion (pans, push-ins, cursor, focus zooms) is applied deterministically in Remotion over these stills — equivalent to a tripod-locked 60 fps recording with intentional camera moves, with zero risk of loading jank.

## Not captured, and why
- **Wallet-signed transactions** (create-bounty payable tx, claim_rewards): requires the user's MetaMask with funded StudioNet keys. Per the truthfulness rule the film does NOT animate a fake wallet popup; the payout is shown as the real *resulting* chain state (verdict, 47,500 GEN paid, invariant healthy).
- If the user later records one (clean profile, demo key from `scripts/.e2e_keys_v2.json`, 60 fps, deliberate cursor, pause before click), drop it in `video/assets/recordings/` and it can replace the static claim panel in Scene 6.
