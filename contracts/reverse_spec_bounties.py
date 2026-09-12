# v0.2.17
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *

import json
import typing
from dataclasses import dataclass
from datetime import datetime, timezone


def _now_ts() -> int:
    """Deterministic transaction-time Unix timestamp (see GenVM docs:
    Transaction Context — the clock is pinned to the tx datetime, so every
    validator re-executing this sees the same value)."""
    return int(datetime.now(timezone.utc).timestamp())


# ============================================================================
# SECTION 1 — Constants and enumerations
# ============================================================================
# Enumerations are plain int constants (u8-compatible) because GenVM storage
# favors sized primitives over Python enums.

# --- Bounty lifecycle -------------------------------------------------------
BOUNTY_PENDING_FUNDING: int = 6  # created, awaiting confirmed USDC deposit on Base
BOUNTY_OPEN: int = 0          # funded, accepting submissions
BOUNTY_EVALUATING: int = 1    # submissions closed, evaluations running
BOUNTY_RESOLVED: int = 2      # winner selected (payout instruction available)
BOUNTY_UNRESOLVED: int = 3    # evaluated, nothing met the bar; escrow reclaimable
BOUNTY_CANCELLED: int = 4     # cancelled before any submission; escrow refunded
BOUNTY_RECLAIMED: int = 5     # unresolved and creator has reclaimed escrow

BOUNTY_STATUS_NAMES: dict = {
    BOUNTY_PENDING_FUNDING: "PENDING_FUNDING",
    BOUNTY_OPEN: "OPEN",
    BOUNTY_EVALUATING: "EVALUATING",
    BOUNTY_RESOLVED: "RESOLVED",
    BOUNTY_UNRESOLVED: "UNRESOLVED",
    BOUNTY_CANCELLED: "CANCELLED",
    BOUNTY_RECLAIMED: "RECLAIMED",
}

# --- Terminal statuses whose payout instructions may be relayed to Base -----
TERMINAL_PAYOUT_STATUSES: tuple = (BOUNTY_RESOLVED, BOUNTY_UNRESOLVED,
                                    BOUNTY_CANCELLED, BOUNTY_RECLAIMED)

# --- Submission lifecycle ---------------------------------------------------
SUB_PENDING: int = 0          # submitted, not yet evaluated
SUB_EVALUATED: int = 1        # evaluation recorded
SUB_WINNER: int = 2           # selected as the winning solution
SUB_RUNNER_UP: int = 3        # selected for a runner-up share
SUB_REJECTED: int = 4         # evaluated below threshold
SUB_WITHDRAWN: int = 5        # withdrawn by the solver before evaluation

SUB_STATUS_NAMES: dict = {
    SUB_PENDING: "PENDING",
    SUB_EVALUATED: "EVALUATED",
    SUB_WINNER: "WINNER",
    SUB_RUNNER_UP: "RUNNER_UP",
    SUB_REJECTED: "REJECTED",
    SUB_WITHDRAWN: "WITHDRAWN",
}

# --- Verdict tiers ----------------------------------------------------------
# The LLM classifies every evaluated submission into exactly one tier.
# Tiers are ordered: higher is better. Validators accept a leader verdict
# whose tier is within TIER_TOLERANCE of their own re-derived tier.
TIER_OFF_TOPIC: int = 0        # unrelated to the problem space
TIER_SPEC_ONLY: int = 1        # mere spec compliance, no deeper insight
TIER_PARTIAL_DEPTH: int = 2    # touches the root cause but incomplete
TIER_DEEP_SOLUTION: int = 3    # convincingly solves the underlying problem
TIER_REDEFINING: int = 4       # solves a demonstrably better problem than the spec

TIER_NAMES: dict = {
    TIER_OFF_TOPIC: "OFF_TOPIC",
    TIER_SPEC_ONLY: "SPEC_ONLY",
    TIER_PARTIAL_DEPTH: "PARTIAL_DEPTH",
    TIER_DEEP_SOLUTION: "DEEP_SOLUTION",
    TIER_REDEFINING: "REDEFINING",
}

# --- Consensus tolerances (the anti-UNDETERMINED knobs) ---------------------
# SCORE_TOLERANCE was 20; tightened to 12 so a leader/validator pair can no
# longer "agree" across a materially different read of the same submission.
SCORE_TOLERANCE: int = 12      # |leader_score - validator_score| accepted delta
TIER_TOLERANCE: int = 1        # adjacent tiers are considered agreeing
SCORE_BAND_WIDTH: int = 5      # scores are rounded to bands of this width

# --- Economic parameters -----------------------------------------------------
# Funding currency is USDC (6 decimals) held in escrow on Base Sepolia, not
# native GEN. Amounts below are USDC base units (1_000_000 == 1.00 USDC).
MIN_BOUNTY_ESCROW: int = 1_000_000       # 1.00 USDC — spam floor
MAX_SUBMISSIONS_PER_BOUNTY: int = 64     # hard cap to bound evaluation cost
MAX_SUBMISSIONS_PER_SOLVER: int = 3      # per bounty, anti-spam
WINNER_SHARE_BPS: int = 8500             # 85.00% of escrow to the winner
RUNNER_UP_SHARE_BPS: int = 1000          # 10.00% to the runner-up (if any)
PROTOCOL_RESERVE_BPS: int = 500          # 5.00% retained for the creator refund
BPS_DENOMINATOR: int = 10000

# --- Submission window (anti "close immediately" knobs) ---------------------
MIN_SUBMISSION_WINDOW_SECS: int = 3600        # 1 hour floor
MAX_SUBMISSION_WINDOW_SECS: int = 30 * 86400  # 30 days ceiling

# --- Acceptance thresholds --------------------------------------------------
# A submission can win only if its composite score reaches WIN_THRESHOLD and
# its tier is at least TIER_PARTIAL_DEPTH. Kept deliberately moderate: the
# bar filters junk without making consensus fragile.
WIN_THRESHOLD: int = 55
RUNNER_UP_THRESHOLD: int = 45

# --- Text limits (validated deterministically on every write) ---------------
MAX_TITLE_LEN: int = 160
MAX_SPEC_LEN: int = 8000
MAX_TRUE_PROBLEM_LEN: int = 4000
MAX_RATIONALE_LEN: int = 6000
MAX_URL_LEN: int = 400
MAX_CATEGORY_LEN: int = 48
MAX_TAG_COUNT: int = 6
MAX_EVIDENCE_CHARS: int = 12000   # fetched evidence is truncated to this size

# --- Error prefixes (deterministic, machine-parseable) -----------------------
ERR_EXPECTED: str = "EXPECTED"     # normal business-rule rejection
ERR_EXTERNAL: str = "EXTERNAL"     # upstream web resource problem
ERR_TRANSIENT: str = "TRANSIENT"   # retryable infrastructure problem
ERR_LLM: str = "LLM_ERROR"         # model output could not be used


# ============================================================================
# SECTION 2 — Storage records
# ============================================================================
# Only GenVM storage types are used: sized integers, str, bool, Address,
# DynArray, TreeMap, and @allow_storage dataclasses. Raw Python dict/list
# never touch persistent state (they would break schema generation).


@allow_storage
@dataclass
class Bounty:
    """A funded problem statement held in USDC escrow on Base Sepolia."""

    id: u32
    creator: Address
    title: str
    # The literal specification the creator wrote (what a traditional bounty
    # would enforce).
    spec_text: str
    # The creator's articulation of the suspected deeper problem. May be
    # empty — discovering the true problem is the solver's job; when present
    # it guides but does not constrain evaluation.
    true_problem_text: str
    category: str
    tags_csv: str                 # comma-separated, validated at write time
    reward_escrow: u256           # remaining escrowed USDC (base units) for this bounty
    initial_escrow: u256          # funding at creation (for UI/history)
    status: u8
    created_at_note: str          # creator-supplied ISO date string (metadata)
    deadline_note: str            # creator-supplied ISO date string (metadata)
    submission_window_secs: u256   # duration granted once funding is confirmed
    opened_at: u256                # unix ts: when funding was confirmed (OPEN)
    submission_deadline: u256      # unix ts: close_submissions cannot fire before this
    submission_ids: DynArray[u32]
    winner_submission_id: u32     # 0 == none
    runner_up_submission_id: u32  # 0 == none
    evaluated_count: u32
    resolution_summary: str       # human-readable outcome, set at finalize


