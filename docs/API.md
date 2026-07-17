# REST API (`/api/v1`)

Auth: `Authorization: Bearer <jwt>` where marked. Errors return
`{"detail": "..."}` with appropriate status codes. Rate limits: 120/min
default, 20/min on auth routes.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/auth/nonce` | – | `{address}` → `{nonce, message, expires_in}` |
| POST | `/auth/verify` | – | `{address, signature}` → `{token, address}` |
| GET | `/bounties` | – | `?q=&status=&category=&offset=&limit=` → `{total, items}` |
| GET | `/bounties/{id}` | – | Bounty detail (chain id) |
| GET | `/bounties/{id}/submissions` | – | Submissions incl. verdicts |
| POST | `/bounties` | JWT | Mirror a just-created on-chain bounty |
| POST | `/submissions` | JWT | Mirror a just-created on-chain submission |
| GET | `/submissions/{id}` | – | Submission detail |
| GET | `/rewards/{address}` | – | Reward ledger for address |
| GET | `/leaderboard` | – | Solvers ranked by depth score |
| GET | `/users/{address}` | – | Public profile (lazy) |
| PATCH | `/users/me` | JWT | Update display name / bio / tags |
| GET | `/healthz` | – | Liveness + dependency snapshot |
| GET | `/readyz` | – | Readiness (DB) |

Mirrors are fast-path UX only: the indexer reconciles every row against the
contract, so dishonest mirror input self-corrects and never moves value.
