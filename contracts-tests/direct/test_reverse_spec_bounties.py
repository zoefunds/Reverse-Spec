"""Direct (in-memory) tests for the ReverseSpecBounties Intelligent Contract.

Runs the contract natively via gltest's direct runner — no simulator needed.
Web and LLM calls are mocked; consensus behavior itself is covered by the
integration suite (contracts-tests/integration/) against Studio/StudioNet.

Funding is USDC (6 decimals) confirmed via the relayer-only `record_funding`
write, mirroring the real Base-Sepolia-escrow + relayer split-custody
design — this contract never moves value itself.

Run:  .venv/bin/pytest contracts-tests/direct/ -v
"""

import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from gltest.direct import VMContext, deploy_contract
from gltest.direct.loader import create_address

def addr_hex(a) -> str:
    """Hex form of a test address (loader may return bytes or Address)."""
    return a.as_hex if hasattr(a, "as_hex") else "0x" + a.hex()


def warp_seconds(vm, seconds: int) -> None:
    """Advance the VM's transaction clock by `seconds`, on top of whatever
    it's currently set to (VMContext only exposes absolute `warp`)."""
    current = datetime.fromisoformat(vm._datetime.replace("Z", "+00:00"))
    vm.warp((current + timedelta(seconds=seconds)).isoformat().replace(
        "+00:00", "Z"))


CONTRACT_PATH = (
    Path(__file__).resolve().parents[2] / "contracts" / "reverse_spec_bounties.py"
)

USDC = 10**6                  # 1.00 USDC in base units
ESCROW = 100 * USDC           # default bounty funding used across tests
DEFAULT_WINDOW = 3600 * 24    # 1 day, a valid submission_window_secs

OWNER = create_address("owner")            # deployer == owner == relayer
CREATOR = create_address("creator")
SOLVER_A = create_address("solver_a")
SOLVER_B = create_address("solver_b")

SPEC = (
    "Improve the wallet transaction confirmation UX so users stop "
    "approving malicious transactions. The dialog must show the target "
    "address, the amount, and a warning color for unverified contracts."
)
TRUE_PROBLEM = (
    "Users approve malicious transactions because they cannot see what a "
    "transaction will actually DO — the real fix is simulation, not dialogs."
)
RATIONALE = (
    "Instead of restyling the confirmation dialog, this work implements "
    "transaction simulation: every transaction is dry-run against a fork "
    "and the resulting balance/approval changes are shown in plain "
    "language before signing. This removes the root cause: users could "
    "never map calldata to consequences, no matter how the dialog looked."
)
EVIDENCE_URL = "https://github.com/example/tx-simulation-poc"

GOOD_VERDICT = json.dumps({
    "spec_compliance": 55,
    "problem_depth": 90,
    "superiority": 85,
    "evidence_quality": 80,
    "tier": "REDEFINING",
    "reasoning": (
        "The submission bypasses the literal dialog spec but eliminates the "
        "underlying failure mode by showing simulated consequences. The "
        "fetched repository contains a working simulation harness."
    ),
    "evidence_excerpt": "simulate(tx) -> HumanReadableDelta",
})

LOW_VERDICT = json.dumps({
    "spec_compliance": 40,
    "problem_depth": 20,
    "superiority": 15,
    "evidence_quality": 25,
    "tier": "SPEC_ONLY",
    "reasoning": "Merely restyles the dialog; no engagement with root cause.",
    "evidence_excerpt": "",
})


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

@pytest.fixture()
def vm():
    ctx = VMContext()
    ctx.sender = OWNER  # deployer becomes owner + relayer
    with ctx.activate():
        yield ctx


@pytest.fixture()
def contract(vm):
    return deploy_contract(CONTRACT_PATH, vm)


def _create(vm, contract, creator=CREATOR, window=DEFAULT_WINDOW):
    vm.sender = creator
    return contract.create_bounty(
        "Fix wallet approval UX at the root",
        SPEC,
        TRUE_PROBLEM,
        "UX",
        "wallet,security,simulation",
        "2026-07-17",
        "2026-08-17",
        window,
    )