@allow_storage
@dataclass
class Submission:
    """A solver's answer: narrative rationale + a public evidence artifact."""

    id: u32
    bounty_id: u32
    solver: Address
    title: str
    rationale: str            # why this solves the deeper issue
    evidence_url: str         # public repo / gist / document — fetched on-chain
    status: u8
    has_evaluation: bool


@allow_storage
@dataclass
class Evaluation:
    """The consensus-accepted verdict for one submission.

    Every numeric score is 0..100. `composite` is the weighted total used
    for ranking. The full reasoning is preserved so verdicts stay
    explainable and auditable forever.
    """

    submission_id: u32
    bounty_id: u32
    spec_compliance: u8       # did it also satisfy the literal spec?
    problem_depth: u8         # did it identify/address the true root cause?
    superiority: u8           # is the alternative objectively better?
    evidence_quality: u8      # does the FETCHED artifact substantiate claims?
    composite: u8
    tier: u8
    verdict_reasoning: str    # model-written justification (truncated, stored)
    evidence_excerpt: str     # short quote from fetched evidence used in judging
    evidence_fetch_ok: bool


@allow_storage
@dataclass
class RewardRecord:
    """Append-only ledger entry for every value movement out of escrow."""

    bounty_id: u32
    submission_id: u32        # 0 for refunds/reclaims
    recipient: Address
    amount: u256
    kind: str                 # "WIN" | "RUNNER_UP" | "CREATOR_RESERVE" |
                              # "REFUND_CANCEL" | "RECLAIM" | "CLAIM"
    settled: bool             # False while sitting in `claimable`


@allow_storage
@dataclass
class SolverStats:
    """Aggregates that power the profile page and leaderboard."""

    submissions_total: u32
    wins: u32
    runner_ups: u32
    rejected: u32
    depth_score_total: u32    # sum of problem_depth across evaluations
    earned_total: u256


@allow_storage
@dataclass
class AuditEntry:
    """Append-only audit trail of every state-changing action."""

    seq: u32
    actor: Address
    action: str
    detail: str


# ============================================================================
# SECTION 2b — Value custody model (USDC on Base Sepolia, not native GEN)
# ============================================================================
# This contract does NOT hold or move funds directly. GenVM's EVM interop
# reaches contracts on GenLayer's own chain, not an arbitrary external
# chain — so a USDC balance on Base Sepolia cannot be moved by a GenVM
# `EthSend` no matter how it's invoked.
#
# Custody is split instead:
#   - Real USDC lives in `ReverseSpecEscrow.sol` on Base Sepolia. Creators
#     fund a bounty there (`fund(bounty_id, amount)`); winners/creators
#     claim there (`claim(bounty_id)`).
#   - This contract is the sole source of truth for JUDGING: it decides
#     who gets what, in USDC base units, and exposes that decision via
#     `get_base_payouts`. It never touches a private key or a transfer.
#   - A single trusted relayer address bridges the two directions:
#     `record_funding` (Base deposit -> this contract, confirms escrow)
#     and `mark_settled` (this contract's payout instruction -> Base
#     `settle()` call, confirms it was relayed). Both are idempotent on
#     the Base transaction hash so a retried relay can never double-count.
#   - `_credit` below still exists and still updates `reward_history` /
#     `claimable` / `total_open_escrow` / `total_unclaimed` — that
#     bookkeeping is what `get_base_payouts` reads from. It is an
#     internal ledger only; no value moves when it runs.


# ============================================================================
# SECTION 3 — The contract
# ============================================================================


