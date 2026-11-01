# Compromised E2E credential response

`scripts/.e2e_keys_v2.json` previously contained private-key-shaped values in
tracked history. Treat every associated wallet as compromised, even after the
file is deleted.

Compromised addresses derived from that historical file (safe to publish):

- creator: `0x9BF478fEe6Eef26C1643A3A08a63764DF3650c7f`
- solver A: `0xaE1b1AC06EB0bc4d6Cd6098d933DBc1daF846C2F`
- solver B: `0x4496D9c663CC5Bf681dB2858f6bf1CF69E701799`

Public balance inventory and retirement completed on 2026-11-01:

| Wallet | StudioNet GEN | Base Sepolia ETH | Base Sepolia USDC |
|---|---:|---:|---:|
| creator | 0 (2,500 swept) | 0 | 0 |
| solver A | 0 (47,500 swept) | 0 | 0 |
| solver B | 0 | 0 | 0 |

Both non-zero StudioNet balances were swept to the replacement relayer wallet
`0x7401c129EDfc26E68FE19309fE461eb3Db1058Eb` and verified at zero afterward:

- creator sweep: `0xd1c067d5f45a444e753fc91e20f9e688bdcd8f1fc0f875a28081e947946adb01`
- solver A sweep: `0x3233a1b7ecd2d032a72c0e9d5fa5ed96cec77377a623ca074a793dc910c50013`

1. On a clean machine create replacement creator, solver, owner, and relayer
   wallets. Never reuse a value found in repository history.
2. Transfer owner/relayer roles to the replacements and retire the old wallets.
3. Replace Fly, Vercel, CI, and local deployment secrets; redeploy the relayer.
4. Purge the file from every branch and tag with `git filter-repo`, force-push,
   and require collaborators to re-clone. Current-tree deletion is insufficient.
5. Run a full-history secret scanner and verify the old addresses have no role,
   balance, allowance, or active secret before closing the incident.

E2E scripts accept credentials only via `E2E_<ROLE>_PRIVATE_KEY` environment
variables and must never persist generated wallet keys. The repository's
`secret-scan.yml` workflow checks complete history on every push and pull
request so a private-key-shaped value cannot silently re-enter future history.