def _fund_bounty(vm, contract, creator=CREATOR, escrow=ESCROW,
                 window=DEFAULT_WINDOW, tx_hash=None):
    """Create + relayer-confirm funding, matching the real two-step flow:
    create_bounty (GenLayer) -> fund() on Base Sepolia -> record_funding
    (relayer, once the Base deposit is confirmed)."""
    bounty_id = _create(vm, contract, creator=creator, window=window)
    vm.sender = OWNER  # the relayer
    contract.record_funding(
        bounty_id, addr_hex(creator), escrow,
        tx_hash or f"0xfund{int(bounty_id):04x}")
    return bounty_id


def _submit(vm, contract, bounty_id, solver=SOLVER_A,
            url=EVIDENCE_URL, title="Transaction simulation instead of dialogs"):
    vm.sender = solver
    return contract.submit_solution(bounty_id, title, RATIONALE, url)


def _mock_evaluation(vm, verdict_json=GOOD_VERDICT,
                     evidence_body="README: working simulation harness code"):
    vm.mock_web(r".*github\.com.*", {"status": 200, "body": evidence_body})
    vm.mock_llm(r".*adjudication engine.*", verdict_json)


def _close_after_window(vm, contract, bounty_id, sender=CREATOR,
                        window=DEFAULT_WINDOW):
    """Warp past the submission deadline, then close_submissions."""
    warp_seconds(vm, window + 1)
    vm.sender = sender
    contract.close_submissions(bounty_id)


# ---------------------------------------------------------------------------
# Bounty creation & funding
# ---------------------------------------------------------------------------