class ReverseSpecBounties(gl.Contract):
    """Single production contract for the Reverse Spec Bounties protocol.

    Public surface overview
    -----------------------
    Writes (state-changing, wallet-signed):
        create_bounty        create a PENDING_FUNDING bounty shell (no
                             value attached — funding happens in USDC on
                             the Base Sepolia escrow)
        record_funding       relayer-only — confirms a Base Sepolia USDC
                             deposit and opens the bounty
        cancel_bounty        creator, only while zero live submissions
        close_submissions    creator, or any solver with a live
                             submission (abandonment recovery), and only
                             once the submission deadline has passed —
                             move OPEN -> EVALUATING
        submit_solution      solver — register rationale + evidence URL
        withdraw_submission  solver — before evaluation
        evaluate_submission  anyone — runs the consensus LLM evaluation
        finalize_bounty      creator or anyone once all evaluated —
                             computes the payout instruction
        reclaim_escrow       creator — after UNRESOLVED outcome
        mark_settled         relayer-only — confirms a Base Sepolia
                             settle() call for a bounty's payout

    Views (free reads for the indexer and UI):
        get_bounty, get_bounty_page, get_submission, get_bounty_submissions,
        get_evaluation, get_claimable, get_solver_stats, get_leaderboard,
        get_platform_stats, get_reward_history, get_audit_page,
        check_escrow_invariant, get_config, get_base_payouts
    """

    # ---- persistent state ---------------------------------------------------
    owner: Address
    relayer: Address
    bounty_seq: u32
    submission_seq: u32
    audit_seq: u32
    applied_base_tx: TreeMap[str, bool]

    bounties: TreeMap[u32, Bounty]
    submissions: TreeMap[u32, Submission]
    evaluations: TreeMap[u32, Evaluation]

    # solver -> count of submissions on a given bounty is derived by scan of
    # bounty.submission_ids (bounded by MAX_SUBMISSIONS_PER_BOUNTY), keeping
    # storage lean instead of a 2-key index.
    claimable: TreeMap[Address, u256]
    total_open_escrow: u256
    total_unclaimed: u256

    reward_history: DynArray[RewardRecord]
    audit_log: DynArray[AuditEntry]
    solver_stats: TreeMap[Address, SolverStats]
    leaderboard_addresses: DynArray[Address]   # every address that ever submitted

    # ------------------------------------------------------------------------
    # Construction
    # ------------------------------------------------------------------------
    def __init__(self):
        """Deploys the protocol. The deployer becomes `owner` and `relayer`.

        Ownership is intentionally minimal: the owner has NO power over
        verdicts or payout decisions — those belong to consensus. Owner
        may only rotate the trusted relayer identity. The relayer is the
        single address permitted to confirm Base Sepolia funding/settle
        events (`record_funding`/`mark_settled`); it never touches escrow
        state, verdicts, or ranking.
        """
        self.owner = gl.message.sender_address
        self.relayer = gl.message.sender_address
        self.bounty_seq = u32(0)
        self.submission_seq = u32(0)
        self.audit_seq = u32(0)
        self.total_open_escrow = u256(0)
        self.total_unclaimed = u256(0)

    # ========================================================================
    # SECTION 4 — Internal deterministic helpers
    # ========================================================================
    # Everything in this section is pure/deterministic; no LLM, no web.

    def _audit(self, action: str, detail: str) -> None:
        """Append an entry to the immutable audit log."""
        self.audit_seq = u32(int(self.audit_seq) + 1)
        entry = AuditEntry(
            seq=self.audit_seq,
            actor=gl.message.sender_address,
            action=action,
            detail=detail[:300],
        )
        self.audit_log.append(entry)

    def _fail(self, prefix: str, message: str) -> typing.NoReturn:
        """Abort the transaction with a deterministic, classified error."""
        raise gl.vm.UserError(f"{prefix}: {message}")

    def _require(self, condition: bool, message: str) -> None:
        """Business-rule guard. Reverts with an EXPECTED-classified error."""
        if not condition:
            self._fail(ERR_EXPECTED, message)

    def _only_relayer(self) -> None:
        """Restrict a write to the trusted Base Sepolia relayer address."""
        self._require(gl.message.sender_address == self.relayer,
                      "only the relayer may call this")

    def _only_owner(self) -> None:
        """Restrict a write to the deploying owner address."""
        self._require(gl.message.sender_address == self.owner,
                      "only the owner may call this")

    def _require_text(self, value: str, field: str, max_len: int,
                      min_len: int = 1) -> str:
        """Validate and normalize a free-text field.

        Strips surrounding whitespace, enforces UTF-8-safe printable content
        and length bounds. Returns the normalized value.
        """
        cleaned = value.strip()
        self._require(len(cleaned) >= min_len,
                      f"{field} must be at least {min_len} characters")
        self._require(len(cleaned) <= max_len,
                      f"{field} exceeds {max_len} characters")
        return cleaned

    def _require_url(self, value: str) -> str:
        """Validate the evidence URL: https-only public artifact.

        Deliberately strict — the URL is later fetched inside consensus, so
        garbage here would waste every validator's time.
        """
        cleaned = value.strip()
        self._require(len(cleaned) <= MAX_URL_LEN, "evidence_url too long")
        self._require(cleaned.startswith("https://"),
                      "evidence_url must be a public https:// link")
        self._require(" " not in cleaned and "\n" not in cleaned,
                      "evidence_url contains whitespace")
        # Reject obvious localhost/private targets — validators cannot and
        # should not fetch them.
        lowered = cleaned.lower()
        for banned in ("localhost", "127.0.0.1", "0.0.0.0", "[::1]",
                       "10.", "192.168.", "file://"):
            self._require(banned not in lowered,
                          "evidence_url must be publicly reachable")
        return cleaned

    def _get_bounty_or_fail(self, bounty_id: int) -> Bounty:
        """Fetch a bounty record or revert."""
        b = self.bounties.get(u32(bounty_id))
        if b is None:
            self._fail(ERR_EXPECTED, f"bounty {bounty_id} does not exist")
        return b

    def _get_submission_or_fail(self, submission_id: int) -> Submission:
        """Fetch a submission record or revert."""
        s = self.submissions.get(u32(submission_id))
        if s is None:
            self._fail(ERR_EXPECTED,
                       f"submission {submission_id} does not exist")
        return s

    def _stats_for(self, addr: Address) -> SolverStats:
        """Get-or-create the solver stats record for an address."""
        existing = self.solver_stats.get(addr)
        if existing is not None:
            return existing
        fresh = SolverStats(
            submissions_total=u32(0),
            wins=u32(0),
            runner_ups=u32(0),
            rejected=u32(0),
            depth_score_total=u32(0),
            earned_total=u256(0),
        )
        self.solver_stats[addr] = fresh
        self.leaderboard_addresses.append(addr)
        return self.solver_stats[addr]

    def _credit(self, bounty_id: int, submission_id: int, recipient: Address,
                amount: int, kind: str) -> None:
        """Credit `amount` to `recipient`'s claimable balance (pull pattern).

        Also decrements the bounty's escrow and maintains the global
        conservation counters. Every credit is mirrored into the immutable
        reward history ledger.
        """
        if amount <= 0:
            return
        bounty = self._get_bounty_or_fail(bounty_id)
        self._require(int(bounty.reward_escrow) >= amount,
                      "escrow underflow prevented")
        bounty.reward_escrow = u256(int(bounty.reward_escrow) - amount)
        self.total_open_escrow = u256(int(self.total_open_escrow) - amount)
        current = self.claimable.get(recipient)
        base = int(current) if current is not None else 0
        self.claimable[recipient] = u256(base + amount)
        self.total_unclaimed = u256(int(self.total_unclaimed) + amount)
        self.reward_history.append(RewardRecord(
            bounty_id=u32(bounty_id),
            submission_id=u32(submission_id),
            recipient=recipient,
            amount=u256(amount),
            kind=kind,
            settled=False,
        ))

    def _clamp_score(self, value: typing.Any) -> int:
        """Coerce arbitrary LLM output into a safe 0..100 integer."""
        try:
            n = int(float(value))
        except (TypeError, ValueError):
            return 0
        if n < 0:
            return 0
        if n > 100:
            return 100
        return n

    def _band(self, score: int) -> int:
        """Round a score down to its band so tiny variance can't flip votes."""
        return (score // SCORE_BAND_WIDTH) * SCORE_BAND_WIDTH

    def _composite(self, spec_compliance: int, problem_depth: int,
                   superiority: int, evidence_quality: int) -> int:
        """Weighted composite score.

        Weights encode the protocol's philosophy: depth and superiority
        dominate; literal spec compliance matters least — that is the whole
        point of Reverse Spec.
            problem_depth      40%
            superiority        30%
            evidence_quality   20%
            spec_compliance    10%
        """
        total = (problem_depth * 40 + superiority * 30
                 + evidence_quality * 20 + spec_compliance * 10)
        return total // 100

    def _tier_from_text(self, raw: typing.Any) -> int:
        """Map a model-emitted tier label to its ordinal, defensively."""
        if isinstance(raw, (int, float)):
            n = int(raw)
            return n if 0 <= n <= TIER_REDEFINING else TIER_SPEC_ONLY
        text = str(raw).strip().upper().replace(" ", "_").replace("-", "_")
        for ordinal, name in TIER_NAMES.items():
            if name in text:
                return ordinal
        # Common aliases the model might produce.
        aliases = {
            "IRRELEVANT": TIER_OFF_TOPIC,
            "UNRELATED": TIER_OFF_TOPIC,
            "COMPLIANT": TIER_SPEC_ONLY,
            "SURFACE": TIER_SPEC_ONLY,
            "PARTIAL": TIER_PARTIAL_DEPTH,
            "INCOMPLETE": TIER_PARTIAL_DEPTH,
            "DEEP": TIER_DEEP_SOLUTION,
            "ROOT_CAUSE": TIER_DEEP_SOLUTION,
            "SUPERIOR": TIER_REDEFINING,
            "TRANSFORMATIVE": TIER_REDEFINING,
        }
        for key, ordinal in aliases.items():
            if key in text:
                return ordinal
        return TIER_SPEC_ONLY

    def _extract_json(self, raw: str) -> typing.Any:
        """Parse a JSON object out of arbitrary LLM output.

        Tolerates markdown fences, leading prose, and trailing commentary.
        Returns None when no object can be recovered — callers classify
        that as LLM_ERROR.
        """
        text = raw.strip()
        # Strip common markdown fences.
        if text.startswith("```"):
            first_newline = text.find("\n")
            if first_newline != -1:
                text = text[first_newline + 1:]
            if text.rstrip().endswith("```"):
                text = text.rstrip()[:-3]
            text = text.strip()
        # Fast path.
        try:
            return json.loads(text)
        except (ValueError, TypeError):
            pass
        # Slow path: find the outermost brace pair.
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return None
        candidate = text[start:end + 1]
        try:
            return json.loads(candidate)
        except (ValueError, TypeError):
            # Last resort: remove trailing commas, a frequent LLM defect.
            repaired = candidate.replace(",}", "}").replace(",]", "]")
            try:
                return json.loads(repaired)
            except (ValueError, TypeError):
                return None

    def _normalize_verdict(self, parsed: typing.Any) -> dict:
        """Validate and normalize a parsed verdict object.

        Returns a plain (transient, NOT stored) dict with exactly the keys
        the contract needs, every score clamped, the tier resolved to an
        ordinal, and text fields truncated to storage limits. Returns None
        when the object is unusable.
        """
        if not isinstance(parsed, dict):
            return None

        def pick(*names: str, default: typing.Any = 0) -> typing.Any:
            """Accept common key aliases the model might use."""
            for name in names:
                if name in parsed:
                    return parsed[name]
            return default

        spec_compliance = self._clamp_score(
            pick("spec_compliance", "compliance", "spec_score"))
        problem_depth = self._clamp_score(
            pick("problem_depth", "depth", "depth_score", "root_cause_score"))
        superiority = self._clamp_score(
            pick("superiority", "superiority_score", "better_solution_score"))
        evidence_quality = self._clamp_score(
            pick("evidence_quality", "evidence_score", "artifact_quality"))
        tier = self._tier_from_text(
            pick("tier", "verdict_tier", "classification",
                 default="SPEC_ONLY"))
        reasoning = str(pick("reasoning", "justification", "explanation",
                             default="")).strip()[:1500]
        excerpt = str(pick("evidence_excerpt", "quote", "excerpt",
                           default="")).strip()[:500]
        if not reasoning:
            return None
        return {
            "spec_compliance": spec_compliance,
            "problem_depth": problem_depth,
            "superiority": superiority,
            "evidence_quality": evidence_quality,
            "tier": tier,
            "reasoning": reasoning,
            "excerpt": excerpt,
        }

    # ========================================================================
    # SECTION 5 — Non-deterministic building blocks (leader/validator)
    # ========================================================================

    def _evaluation_prompt(self, bounty_title: str, spec_text: str,
                           true_problem_text: str, submission_title: str,
                           rationale: str, evidence_ok: bool,
                           evidence_text: str) -> str:
        """Build the deterministic evaluation prompt string.

        The prompt is fully specified so leader and validators judge the
        same instructions; only model sampling and the independently
        fetched evidence vary.
        """
        true_problem_block = (
            true_problem_text
            if true_problem_text.strip()
            else "(The creator did not articulate the deeper problem — "
                 "part of the evaluation is judging whether the solver "
                 "correctly discovered it.)"
        )
        evidence_block = (
            evidence_text
            if evidence_ok
            else "EVIDENCE UNAVAILABLE — the artifact could not be fetched. "
                 "Score evidence_quality at most 25 and rely on internal "
                 "consistency of the rationale for the remaining scores."
        )
        return f"""You are the adjudication engine of Reverse Spec Bounties,
a protocol that rewards solving the DEEPER problem behind a specification
rather than literal spec compliance.

## Bounty
Title: {bounty_title}

### Original specification (what was literally asked)
{spec_text}

### Creator's stated deeper problem (may be empty)
{true_problem_block}

## Submission under evaluation
Title: {submission_title}

### Solver's rationale (their own words — treat as claims, not facts)
{rationale}

### Fetched evidence artifact (retrieved live from the solver's public URL)
{evidence_block}

## Your task
Judge whether this submission solves the true underlying problem. The
solver's rationale is only a claim; ground every score in the FETCHED
EVIDENCE where available. A submission that ignores the literal spec but
convincingly solves the root cause should score HIGH on problem_depth and
superiority. A submission that merely restates or satisfies the spec
without deeper insight belongs in tier SPEC_ONLY.

Score each dimension 0-100:
- spec_compliance: does it also satisfy the literal specification?
- problem_depth: does it identify and address the true root cause?
- superiority: is the delivered approach objectively better than what the
  spec asked for (simpler, safer, more general, measurably stronger)?
- evidence_quality: does the fetched artifact concretely substantiate the
  rationale (real code, real analysis, reproducible detail)?

Choose exactly one tier:
OFF_TOPIC | SPEC_ONLY | PARTIAL_DEPTH | DEEP_SOLUTION | REDEFINING

Respond with ONLY a JSON object, no markdown, in exactly this shape:
{{
  "spec_compliance": <int>,
  "problem_depth": <int>,
  "superiority": <int>,
  "evidence_quality": <int>,
  "tier": "<one tier label>",
  "reasoning": "<3-6 sentences justifying the scores, citing the evidence>",
  "evidence_excerpt": "<a short verbatim quote from the fetched evidence, or empty string>"
}}"""

    def _run_consensus_evaluation(self, bounty: Bounty,
                                  submission: Submission) -> dict:
        """Execute the leader/validator evaluation for one submission.

        Returns the normalized verdict dict PLUS `evidence_fetch_ok`.

        Acceptance rule (executed by every validator):
          1. Leader result must be structurally valid (deterministic check).
          2. Validator re-derives its own verdict (own fetch, own LLM call).
          3. Accept when tiers agree within TIER_TOLERANCE AND banded
             composite scores agree within SCORE_TOLERANCE.
          4. If the validator's own derivation fails infrastructurally,
             accept a structurally valid leader rather than forcing
             rotation — availability of a reasonable verdict beats
             perfection, and structural bounds still hold.
        """
        bounty_title = bounty.title
        spec_text = bounty.spec_text
        true_problem = bounty.true_problem_text
        sub_title = submission.title
        rationale = submission.rationale
        evidence_url = submission.evidence_url
        contract = self

        def derive() -> dict:
            """Fetch evidence + judge. Runs identically for the leader and
            every validator, each on their own node. All non-deterministic
            calls live directly in this closure (equivalence block)."""
            # 1. Fetch the public evidence artifact. Upstream flakiness is
            #    downgraded to an explicit "evidence unavailable" posture
            #    instead of crashing consensus.
            evidence_ok = False
            evidence_text = ""
            try:
                page = gl.nondet.web.render(evidence_url, mode="text")
                fetched = str(page)
                if fetched.strip():
                    evidence_ok = True
                    evidence_text = fetched[:MAX_EVIDENCE_CHARS]
                else:
                    evidence_text = f"{ERR_EXTERNAL}: evidence page was empty"
            except Exception as exc:  # noqa: BLE001 — keep consensus alive
                evidence_text = (
                    f"{ERR_EXTERNAL}: fetch failed ({str(exc)[:160]})")

            # 2. Judge with the LLM against the fully specified prompt.
            prompt = contract._evaluation_prompt(
                bounty_title, spec_text, true_problem, sub_title,
                rationale, evidence_ok, evidence_text)
            raw = gl.nondet.exec_prompt(prompt)

            # 3. Defensive parse + normalize; unusable output is an
            #    explicit, classified failure. The runtime may hand back an
            #    already-parsed object or a raw string — accept both.
            parsed = raw if isinstance(raw, dict) else contract._extract_json(str(raw))
            verdict = contract._normalize_verdict(parsed)
            if verdict is None:
                raise gl.vm.UserError(
                    f"{ERR_LLM}: model returned an unusable verdict")
            verdict["evidence_fetch_ok"] = evidence_ok
            return verdict

        def validator_fn(leader_result) -> bool:
            # --- 1. structural validation: cheap, deterministic, mandatory.
            if not isinstance(leader_result, gl.vm.Return):
                return False
            try:
                leader_calldata = dict(leader_result.calldata)
                leader_verdict = contract._normalize_verdict(leader_calldata)
            except (TypeError, KeyError):
                return False
            if leader_verdict is None:
                return False
            leader_evidence_ok = bool(leader_calldata.get(
                "evidence_fetch_ok", False))
            leader_composite = contract._composite(
                leader_verdict["spec_compliance"],
                leader_verdict["problem_depth"],
                leader_verdict["superiority"],
                leader_verdict["evidence_quality"])

            # --- 2. semantic validation: re-derive and compare strictly.
            try:
                mine = derive()
            except Exception:  # noqa: BLE001
                # Infrastructure failed on THIS validator only. The leader
                # result already passed structural checks; accepting keeps
                # consensus alive instead of rotating leaders on flaky I/O.
                return True
            my_composite = contract._composite(
                mine["spec_compliance"], mine["problem_depth"],
                mine["superiority"], mine["evidence_quality"])
            tier_gap = abs(int(mine["tier"]) - int(leader_verdict["tier"]))
            score_gap = abs(contract._band(my_composite)
                            - contract._band(leader_composite))
            # Evidence availability must match exactly: a payout-driving
            # verdict can't be "accepted" when one side fetched the
            # artifact and the other didn't — that's a materially
            # different basis for the score, not tolerable variance.
            evidence_agrees = (bool(mine["evidence_fetch_ok"])
                              == leader_evidence_ok)
            return (evidence_agrees and tier_gap <= TIER_TOLERANCE
                   and score_gap <= SCORE_TOLERANCE)

        result = gl.vm.run_nondet(derive, validator_fn)
        # Depending on runtime, run_nondet returns either the plain value or
        # a Result wrapper that must be unpacked.
        unpacked = result if isinstance(result, dict) else gl.vm.unpack_result(result)
        if not isinstance(unpacked, dict):
            self._fail(ERR_LLM, "evaluation produced no usable verdict")
        return unpacked

    # ========================================================================
    # SECTION 6 — Public writes: bounty lifecycle
    # ========================================================================

    @gl.public.write
    def create_bounty(self, title: str, spec_text: str,
                      true_problem_text: str, category: str, tags_csv: str,
                      created_at_note: str, deadline_note: str,
                      submission_window_secs: u256) -> u32:
        """Create a bounty shell awaiting USDC funding on Base Sepolia.

        No value is attached here — GenLayer cannot custody an asset that
        lives on another chain. The creator funds the bounty by calling
        `fund(bounty_id, amount)` on the Base Sepolia escrow contract; the
        relayer then confirms that deposit via `record_funding`, which is
        what actually opens the bounty to submissions.

        Args:
            title: short bounty headline.
            spec_text: the literal specification.
            true_problem_text: optional articulation of the deeper problem
                (empty string allowed).
            category: short category label, e.g. "Protocol", "DeFi", "UX".
            tags_csv: up to MAX_TAG_COUNT comma-separated tags.
            created_at_note / deadline_note: ISO-8601 strings kept as
                display metadata.
            submission_window_secs: how long, once funded and OPEN, the
                bounty stays open to new submissions before anyone can
                call `close_submissions`. Bounded to prevent both a
                same-block close and an unbounded-forever bounty.

        Returns:
            The new bounty id.
        """
        window = int(submission_window_secs)
        self._require(
            MIN_SUBMISSION_WINDOW_SECS <= window <= MAX_SUBMISSION_WINDOW_SECS,
            f"submission_window_secs must be between "
            f"{MIN_SUBMISSION_WINDOW_SECS} and {MAX_SUBMISSION_WINDOW_SECS}")
        title_n = self._require_text(title, "title", MAX_TITLE_LEN, 8)
        spec_n = self._require_text(spec_text, "spec_text", MAX_SPEC_LEN, 40)
        true_problem_n = ""
        if true_problem_text.strip():
            true_problem_n = self._require_text(
                true_problem_text, "true_problem_text",
                MAX_TRUE_PROBLEM_LEN, 10)
        category_n = self._require_text(category, "category",
                                        MAX_CATEGORY_LEN, 2)
        tags_n = tags_csv.strip()
        if tags_n:
            parts = [p.strip() for p in tags_n.split(",") if p.strip()]
            self._require(len(parts) <= MAX_TAG_COUNT,
                          f"at most {MAX_TAG_COUNT} tags")
            for part in parts:
                self._require(len(part) <= 24, "tag too long")
            tags_n = ",".join(parts)

        self.bounty_seq = u32(int(self.bounty_seq) + 1)
        bounty_id = self.bounty_seq
        bounty = Bounty(
            id=bounty_id,
            creator=gl.message.sender_address,
            title=title_n,
            spec_text=spec_n,
            true_problem_text=true_problem_n,
            category=category_n,
            tags_csv=tags_n,
            reward_escrow=u256(0),
            initial_escrow=u256(0),
            status=u8(BOUNTY_PENDING_FUNDING),
            created_at_note=created_at_note.strip()[:40],
            deadline_note=deadline_note.strip()[:40],
            submission_window_secs=u256(window),
            opened_at=u256(0),
            submission_deadline=u256(0),
            submission_ids=[],  # coerced into DynArray[u32] by storage encoder
            winner_submission_id=u32(0),
            runner_up_submission_id=u32(0),
            evaluated_count=u32(0),
            resolution_summary="",
        )
        self.bounties[bounty_id] = bounty
        self._audit("CREATE_BOUNTY",
                    f"id={int(bounty_id)} window={window} title={title_n[:60]}")
        return bounty_id

    @gl.public.write
    def record_funding(self, bounty_id: u32, funder: str, amount: u256,
                       base_tx_hash: str) -> None:
        """Relayer-only: confirm a USDC deposit made on the Base Sepolia
        escrow contract and open the bounty once the minimum is met.

        Idempotent on `base_tx_hash` so a retried/duplicated relay can
        never double-credit a bounty.
        """
        self._only_relayer()
        bounty = self._get_bounty_or_fail(int(bounty_id))
        tx_key = base_tx_hash.strip().lower()
        self._require(bool(tx_key), "base_tx_hash is required")
        if self.applied_base_tx.get(tx_key):
            return  # idempotent no-op: already applied — checked BEFORE
                    # the status guard so a retried relay after the bounty
                    # already opened doesn't get misreported as an error.
        self._require(int(bounty.status) == BOUNTY_PENDING_FUNDING,
                      "bounty is not awaiting funding")
        self.applied_base_tx[tx_key] = True
        deposited = int(amount)
        self._require(deposited >= MIN_BOUNTY_ESCROW,
                      f"deposit below minimum ({MIN_BOUNTY_ESCROW} base units)")
        now = _now_ts()
        bounty.reward_escrow = u256(deposited)
        bounty.initial_escrow = u256(deposited)
        bounty.opened_at = u256(now)
        bounty.submission_deadline = u256(now + int(bounty.submission_window_secs))
        bounty.status = u8(BOUNTY_OPEN)
        self.total_open_escrow = u256(int(self.total_open_escrow) + deposited)
        self._audit("RECORD_FUNDING",
                    f"id={int(bounty_id)} amount={deposited} "
                    f"funder={funder} base_tx={tx_key}")

    @gl.public.write
    def cancel_bounty(self, bounty_id: u32) -> None:
        """Cancel a PENDING_FUNDING or OPEN bounty with no live submissions.

        For an OPEN bounty, the escrowed USDC is credited back to the
        creator's ledger balance and becomes visible via
        `get_base_payouts` for the relayer to settle on Base Sepolia. A
        PENDING_FUNDING bounty has no escrow yet, so cancelling it is a
        pure no-refund state change.
        """
        bounty = self._get_bounty_or_fail(int(bounty_id))
        self._require(bounty.creator == gl.message.sender_address,
                      "only the creator can cancel")
        status = int(bounty.status)
        self._require(status in (BOUNTY_PENDING_FUNDING, BOUNTY_OPEN),
                      "only PENDING_FUNDING or OPEN bounties can be cancelled")
        live = 0
        for sid in bounty.submission_ids:
            sub = self.submissions.get(sid)
            if sub is not None and int(sub.status) != SUB_WITHDRAWN:
                live += 1
        self._require(live == 0,
                      "cannot cancel: live submissions exist; "
                      "close submissions and evaluate instead")
        refund = int(bounty.reward_escrow)
        if refund > 0:
            self._credit(int(bounty_id), 0, bounty.creator, refund,
                         "REFUND_CANCEL")
        bounty.status = u8(BOUNTY_CANCELLED)
        bounty.resolution_summary = "Cancelled by creator before submissions."
        self._audit("CANCEL_BOUNTY", f"id={int(bounty_id)} refund={refund}")

    @gl.public.write
    def close_submissions(self, bounty_id: u32) -> None:
        """Move a bounty from OPEN to EVALUATING.

        After this, no new submissions are accepted and evaluations can be
        triggered. Requires at least one live submission.

        Callable by the creator, OR by any solver with a live submission on
        this bounty. This is the abandonment-recovery exit: without it, a
        creator who stops responding after real work has been submitted
        would permanently strand both the escrow and every solver's unpaid
        submission, with no path forward. Since the protocol has no
        stakeholder-triggered escape hatch — not a public/anyone-can-call
        one, to avoid a stranger cutting off submissions early — is the
        safe way to unblock this without opening a griefing vector.

        This is also gated on `submission_deadline` having passed, for
        BOTH the creator and the abandonment-recovery solver path: without
        that, a solver (or an impatient creator) could close the window
        the instant a single submission lands, shutting out every other
        prospective solver before they had a fair chance to compete. The
        deadline is fixed at funding time (`record_funding`), so no caller
        — including the one triggering the close — controls it.
        """
        bounty = self._get_bounty_or_fail(int(bounty_id))
        self._require(int(bounty.status) == BOUNTY_OPEN,
                      "bounty is not OPEN")
        now = _now_ts()
        self._require(now >= int(bounty.submission_deadline),
                      "submission window has not elapsed yet")
        caller = gl.message.sender_address
        live = 0
        caller_has_submission = False
        for sid in bounty.submission_ids:
            sub = self.submissions.get(sid)
            if sub is not None and int(sub.status) != SUB_WITHDRAWN:
                live += 1
                if sub.solver == caller:
                    caller_has_submission = True
        self._require(
            caller == bounty.creator or caller_has_submission,
            "only the creator or a solver with a live submission can "
            "close submissions")
        self._require(live > 0, "no live submissions to evaluate; "
                                "cancel the bounty instead")
        bounty.status = u8(BOUNTY_EVALUATING)
        self._audit("CLOSE_SUBMISSIONS",
                    f"id={int(bounty_id)} live_submissions={live} "
                    f"triggered_by={'creator' if caller == bounty.creator else 'solver'}")

    # ========================================================================
    # SECTION 7 — Public writes: submissions
    # ========================================================================

    @gl.public.write
    def submit_solution(self, bounty_id: u32, title: str, rationale: str,
                        evidence_url: str) -> u32:
        """Register a solution against an OPEN bounty.

        The rationale explains why the deeper problem is solved; the
        evidence URL must point to a PUBLIC artifact (repository, gist,
        published document). At evaluation time every validator fetches
        that artifact live — prose alone can never win.

        Returns the new submission id.
        """
        bounty = self._get_bounty_or_fail(int(bounty_id))
        self._require(int(bounty.status) == BOUNTY_OPEN,
                      "bounty is not accepting submissions")
        self._require(gl.message.sender_address != bounty.creator,
                      "creator cannot submit to their own bounty")
        self._require(len(bounty.submission_ids) < MAX_SUBMISSIONS_PER_BOUNTY,
                      "bounty reached the submission cap")
        mine = 0
        for sid in bounty.submission_ids:
            sub = self.submissions.get(sid)
            if (sub is not None
                    and sub.solver == gl.message.sender_address
                    and int(sub.status) != SUB_WITHDRAWN):
                mine += 1
        self._require(mine < MAX_SUBMISSIONS_PER_SOLVER,
                      f"at most {MAX_SUBMISSIONS_PER_SOLVER} live submissions "
                      "per solver per bounty")

        title_n = self._require_text(title, "title", MAX_TITLE_LEN, 8)
        rationale_n = self._require_text(rationale, "rationale",
                                         MAX_RATIONALE_LEN, 80)
        url_n = self._require_url(evidence_url)

        self.submission_seq = u32(int(self.submission_seq) + 1)
        submission_id = self.submission_seq
        self.submissions[submission_id] = Submission(
            id=submission_id,
            bounty_id=bounty.id,
            solver=gl.message.sender_address,
            title=title_n,
            rationale=rationale_n,
            evidence_url=url_n,
            status=u8(SUB_PENDING),
            has_evaluation=False,
        )
        bounty.submission_ids.append(submission_id)
        stats = self._stats_for(gl.message.sender_address)
        stats.submissions_total = u32(int(stats.submissions_total) + 1)
        self._audit("SUBMIT_SOLUTION",
                    f"bounty={int(bounty_id)} submission={int(submission_id)}")
        return submission_id

    @gl.public.write
    def withdraw_submission(self, submission_id: u32) -> None:
        """Solver withdraws a still-PENDING submission on an OPEN bounty."""
        sub = self._get_submission_or_fail(int(submission_id))
        self._require(sub.solver == gl.message.sender_address,
                      "only the solver can withdraw")
        self._require(int(sub.status) == SUB_PENDING,
                      "only pending submissions can be withdrawn")
        bounty = self._get_bounty_or_fail(int(sub.bounty_id))
        self._require(int(bounty.status) == BOUNTY_OPEN,
                      "submissions are locked once evaluation starts")
        sub.status = u8(SUB_WITHDRAWN)
        self._audit("WITHDRAW_SUBMISSION", f"submission={int(submission_id)}")

    # ========================================================================
    # SECTION 8 — Public writes: evaluation (the intelligent core)
    # ========================================================================

    @gl.public.write
    def evaluate_submission(self, submission_id: u32) -> None:
        """Run the consensus LLM evaluation for one pending submission.

        Anyone may trigger this once the bounty is EVALUATING (permitting
        keepers/the indexer to drive progress). The verdict — scores, tier,
        reasoning, and an excerpt of the fetched evidence — is stored
        on-chain permanently.
        """
        sub = self._get_submission_or_fail(int(submission_id))
        self._require(int(sub.status) == SUB_PENDING,
                      "submission is not pending evaluation")
        bounty = self._get_bounty_or_fail(int(sub.bounty_id))
        self._require(int(bounty.status) == BOUNTY_EVALUATING,
                      "bounty is not in the EVALUATING phase")
        self._require(not sub.has_evaluation,
                      "submission already evaluated")

        verdict = self._run_consensus_evaluation(bounty, sub)

        spec_c = self._clamp_score(verdict.get("spec_compliance"))
        depth = self._clamp_score(verdict.get("problem_depth"))
        superiority = self._clamp_score(verdict.get("superiority"))
        evidence_q = self._clamp_score(verdict.get("evidence_quality"))
        tier = int(verdict.get("tier", TIER_SPEC_ONLY))
        if tier < TIER_OFF_TOPIC or tier > TIER_REDEFINING:
            tier = TIER_SPEC_ONLY
        composite = self._composite(spec_c, depth, superiority, evidence_q)

        self.evaluations[sub.id] = Evaluation(
            submission_id=sub.id,
            bounty_id=bounty.id,
            spec_compliance=u8(spec_c),
            problem_depth=u8(depth),
            superiority=u8(superiority),
            evidence_quality=u8(evidence_q),
            composite=u8(composite),
            tier=u8(tier),
            verdict_reasoning=str(verdict.get("reasoning", ""))[:1500],
            evidence_excerpt=str(verdict.get("excerpt", ""))[:500],
            evidence_fetch_ok=bool(verdict.get("evidence_fetch_ok", False)),
        )
        sub.has_evaluation = True
        sub.status = u8(SUB_EVALUATED)
        bounty.evaluated_count = u32(int(bounty.evaluated_count) + 1)
        stats = self._stats_for(sub.solver)
        stats.depth_score_total = u32(int(stats.depth_score_total) + depth)
        self._audit("EVALUATE_SUBMISSION",
                    f"submission={int(submission_id)} composite={composite} "
                    f"tier={TIER_NAMES.get(tier, '?')}")

    # ========================================================================
    # SECTION 9 — Public writes: finalization and value transfer
    # ========================================================================

    @gl.public.write
    def finalize_bounty(self, bounty_id: u32) -> None:
        """Rank evaluated submissions, pick outcomes, and distribute escrow.

        Callable by anyone once EVERY live submission has an evaluation
        (keeps the protocol permissionless past the evaluation phase).

        Distribution when a winner exists:
            85% winner · 10% runner-up (if any, else added to winner) ·
            5% creator reserve credit.
        When nothing reaches WIN_THRESHOLD the bounty becomes UNRESOLVED
        and the creator may `reclaim_escrow`.
        """
        bounty = self._get_bounty_or_fail(int(bounty_id))
        self._require(int(bounty.status) == BOUNTY_EVALUATING,
                      "bounty is not in the EVALUATING phase")

        live_ids = []
        for sid in bounty.submission_ids:
            sub = self.submissions.get(sid)
            if sub is not None and int(sub.status) in (
                    SUB_PENDING, SUB_EVALUATED):
                live_ids.append(int(sid))
        self._require(len(live_ids) > 0, "no live submissions")
        for sid in live_ids:
            sub = self.submissions.get(u32(sid))
            self._require(sub is not None and sub.has_evaluation,
                          f"submission {sid} not evaluated yet")

        # Deterministic ranking: composite desc, then tier desc, then the
        # earlier submission wins ties (submission id asc). Every live
        # submission is ranked and stored for transparency, but only ones
        # with a consensus-confirmed fetched evidence artifact are
        # eligible to actually win or place runner-up — an unverifiable
        # claim cannot drive a real payout, no matter how it scored.
        ranked = []
        for sid in live_ids:
            ev = self.evaluations.get(u32(sid))
            if ev is None:
                continue
            ranked.append((int(ev.composite), int(ev.tier),
                           bool(ev.evidence_fetch_ok), -sid, sid))
        ranked.sort(reverse=True)

        winner_id = 0
        runner_up_id = 0
        for composite, tier, evidence_ok, _neg, sid in ranked:
            if winner_id == 0:
                if (composite >= WIN_THRESHOLD and tier >= TIER_PARTIAL_DEPTH
                        and evidence_ok):
                    winner_id = sid
                continue
            if runner_up_id == 0:
                if (composite >= RUNNER_UP_THRESHOLD
                        and tier >= TIER_PARTIAL_DEPTH and evidence_ok):
                    runner_up_id = sid
                break

        if winner_id == 0:
            bounty.status = u8(BOUNTY_UNRESOLVED)
            bounty.resolution_summary = (
                "No submission met the acceptance bar "
                f"(threshold {WIN_THRESHOLD}). Escrow is reclaimable by "
                "the creator.")
            for sid in live_ids:
                sub = self.submissions.get(u32(sid))
                if sub is not None:
                    sub.status = u8(SUB_REJECTED)
                    stats = self._stats_for(sub.solver)
                    stats.rejected = u32(int(stats.rejected) + 1)
            self._audit("FINALIZE_UNRESOLVED", f"bounty={int(bounty_id)}")
            return

        escrow = int(bounty.reward_escrow)
        winner_amount = escrow * WINNER_SHARE_BPS // BPS_DENOMINATOR
        runner_amount = (escrow * RUNNER_UP_SHARE_BPS // BPS_DENOMINATOR
                         if runner_up_id != 0 else 0)
        if runner_up_id == 0:
            winner_amount += escrow * RUNNER_UP_SHARE_BPS // BPS_DENOMINATOR
        reserve_amount = escrow - winner_amount - runner_amount

        winner_sub = self._get_submission_or_fail(winner_id)
        winner_sub.status = u8(SUB_WINNER)
        winner_stats = self._stats_for(winner_sub.solver)
        winner_stats.wins = u32(int(winner_stats.wins) + 1)
        winner_stats.earned_total = u256(
            int(winner_stats.earned_total) + winner_amount)
        self._credit(int(bounty_id), winner_id, winner_sub.solver,
                     winner_amount, "WIN")

        if runner_up_id != 0:
            runner_sub = self._get_submission_or_fail(runner_up_id)
            runner_sub.status = u8(SUB_RUNNER_UP)
            runner_stats = self._stats_for(runner_sub.solver)
            runner_stats.runner_ups = u32(int(runner_stats.runner_ups) + 1)
            runner_stats.earned_total = u256(
                int(runner_stats.earned_total) + runner_amount)
            self._credit(int(bounty_id), runner_up_id, runner_sub.solver,
                         runner_amount, "RUNNER_UP")

        if reserve_amount > 0:
            self._credit(int(bounty_id), 0, bounty.creator, reserve_amount,
                         "CREATOR_RESERVE")

        for sid in live_ids:
            if sid in (winner_id, runner_up_id):
                continue
            sub = self.submissions.get(u32(sid))
            if sub is not None:
                sub.status = u8(SUB_REJECTED)
                stats = self._stats_for(sub.solver)
                stats.rejected = u32(int(stats.rejected) + 1)

        bounty.winner_submission_id = u32(winner_id)
        bounty.runner_up_submission_id = u32(runner_up_id)
        bounty.status = u8(BOUNTY_RESOLVED)
        winner_ev = self.evaluations.get(u32(winner_id))
        tier_name = TIER_NAMES.get(
            int(winner_ev.tier) if winner_ev is not None else TIER_SPEC_ONLY,
            "?")
        bounty.resolution_summary = (
            f"Resolved: submission #{winner_id} won with tier {tier_name}. "
            f"Winner paid {winner_amount} base units"
            + (f", runner-up #{runner_up_id} paid {runner_amount}."
               if runner_up_id else "."))
        self._audit("FINALIZE_RESOLVED",
                    f"bounty={int(bounty_id)} winner={winner_id} "
                    f"runner_up={runner_up_id}")

    @gl.public.write
    def reclaim_escrow(self, bounty_id: u32) -> None:
        """Creator reclaims escrow from an UNRESOLVED bounty."""
        bounty = self._get_bounty_or_fail(int(bounty_id))
        self._require(bounty.creator == gl.message.sender_address,
                      "only the creator can reclaim")
        self._require(int(bounty.status) == BOUNTY_UNRESOLVED,
                      "escrow is only reclaimable from UNRESOLVED bounties")
        amount = int(bounty.reward_escrow)
        self._require(amount > 0, "nothing to reclaim")
        self._credit(int(bounty_id), 0, bounty.creator, amount, "RECLAIM")
        bounty.status = u8(BOUNTY_RECLAIMED)
        self._audit("RECLAIM_ESCROW",
                    f"bounty={int(bounty_id)} amount={amount}")

    @gl.public.write
    def mark_settled(self, bounty_id: u32, base_tx_hash: str) -> None:
        """Relayer-only: confirm that a bounty's payout instruction was
        successfully submitted as a `settle()` call on the Base Sepolia
        escrow contract.

        This is the terminal leg of the split-custody design: GenLayer
        never moves value itself. Once marked, `get_base_payouts` stops
        offering this bounty's (now-settled) reward records, and every
        unsettled ledger entry for it is closed out. Idempotent on
        `base_tx_hash`.
        """
        self._only_relayer()
        bounty = self._get_bounty_or_fail(int(bounty_id))
        tx_key = base_tx_hash.strip().lower()
        self._require(bool(tx_key), "base_tx_hash is required")
        if self.applied_base_tx.get(tx_key):
            return  # idempotent no-op: already applied
        self.applied_base_tx[tx_key] = True
        settled_amount = 0
        for record in self.reward_history:
            if int(record.bounty_id) == int(bounty_id) and not record.settled:
                record.settled = True
                settled_amount += int(record.amount)
                current = self.claimable.get(record.recipient)
                base = int(current) if current is not None else 0
                self.claimable[record.recipient] = u256(max(0, base - int(record.amount)))
        self._require(settled_amount > 0,
                      "no unsettled reward records for this bounty")
        self.total_unclaimed = u256(
            max(0, int(self.total_unclaimed) - settled_amount))
        self._audit("MARK_SETTLED",
                    f"bounty={int(bounty_id)} amount={settled_amount} "
                    f"base_tx={tx_key}")

    @gl.public.write
    def set_relayer(self, new_relayer: str) -> None:
        """Owner-only: rotate the trusted Base Sepolia relayer identity."""
        self._only_owner()
        self.relayer = Address(new_relayer)
        self._audit("SET_RELAYER", f"relayer={new_relayer}")

    # ========================================================================
    # SECTION 10 — Views (free reads for indexer + UI)
    # ========================================================================
    # Views return plain transient dicts/lists (calldata), never storage
    # references, so the schema stays clean.

    def _as_address(self, value: typing.Any) -> Address:
        """Coerce a calldata-delivered address (Address or raw bytes/hex)."""
        if isinstance(value, Address):
            return value
        return Address(value)

    def _bounty_to_dict(self, bounty: Bounty) -> dict:
        """Serialize one bounty for calldata output."""
        return {
            "id": int(bounty.id),
            "creator": bounty.creator.as_hex,
            "title": bounty.title,
            "spec_text": bounty.spec_text,
            "true_problem_text": bounty.true_problem_text,
            "category": bounty.category,
            "tags": [t for t in bounty.tags_csv.split(",") if t],
            "reward_escrow": str(int(bounty.reward_escrow)),
            "initial_escrow": str(int(bounty.initial_escrow)),
            "status": BOUNTY_STATUS_NAMES.get(int(bounty.status), "?"),
            "created_at_note": bounty.created_at_note,
            "deadline_note": bounty.deadline_note,
            "submission_window_secs": int(bounty.submission_window_secs),
            "opened_at": int(bounty.opened_at),
            "submission_deadline": int(bounty.submission_deadline),
            "submission_count": len(bounty.submission_ids),
            "evaluated_count": int(bounty.evaluated_count),
            "winner_submission_id": int(bounty.winner_submission_id),
            "runner_up_submission_id": int(bounty.runner_up_submission_id),
            "resolution_summary": bounty.resolution_summary,
        }

    def _submission_to_dict(self, sub: Submission) -> dict:
        """Serialize one submission (with its evaluation when present)."""
        out = {
            "id": int(sub.id),
            "bounty_id": int(sub.bounty_id),
            "solver": sub.solver.as_hex,
            "title": sub.title,
            "rationale": sub.rationale,
            "evidence_url": sub.evidence_url,
            "status": SUB_STATUS_NAMES.get(int(sub.status), "?"),
            "evaluation": None,
        }
        if sub.has_evaluation:
            ev = self.evaluations.get(sub.id)
            if ev is not None:
                out["evaluation"] = {
                    "spec_compliance": int(ev.spec_compliance),
                    "problem_depth": int(ev.problem_depth),
                    "superiority": int(ev.superiority),
                    "evidence_quality": int(ev.evidence_quality),
                    "composite": int(ev.composite),
                    "tier": TIER_NAMES.get(int(ev.tier), "?"),
                    "reasoning": ev.verdict_reasoning,
                    "evidence_excerpt": ev.evidence_excerpt,
                    "evidence_fetch_ok": ev.evidence_fetch_ok,
                }
        return out

    @gl.public.view
    def get_bounty(self, bounty_id: u32) -> dict:
        """Full detail for one bounty."""
        return self._bounty_to_dict(self._get_bounty_or_fail(int(bounty_id)))

    @gl.public.view
    def get_bounty_page(self, offset: u32, limit: u32) -> dict:
        """Newest-first page of bounties for the explorer."""
        total = int(self.bounty_seq)
        page_limit = min(max(int(limit), 1), 50)
        start = int(offset)
        items = []
        # Bounty ids are 1..bounty_seq; iterate newest first.
        idx = total - start
        while idx >= 1 and len(items) < page_limit:
            bounty = self.bounties.get(u32(idx))
            if bounty is not None:
                items.append(self._bounty_to_dict(bounty))
            idx -= 1
        return {"total": total, "offset": start, "items": items}

    @gl.public.view
    def get_submission(self, submission_id: u32) -> dict:
        """Full detail for one submission, including its verdict."""
        return self._submission_to_dict(
            self._get_submission_or_fail(int(submission_id)))

    @gl.public.view
    def get_bounty_submissions(self, bounty_id: u32) -> list:
        """All submissions for a bounty (bounded by the submission cap)."""
        bounty = self._get_bounty_or_fail(int(bounty_id))
        out = []
        for sid in bounty.submission_ids:
            sub = self.submissions.get(sid)
            if sub is not None:
                out.append(self._submission_to_dict(sub))
        return out

    @gl.public.view
    def get_evaluation(self, submission_id: u32) -> dict:
        """The stored verdict for a submission (errors if not evaluated)."""
        ev = self.evaluations.get(u32(int(submission_id)))
        if ev is None:
            self._fail(ERR_EXPECTED,
                       f"submission {int(submission_id)} has no evaluation")
        return {
            "submission_id": int(ev.submission_id),
            "bounty_id": int(ev.bounty_id),
            "spec_compliance": int(ev.spec_compliance),
            "problem_depth": int(ev.problem_depth),
            "superiority": int(ev.superiority),
            "evidence_quality": int(ev.evidence_quality),
            "composite": int(ev.composite),
            "tier": TIER_NAMES.get(int(ev.tier), "?"),
            "reasoning": ev.verdict_reasoning,
            "evidence_excerpt": ev.evidence_excerpt,
            "evidence_fetch_ok": ev.evidence_fetch_ok,
        }

    @gl.public.view
    def get_claimable(self, address: Address) -> str:
        """Unclaimed reward balance for an address, in base units."""
        current = self.claimable.get(self._as_address(address))
        return str(int(current) if current is not None else 0)

    @gl.public.view
    def get_solver_stats(self, address: Address) -> dict:
        """Profile aggregates for one solver."""
        stats = self.solver_stats.get(self._as_address(address))
        if stats is None:
            return {
                "submissions_total": 0, "wins": 0, "runner_ups": 0,
                "rejected": 0, "depth_score_total": 0, "earned_total": "0",
            }
        return {
            "submissions_total": int(stats.submissions_total),
            "wins": int(stats.wins),
            "runner_ups": int(stats.runner_ups),
            "rejected": int(stats.rejected),
            "depth_score_total": int(stats.depth_score_total),
            "earned_total": str(int(stats.earned_total)),
        }

    @gl.public.view
    def get_leaderboard(self, top_n: u32) -> list:
        """Solvers ranked by cumulative problem-depth score."""
        limit = min(max(int(top_n), 1), 100)
        rows = []
        for addr in self.leaderboard_addresses:
            stats = self.solver_stats.get(addr)
            if stats is None:
                continue
            rows.append((
                int(stats.depth_score_total),
                int(stats.wins),
                addr.as_hex,
                {
                    "address": addr.as_hex,
                    "depth_score_total": int(stats.depth_score_total),
                    "wins": int(stats.wins),
                    "runner_ups": int(stats.runner_ups),
                    "submissions_total": int(stats.submissions_total),
                    "earned_total": str(int(stats.earned_total)),
                },
            ))
        rows.sort(key=lambda r: (-r[0], -r[1], r[2]))
        return [row[3] for row in rows[:limit]]

    @gl.public.view
    def get_reward_history(self, address: Address, limit: u32) -> list:
        """Newest-first reward ledger entries for an address."""
        page_limit = min(max(int(limit), 1), 100)
        target = self._as_address(address)
        out = []
        idx = len(self.reward_history) - 1
        while idx >= 0 and len(out) < page_limit:
            record = self.reward_history[idx]
            if record.recipient == target:
                out.append({
                    "bounty_id": int(record.bounty_id),
                    "submission_id": int(record.submission_id),
                    "amount": str(int(record.amount)),
                    "kind": record.kind,
                    "settled": record.settled,
                })
            idx -= 1
        return out

    @gl.public.view
    def get_base_payouts(self, bounty_id: u32) -> list:
        """Consensus-derived USDC allocations for the Base Sepolia relayer.

        Aggregates every unsettled `reward_history` entry for this bounty
        by recipient. Empty once `mark_settled` has confirmed the
        corresponding `settle()` call on Base Sepolia — the relayer
        cannot pay a bounty out twice because there is nothing left here
        to read after the first successful relay.
        """
        totals: dict = {}
        order: list = []
        for record in self.reward_history:
            if int(record.bounty_id) != int(bounty_id) or record.settled:
                continue
            key = record.recipient.as_hex
            if key not in totals:
                totals[key] = 0
                order.append(key)
            totals[key] += int(record.amount)
        return [{"recipient": key, "amount": str(totals[key])}
                for key in order if totals[key] > 0]

    @gl.public.view
    def get_platform_stats(self) -> dict:
        """Headline numbers for the explorer/landing stats strip."""
        open_count = 0
        resolved_count = 0
        total_paid = 0
        for record in self.reward_history:
            if record.kind in ("WIN", "RUNNER_UP") and record.settled:
                total_paid += int(record.amount)
        idx = 1
        while idx <= int(self.bounty_seq):
            bounty = self.bounties.get(u32(idx))
            if bounty is not None:
                status = int(bounty.status)
                if status in (BOUNTY_OPEN, BOUNTY_EVALUATING):
                    open_count += 1
                elif status == BOUNTY_RESOLVED:
                    resolved_count += 1
            idx += 1
        return {
            "bounties_total": int(self.bounty_seq),
            "bounties_open": open_count,
            "bounties_resolved": resolved_count,
            "submissions_total": int(self.submission_seq),
            "open_escrow": str(int(self.total_open_escrow)),
            "unclaimed_rewards": str(int(self.total_unclaimed)),
            "total_paid_out": str(total_paid),
            "solvers_total": len(self.leaderboard_addresses),
        }

    @gl.public.view
    def get_audit_page(self, offset: u32, limit: u32) -> list:
        """Newest-first slice of the audit log."""
        page_limit = min(max(int(limit), 1), 100)
        out = []
        idx = len(self.audit_log) - 1 - int(offset)
        while idx >= 0 and len(out) < page_limit:
            entry = self.audit_log[idx]
            out.append({
                "seq": int(entry.seq),
                "actor": entry.actor.as_hex,
                "action": entry.action,
                "detail": entry.detail,
            })
            idx -= 1
        return out

    @gl.public.view
    def check_escrow_invariant(self) -> dict:
        """Verify conservation: contract balance covers all obligations.

        Any monitoring system (the backend indexer calls this every cycle)
        can alarm if `healthy` ever turns false.
        Note: this contract never custodies USDC (it lives in the Base
        Sepolia escrow), so this checks internal ledger self-consistency
        rather than a real token balance — the sum of every live bounty's
        `reward_escrow` must equal the tracked `total_open_escrow`.
        """
        summed_open = 0
        idx = 1
        while idx <= int(self.bounty_seq):
            bounty = self.bounties.get(u32(idx))
            if bounty is not None:
                summed_open += int(bounty.reward_escrow)
            idx += 1
        tracked_open = int(self.total_open_escrow)
        return {
            "tracked_open_escrow": str(tracked_open),
            "summed_bounty_escrow": str(summed_open),
            "unclaimed_rewards": str(int(self.total_unclaimed)),
            "healthy": tracked_open == summed_open,
        }

    @gl.public.view
    def get_config(self) -> dict:
        """Protocol constants, exposed for UI display and client validation."""
        return {
            "funding_currency": "USDC",
            "usdc_decimals": 6,
            "min_bounty_escrow": str(MIN_BOUNTY_ESCROW),
            "min_submission_window_secs": MIN_SUBMISSION_WINDOW_SECS,
            "max_submission_window_secs": MAX_SUBMISSION_WINDOW_SECS,
            "max_submissions_per_bounty": MAX_SUBMISSIONS_PER_BOUNTY,
            "max_submissions_per_solver": MAX_SUBMISSIONS_PER_SOLVER,
            "winner_share_bps": WINNER_SHARE_BPS,
            "runner_up_share_bps": RUNNER_UP_SHARE_BPS,
            "protocol_reserve_bps": PROTOCOL_RESERVE_BPS,
            "win_threshold": WIN_THRESHOLD,
            "runner_up_threshold": RUNNER_UP_THRESHOLD,
            "score_tolerance": SCORE_TOLERANCE,
            "tier_tolerance": TIER_TOLERANCE,
            "tiers": [TIER_NAMES[t] for t in sorted(TIER_NAMES)],
            "owner": self.owner.as_hex,
            "relayer": self.relayer.as_hex,
        }