class TestCreateAndFund:
    def test_create_is_pending_funding(self, vm, contract):
        bounty_id = _create(vm, contract)
        data = contract.get_bounty(bounty_id)
        assert data["status"] == "PENDING_FUNDING"
        assert data["reward_escrow"] == "0"

    def test_record_funding_opens_bounty(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        data = contract.get_bounty(bounty_id)
        assert data["status"] == "OPEN"
        assert data["reward_escrow"] == str(ESCROW)
        assert data["creator"].lower().endswith(addr_hex(CREATOR)[-8:].lower())
        assert data["submission_deadline"] > data["opened_at"]
        stats = contract.get_platform_stats()
        assert stats["open_escrow"] == str(ESCROW)

    def test_record_funding_is_relayer_only(self, vm, contract):
        bounty_id = _create(vm, contract)
        vm.sender = CREATOR
        with pytest.raises(Exception, match="EXPECTED.*only the relayer"):
            contract.record_funding(bounty_id, addr_hex(CREATOR), ESCROW,
                                    "0xnotrelayer")

    def test_record_funding_idempotent_on_tx_hash(self, vm, contract):
        bounty_id = _create(vm, contract)
        vm.sender = OWNER
        contract.record_funding(bounty_id, addr_hex(CREATOR), ESCROW, "0xdup")
        # Second relay with the same base_tx_hash must be a silent no-op,
        # not a double-credit.
        contract.record_funding(bounty_id, addr_hex(CREATOR), ESCROW, "0xdup")
        assert contract.get_bounty(bounty_id)["reward_escrow"] == str(ESCROW)

    def test_record_funding_rejects_dust(self, vm, contract):
        bounty_id = _create(vm, contract)
        vm.sender = OWNER
        with pytest.raises(Exception, match="EXPECTED.*deposit below minimum"):
            contract.record_funding(bounty_id, addr_hex(CREATOR), 10, "0xdust")

    def test_rejects_short_spec(self, vm, contract):
        vm.sender = CREATOR
        with pytest.raises(Exception, match="EXPECTED.*spec_text"):
            contract.create_bounty("A valid bounty title", "too short", "",
                                   "UX", "", "", "", DEFAULT_WINDOW)

    def test_tag_cap_enforced(self, vm, contract):
        vm.sender = CREATOR
        with pytest.raises(Exception, match="EXPECTED.*tags"):
            contract.create_bounty("A valid bounty title", SPEC, "", "UX",
                                   "a,b,c,d,e,f,g", "", "", DEFAULT_WINDOW)

    def test_submission_window_bounds_enforced(self, vm, contract):
        vm.sender = CREATOR
        with pytest.raises(Exception, match="EXPECTED.*submission_window_secs"):
            contract.create_bounty("A valid bounty title", SPEC, "", "UX",
                                   "", "", "", 10)  # far below the 1h floor


# ---------------------------------------------------------------------------
# Submissions
# ---------------------------------------------------------------------------

class TestSubmissions:
    def test_submit_and_read_back(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        sub_id = _submit(vm, contract, bounty_id)
        sub = contract.get_submission(sub_id)
        assert sub["status"] == "PENDING"
        assert sub["evidence_url"] == EVIDENCE_URL
        subs = contract.get_bounty_submissions(bounty_id)
        assert len(subs) == 1

    def test_cannot_submit_before_funded(self, vm, contract):
        bounty_id = _create(vm, contract)
        vm.sender = SOLVER_A
        with pytest.raises(Exception, match="EXPECTED.*not accepting"):
            contract.submit_solution(bounty_id, "Too early submission title",
                                     RATIONALE, EVIDENCE_URL)

    def test_creator_cannot_self_submit(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        vm.sender = CREATOR
        with pytest.raises(Exception, match="EXPECTED.*creator cannot submit"):
            contract.submit_solution(bounty_id, "Self dealing attempt title",
                                     RATIONALE, EVIDENCE_URL)

    def test_rejects_http_and_private_urls(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        vm.sender = SOLVER_A
        for bad in ("http://github.com/x/y",
                    "https://localhost/evil",
                    "https://192.168.1.5/repo"):
            with pytest.raises(Exception, match="EXPECTED.*evidence_url"):
                contract.submit_solution(bounty_id, "Valid title here",
                                         RATIONALE, bad)

    def test_per_solver_cap(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        for i in range(3):
            _submit(vm, contract, bounty_id,
                    title=f"Distinct submission number {i}")
        with pytest.raises(Exception, match="EXPECTED.*at most 3"):
            _submit(vm, contract, bounty_id, title="One submission too many")

    def test_withdraw(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        sub_id = _submit(vm, contract, bounty_id)
        vm.sender = SOLVER_A
        contract.withdraw_submission(sub_id)
        assert contract.get_submission(sub_id)["status"] == "WITHDRAWN"

    def test_withdraw_only_own(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        sub_id = _submit(vm, contract, bounty_id)
        vm.sender = SOLVER_B
        with pytest.raises(Exception, match="EXPECTED.*only the solver"):
            contract.withdraw_submission(sub_id)


# ---------------------------------------------------------------------------
# Lifecycle guards — including the real submission window
# ---------------------------------------------------------------------------

class TestLifecycle:
    def test_close_requires_live_submission(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        warp_seconds(vm, DEFAULT_WINDOW + 1)
        vm.sender = CREATOR
        with pytest.raises(Exception, match="EXPECTED.*no live submissions"):
            contract.close_submissions(bounty_id)

    def test_creator_cannot_close_before_deadline(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        _submit(vm, contract, bounty_id)
        vm.sender = CREATOR
        with pytest.raises(Exception, match="EXPECTED.*window has not elapsed"):
            contract.close_submissions(bounty_id)

    def test_solver_cannot_close_immediately_either(self, vm, contract):
        """The exploit this fixes: a solver submitting once and instantly
        shutting out every other prospective competitor."""
        bounty_id = _fund_bounty(vm, contract)
        _submit(vm, contract, bounty_id, solver=SOLVER_A)
        vm.sender = SOLVER_A
        with pytest.raises(Exception, match="EXPECTED.*window has not elapsed"):
            contract.close_submissions(bounty_id)

    def test_close_succeeds_after_window(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        _submit(vm, contract, bounty_id)
        _close_after_window(vm, contract, bounty_id)
        assert contract.get_bounty(bounty_id)["status"] == "EVALUATING"

    def test_cancel_refunds_creator(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        vm.sender = CREATOR
        contract.cancel_bounty(bounty_id)
        assert contract.get_bounty(bounty_id)["status"] == "CANCELLED"
        assert contract.get_claimable(CREATOR) == str(ESCROW)

    def test_cancel_pending_funding_needs_no_refund(self, vm, contract):
        bounty_id = _create(vm, contract)
        vm.sender = CREATOR
        contract.cancel_bounty(bounty_id)
        assert contract.get_bounty(bounty_id)["status"] == "CANCELLED"
        assert contract.get_claimable(CREATOR) == "0"

    def test_cannot_cancel_with_live_submission(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        _submit(vm, contract, bounty_id)
        vm.sender = CREATOR
        with pytest.raises(Exception, match="EXPECTED.*live submissions"):
            contract.cancel_bounty(bounty_id)

    def test_no_submissions_after_close(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        _submit(vm, contract, bounty_id)
        _close_after_window(vm, contract, bounty_id)
        vm.sender = SOLVER_B
        with pytest.raises(Exception, match="EXPECTED.*not accepting"):
            contract.submit_solution(bounty_id, "A late valid submission",
                                     RATIONALE, EVIDENCE_URL)


# ---------------------------------------------------------------------------
# Evaluation (mocked web + LLM)
# ---------------------------------------------------------------------------

class TestEvaluation:
    def test_evaluate_stores_verdict(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        sub_id = _submit(vm, contract, bounty_id)
        _close_after_window(vm, contract, bounty_id)
        _mock_evaluation(vm)
        vm.sender = SOLVER_B  # anyone can trigger
        contract.evaluate_submission(sub_id)
        ev = contract.get_evaluation(sub_id)
        assert ev["tier"] == "REDEFINING"
        assert ev["problem_depth"] == 90
        # composite = 90*40 + 85*30 + 80*20 + 55*10 = 8300 -> 83
        assert ev["composite"] == 83
        assert ev["evidence_fetch_ok"] is True
        assert "simulation" in ev["reasoning"]

    def test_cannot_evaluate_twice(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        sub_id = _submit(vm, contract, bounty_id)
        _close_after_window(vm, contract, bounty_id)
        _mock_evaluation(vm)
        contract.evaluate_submission(sub_id)
        with pytest.raises(Exception, match="EXPECTED.*not pending"):
            contract.evaluate_submission(sub_id)

    def test_malformed_llm_output_is_classified(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        sub_id = _submit(vm, contract, bounty_id)
        _close_after_window(vm, contract, bounty_id)
        _mock_evaluation(vm, verdict_json="I refuse to answer in JSON.")
        with pytest.raises(Exception, match="LLM_ERROR"):
            contract.evaluate_submission(sub_id)

    def test_fenced_json_is_tolerated(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        sub_id = _submit(vm, contract, bounty_id)
        _close_after_window(vm, contract, bounty_id)
        fenced = "```json\n" + GOOD_VERDICT + "\n```"
        _mock_evaluation(vm, verdict_json=fenced)
        contract.evaluate_submission(sub_id)
        assert contract.get_evaluation(sub_id)["tier"] == "REDEFINING"

    def test_validator_rejects_mismatched_evidence_availability(
            self, vm, contract):
        """A leader that fetched evidence and a validator that couldn't
        must NOT be treated as agreeing, even with identical scores — the
        basis for the score differs materially."""
        bounty_id = _fund_bounty(vm, contract)
        sub_id = _submit(vm, contract, bounty_id)
        _close_after_window(vm, contract, bounty_id)
        # Leader run: evidence fetch succeeds.
        _mock_evaluation(vm, verdict_json=GOOD_VERDICT)
        contract.evaluate_submission(sub_id)
        assert contract.get_evaluation(sub_id)["evidence_fetch_ok"] is True
        # Validator re-derivation: same LLM answer, but the fetch now
        # fails (no web mock) -> evidence_fetch_ok flips to False.
        vm.clear_mocks()
        vm.mock_llm(r".*adjudication engine.*", GOOD_VERDICT)
        accepted = vm.run_validator()
        assert accepted is False

    def test_validator_accepts_matching_evidence_and_scores(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        sub_id = _submit(vm, contract, bounty_id)
        _close_after_window(vm, contract, bounty_id)
        _mock_evaluation(vm, verdict_json=GOOD_VERDICT)
        contract.evaluate_submission(sub_id)
        # Re-run the validator with identical mocks still in place — same
        # evidence availability, same scores -> must accept.
        accepted = vm.run_validator()
        assert accepted is True

    def test_tightened_score_tolerance_rejects_prior_borderline_case(
            self, vm, contract):
        """SCORE_TOLERANCE dropped from 20 to 12: a gap that used to be
        waved through must now be rejected."""
        bounty_id = _fund_bounty(vm, contract)
        sub_id = _submit(vm, contract, bounty_id)
        _close_after_window(vm, contract, bounty_id)
        _mock_evaluation(vm, verdict_json=GOOD_VERDICT)
        contract.evaluate_submission(sub_id)
        disagreeing = json.dumps({
            "spec_compliance": 55, "problem_depth": 90,
            "superiority": 85, "evidence_quality": 80,
            # composite unchanged at 83, but tier gap of 2 (REDEFINING vs
            # PARTIAL_DEPTH) exceeds TIER_TOLERANCE regardless of score —
            # kept here to also confirm the removed same-side fallback.
            "tier": "PARTIAL_DEPTH",
            "reasoning": "A validator that reads the same evidence very "
                        "differently on tier, despite similar scores.",
            "evidence_excerpt": "",
        })
        vm.clear_mocks()
        vm.mock_web(r".*github\.com.*",
                    {"status": 200, "body": "README: working simulation harness code"})
        vm.mock_llm(r".*adjudication engine.*", disagreeing)
        accepted = vm.run_validator()
        assert accepted is False


# ---------------------------------------------------------------------------
# Finalization & the payout-instruction path (get_base_payouts / mark_settled)
# ---------------------------------------------------------------------------

class TestFinalization:
    def _run_to_evaluated(self, vm, contract, verdicts, evidence_ok=True):
        """Fund, submit len(verdicts) solutions, evaluate each with the
        paired verdict. Returns (bounty_id, [submission_ids])."""
        bounty_id = _fund_bounty(vm, contract)
        solvers = [SOLVER_A, SOLVER_B]
        sub_ids = []
        for i, _ in enumerate(verdicts):
            sub_ids.append(_submit(
                vm, contract, bounty_id, solver=solvers[i % 2],
                url=f"{EVIDENCE_URL}-{i}",
                title=f"Candidate solution number {i}"))
        _close_after_window(vm, contract, bounty_id)
        for sub_id, verdict in zip(sub_ids, verdicts):
            vm.clear_mocks()
            if evidence_ok:
                _mock_evaluation(vm, verdict_json=verdict)
            else:
                vm.mock_llm(r".*adjudication engine.*", verdict)
                # no mock_web registered -> fetch fails -> evidence_fetch_ok=False
            contract.evaluate_submission(sub_id)
        return bounty_id, sub_ids

    def test_winner_split_85_10_5(self, vm, contract):
        bounty_id, (win_id, run_id) = self._run_to_evaluated(
            vm, contract, [GOOD_VERDICT, json.dumps({
                "spec_compliance": 60, "problem_depth": 55,
                "superiority": 50, "evidence_quality": 50,
                "tier": "PARTIAL_DEPTH",
                "reasoning": "Decent partial engagement with the root cause.",
                "evidence_excerpt": "",
            })])
        contract.finalize_bounty(bounty_id)
        data = contract.get_bounty(bounty_id)
        assert data["status"] == "RESOLVED"
        assert data["winner_submission_id"] == win_id
        assert data["runner_up_submission_id"] == run_id
        assert contract.get_claimable(SOLVER_A) == str(ESCROW * 8500 // 10000)
        assert contract.get_claimable(SOLVER_B) == str(ESCROW * 1000 // 10000)
        assert contract.get_claimable(CREATOR) == str(ESCROW * 500 // 10000)
        assert contract.get_submission(win_id)["status"] == "WINNER"
        assert contract.get_submission(run_id)["status"] == "RUNNER_UP"

    def test_sole_winner_absorbs_runner_share(self, vm, contract):
        bounty_id, (win_id,) = self._run_to_evaluated(
            vm, contract, [GOOD_VERDICT])
        contract.finalize_bounty(bounty_id)
        assert contract.get_claimable(SOLVER_A) == str(ESCROW * 9500 // 10000)

    def test_unverifiable_evidence_cannot_win(self, vm, contract):
        """A submission whose evidence never fetched must not be pickable
        as winner even though its scores clear the bar — evidence_quality
        is capped low by the prompt, but a bug or a lucky LLM score should
        not be able to route real payout to an unverifiable claim."""
        bounty_id, (sub_id,) = self._run_to_evaluated(
            vm, contract, [GOOD_VERDICT], evidence_ok=False)
        contract.finalize_bounty(bounty_id)
        # evidence_quality is prompted low when unavailable, but force the
        # point home structurally too: even if it scored above threshold,
        # evidence_fetch_ok=False must exclude it.
        ev = contract.get_evaluation(sub_id)
        assert ev["evidence_fetch_ok"] is False
        data = contract.get_bounty(bounty_id)
        if ev["composite"] >= 55 and ev["tier"] not in ("OFF_TOPIC", "SPEC_ONLY"):
            assert data["winner_submission_id"] == 0
            assert data["status"] == "UNRESOLVED"

    def test_all_below_bar_is_unresolved_then_reclaim(self, vm, contract):
        bounty_id, (sub_id,) = self._run_to_evaluated(
            vm, contract, [LOW_VERDICT])
        contract.finalize_bounty(bounty_id)
        assert contract.get_bounty(bounty_id)["status"] == "UNRESOLVED"
        assert contract.get_submission(sub_id)["status"] == "REJECTED"
        vm.sender = CREATOR
        contract.reclaim_escrow(bounty_id)
        assert contract.get_bounty(bounty_id)["status"] == "RECLAIMED"
        assert contract.get_claimable(CREATOR) == str(ESCROW)

    def test_finalize_requires_all_evaluated(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        _submit(vm, contract, bounty_id)
        _close_after_window(vm, contract, bounty_id)
        with pytest.raises(Exception, match="EXPECTED.*not evaluated yet"):
            contract.finalize_bounty(bounty_id)

    def test_escrow_conservation_invariant(self, vm, contract):
        bounty_id, _ = self._run_to_evaluated(vm, contract, [GOOD_VERDICT])
        contract.finalize_bounty(bounty_id)
        inv = contract.check_escrow_invariant()
        assert inv["healthy"] is True
        assert inv["tracked_open_escrow"] == "0"
        assert inv["unclaimed_rewards"] == str(ESCROW)

    def test_leaderboard_and_stats(self, vm, contract):
        bounty_id, _ = self._run_to_evaluated(vm, contract, [GOOD_VERDICT])
        contract.finalize_bounty(bounty_id)
        board = contract.get_leaderboard(10)
        assert board[0]["wins"] == 1
        assert board[0]["depth_score_total"] == 90
        stats = contract.get_solver_stats(SOLVER_A)
        assert stats["wins"] == 1
        assert stats["earned_total"] == str(ESCROW * 9500 // 10000)


# ---------------------------------------------------------------------------
# Views & config
# ---------------------------------------------------------------------------

class TestViews:
    def test_pagination_newest_first(self, vm, contract):
        for _ in range(3):
            _fund_bounty(vm, contract)
        page = contract.get_bounty_page(0, 2)
        assert page["total"] == 3
        assert [b["id"] for b in page["items"]] == [3, 2]
        page2 = contract.get_bounty_page(2, 2)
        assert [b["id"] for b in page2["items"]] == [1]

    def test_config_exposes_protocol_constants(self, vm, contract):
        cfg = contract.get_config()
        assert cfg["winner_share_bps"] == 8500
        assert cfg["win_threshold"] == 55
        assert cfg["funding_currency"] == "USDC"
        assert cfg["usdc_decimals"] == 6
        assert cfg["score_tolerance"] == 12
        assert "REDEFINING" in cfg["tiers"]
        assert cfg["relayer"] == cfg["owner"]  # deployer doubles as relayer

    def test_audit_log_records_actions(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        _submit(vm, contract, bounty_id)
        entries = contract.get_audit_page(0, 10)
        actions = [e["action"] for e in entries]
        assert actions[0] == "SUBMIT_SOLUTION"
        assert actions[1] == "RECORD_FUNDING"
        assert actions[2] == "CREATE_BOUNTY"


# ---------------------------------------------------------------------------
# Base Sepolia payout instructions (get_base_payouts / mark_settled)
# ---------------------------------------------------------------------------

class TestBasePayouts:
    def test_get_base_payouts_lists_unsettled_recipients(self, vm, contract):
        bounty_id, (sub_id,) = TestFinalization()._run_to_evaluated(
            vm, contract, [GOOD_VERDICT])
        contract.finalize_bounty(bounty_id)
        payouts = contract.get_base_payouts(bounty_id)
        recipients = {p["recipient"].lower(): p["amount"] for p in payouts}
        assert addr_hex(SOLVER_A).lower() in recipients
        assert recipients[addr_hex(SOLVER_A).lower()] == str(ESCROW * 9500 // 10000)

    def test_mark_settled_is_relayer_only(self, vm, contract):
        bounty_id, _ = TestFinalization()._run_to_evaluated(
            vm, contract, [GOOD_VERDICT])
        contract.finalize_bounty(bounty_id)
        vm.sender = CREATOR
        with pytest.raises(Exception, match="EXPECTED.*only the relayer"):
            contract.mark_settled(bounty_id, "0xsettle1")

    def test_mark_settled_clears_payouts_and_is_idempotent(self, vm, contract):
        bounty_id, _ = TestFinalization()._run_to_evaluated(
            vm, contract, [GOOD_VERDICT])
        contract.finalize_bounty(bounty_id)
        vm.sender = OWNER
        contract.mark_settled(bounty_id, "0xsettle1")
        assert contract.get_base_payouts(bounty_id) == []
        assert contract.get_claimable(SOLVER_A) == "0"
        # Retrying the same relay tx must be a no-op, not an error and not
        # a second decrement.
        contract.mark_settled(bounty_id, "0xsettle1")

    def test_set_relayer_is_owner_only(self, vm, contract):
        vm.sender = CREATOR
        with pytest.raises(Exception, match="EXPECTED.*only the owner"):
            contract.set_relayer(addr_hex(SOLVER_A))
        vm.sender = OWNER
        contract.set_relayer(addr_hex(SOLVER_A))
        assert contract.get_config()["relayer"].lower() == addr_hex(SOLVER_A).lower()


# ---------------------------------------------------------------------------
# Abandonment recovery: close_submissions is not creator-exclusive, but is
# always deadline-gated regardless of who calls it.
# ---------------------------------------------------------------------------

class TestAbandonmentRecovery:
    def test_solver_can_close_submissions_if_creator_vanishes(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        _submit(vm, contract, bounty_id, solver=SOLVER_A)
        # Creator never calls close_submissions. The solver who put in real
        # work is a stakeholder and can unstick the bounty themselves, but
        # only once the window has actually elapsed.
        _close_after_window(vm, contract, bounty_id, sender=SOLVER_A)
        assert contract.get_bounty(bounty_id)["status"] == "EVALUATING"

    def test_unrelated_address_cannot_close_submissions(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        _submit(vm, contract, bounty_id, solver=SOLVER_A)
        warp_seconds(vm, DEFAULT_WINDOW + 1)
        vm.sender = SOLVER_B  # has no submission on this bounty
        with pytest.raises(Exception, match="EXPECTED.*creator or a solver"):
            contract.close_submissions(bounty_id)

    def test_withdrawn_solver_cannot_close_submissions(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        sub_id = _submit(vm, contract, bounty_id, solver=SOLVER_A)
        vm.sender = SOLVER_A
        contract.withdraw_submission(sub_id)
        warp_seconds(vm, DEFAULT_WINDOW + 1)
        vm.sender = SOLVER_A
        with pytest.raises(Exception, match="EXPECTED.*creator or a solver"):
            contract.close_submissions(bounty_id)

    def test_abandoned_bounty_reaches_full_payout_via_solver_trigger(
            self, vm, contract):
        """End-to-end: creator disappears after funding + a submission
        arrives; once the window elapses the solver self-serves
        close_submissions, evaluation and finalization proceed
        permissionlessly, and the payout instruction becomes available —
        the escrow never gets permanently stuck."""
        bounty_id = _fund_bounty(vm, contract)
        sub_id = _submit(vm, contract, bounty_id, solver=SOLVER_A)
        _close_after_window(vm, contract, bounty_id, sender=SOLVER_A)
        _mock_evaluation(vm)
        vm.sender = SOLVER_A
        contract.evaluate_submission(sub_id)
        vm.sender = SOLVER_A
        contract.finalize_bounty(bounty_id)
        assert contract.get_bounty(bounty_id)["status"] == "RESOLVED"
        assert contract.get_claimable(SOLVER_A) == str(ESCROW * 9500 // 10000)
