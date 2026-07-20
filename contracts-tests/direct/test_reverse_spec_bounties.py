"""Direct (in-memory) tests for the ReverseSpecBounties Intelligent Contract.

Runs the contract natively via gltest's direct runner — no simulator needed.
Web and LLM calls are mocked; consensus behavior itself is covered by the
integration suite (contracts-tests/integration/) against Studio/StudioNet.

Run:  .venv/bin/pytest contracts-tests/direct/ -v
"""

import json
from pathlib import Path

import pytest

from gltest.direct import VMContext, deploy_contract
from gltest.direct.loader import create_address

def addr_hex(a) -> str:
    """Hex form of a test address (loader may return bytes or Address)."""
    return a.as_hex if hasattr(a, "as_hex") else "0x" + a.hex()


CONTRACT_PATH = (
    Path(__file__).resolve().parents[2] / "contracts" / "reverse_spec_bounties.py"
)

GEN = 10**18                 # 1 GEN in base units
ESCROW = 10 * GEN            # default bounty funding used across tests

OWNER = create_address("owner")
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

def _eth_send_hook(vm, request):
    """Simulate a real EthSend: credit the recipient's actual balance,
    debit the sender contract's. Without this, gl.contract_interface's
    emit_transfer (EthSend) has no mock handler and the direct-test
    harness silently no-ops it — exactly the class of gap that let a
    real production bug (money leaving the contract's ledger but never
    reaching the recipient's wallet) go undetected by 33 "passing" tests
    that only ever checked internal claimable/history state, never an
    actual balance movement.
    """
    send = request.get("EthSend")
    if send is None:
        return None
    to_bytes = vm._to_bytes(send["address"])
    value = int(send.get("value", 0))
    vm._balances[to_bytes] = vm._balances.get(to_bytes, 0) + value
    if vm._contract_address is not None:
        vm._balances[vm._contract_address] = (
            vm._balances.get(vm._contract_address, 0) - value)
    return {"ok": None}


@pytest.fixture()
def vm():
    ctx = VMContext()
    ctx.sender = OWNER
    ctx._gl_call_hook = _eth_send_hook
    with ctx.activate():
        yield ctx


def wallet_balance(vm, address) -> int:
    """Real wallet balance (distinct from the contract's internal
    `claimable` ledger) — this is what actually proves GEN arrived."""
    return vm._balances.get(vm._to_bytes(address), 0)


@pytest.fixture()
def contract(vm):
    return deploy_contract(CONTRACT_PATH, vm)


def _fund_bounty(vm, contract, creator=CREATOR, escrow=ESCROW):
    vm.sender = creator
    vm.value = escrow
    bounty_id = contract.create_bounty(
        "Fix wallet approval UX at the root",
        SPEC,
        TRUE_PROBLEM,
        "UX",
        "wallet,security,simulation",
        "2026-07-17",
        "2026-08-17",
    )
    vm.value = 0
    return bounty_id


def _submit(vm, contract, bounty_id, solver=SOLVER_A,
            url=EVIDENCE_URL, title="Transaction simulation instead of dialogs"):
    vm.sender = solver
    return contract.submit_solution(bounty_id, title, RATIONALE, url)


def _mock_evaluation(vm, verdict_json=GOOD_VERDICT,
                     evidence_body="README: working simulation harness code"):
    vm.mock_web(r".*github\.com.*", {"status": 200, "body": evidence_body})
    vm.mock_llm(r".*adjudication engine.*", verdict_json)


# ---------------------------------------------------------------------------
# Bounty creation & escrow
# ---------------------------------------------------------------------------

class TestCreateBounty:
    def test_create_holds_escrow(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        data = contract.get_bounty(bounty_id)
        assert data["status"] == "OPEN"
        assert data["reward_escrow"] == str(ESCROW)
        assert data["creator"].lower().endswith(addr_hex(CREATOR)[-8:].lower())
        stats = contract.get_platform_stats()
        assert stats["open_escrow"] == str(ESCROW)

    def test_rejects_dust_escrow(self, vm, contract):
        vm.sender = CREATOR
        vm.value = 10  # far below MIN_BOUNTY_ESCROW
        with pytest.raises(Exception, match="EXPECTED.*escrow below minimum"):
            contract.create_bounty("A valid bounty title", SPEC, "", "UX",
                                   "", "", "")

    def test_rejects_short_spec(self, vm, contract):
        vm.sender = CREATOR
        vm.value = ESCROW
        with pytest.raises(Exception, match="EXPECTED.*spec_text"):
            contract.create_bounty("A valid bounty title", "too short", "",
                                   "UX", "", "", "")

    def test_tag_cap_enforced(self, vm, contract):
        vm.sender = CREATOR
        vm.value = ESCROW
        with pytest.raises(Exception, match="EXPECTED.*tags"):
            contract.create_bounty("A valid bounty title", SPEC, "", "UX",
                                   "a,b,c,d,e,f,g", "", "")


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
# Lifecycle guards
# ---------------------------------------------------------------------------

class TestLifecycle:
    def test_close_requires_live_submission(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        vm.sender = CREATOR
        with pytest.raises(Exception, match="EXPECTED.*no live submissions"):
            contract.close_submissions(bounty_id)

    def test_cancel_refunds_creator(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        vm.sender = CREATOR
        contract.cancel_bounty(bounty_id)
        assert contract.get_bounty(bounty_id)["status"] == "CANCELLED"
        assert contract.get_claimable(CREATOR) == str(ESCROW)

    def test_cannot_cancel_with_live_submission(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        _submit(vm, contract, bounty_id)
        vm.sender = CREATOR
        with pytest.raises(Exception, match="EXPECTED.*live submissions"):
            contract.cancel_bounty(bounty_id)

    def test_no_submissions_after_close(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        _submit(vm, contract, bounty_id)
        vm.sender = CREATOR
        contract.close_submissions(bounty_id)
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
        vm.sender = CREATOR
        contract.close_submissions(bounty_id)
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
        vm.sender = CREATOR
        contract.close_submissions(bounty_id)
        _mock_evaluation(vm)
        contract.evaluate_submission(sub_id)
        with pytest.raises(Exception, match="EXPECTED.*not pending"):
            contract.evaluate_submission(sub_id)

    def test_malformed_llm_output_is_classified(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        sub_id = _submit(vm, contract, bounty_id)
        vm.sender = CREATOR
        contract.close_submissions(bounty_id)
        _mock_evaluation(vm, verdict_json="I refuse to answer in JSON.")
        with pytest.raises(Exception, match="LLM_ERROR"):
            contract.evaluate_submission(sub_id)

    def test_fenced_json_is_tolerated(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        sub_id = _submit(vm, contract, bounty_id)
        vm.sender = CREATOR
        contract.close_submissions(bounty_id)
        fenced = "```json\n" + GOOD_VERDICT + "\n```"
        _mock_evaluation(vm, verdict_json=fenced)
        contract.evaluate_submission(sub_id)
        assert contract.get_evaluation(sub_id)["tier"] == "REDEFINING"


# ---------------------------------------------------------------------------
# Finalization & the value-transfer path
# ---------------------------------------------------------------------------

class TestFinalization:
    def _run_to_evaluated(self, vm, contract, verdicts):
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
        vm.sender = CREATOR
        contract.close_submissions(bounty_id)
        for sub_id, verdict in zip(sub_ids, verdicts):
            vm.clear_mocks()
            _mock_evaluation(vm, verdict_json=verdict)
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
        vm.sender = CREATOR
        contract.close_submissions(bounty_id)
        with pytest.raises(Exception, match="EXPECTED.*not evaluated yet"):
            contract.finalize_bounty(bounty_id)

    def test_escrow_conservation_invariant(self, vm, contract):
        bounty_id, _ = self._run_to_evaluated(vm, contract, [GOOD_VERDICT])
        contract.finalize_bounty(bounty_id)
        inv = contract.check_escrow_invariant()
        # all escrow moved to unclaimed; nothing left open for this bounty
        assert inv["open_escrow"] == "0"
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
        assert "REDEFINING" in cfg["tiers"]

    def test_audit_log_records_actions(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        _submit(vm, contract, bounty_id)
        entries = contract.get_audit_page(0, 10)
        actions = [e["action"] for e in entries]
        assert actions[0] == "SUBMIT_SOLUTION"
        assert actions[1] == "CREATE_BOUNTY"


# ---------------------------------------------------------------------------
# Claiming (native transfer out of the contract)
# ---------------------------------------------------------------------------

class TestClaim:
    def test_claim_zeroes_balance_and_records_settlement(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        _submit(vm, contract, bounty_id)
        vm.sender = CREATOR
        contract.close_submissions(bounty_id)
        _mock_evaluation(vm)
        contract.evaluate_submission(1)
        contract.finalize_bounty(bounty_id)
        expected = ESCROW * 9500 // 10000
        assert contract.get_claimable(SOLVER_A) == str(expected)
        balance_before = wallet_balance(vm, SOLVER_A)
        vm.sender = SOLVER_A
        claimed = contract.claim_rewards()
        assert int(claimed) == expected
        assert contract.get_claimable(SOLVER_A) == "0"
        # The actual point of claim_rewards: real GEN must land in the
        # recipient's wallet, not just clear the contract's internal
        # ledger. A prior contract version zeroed `claimable` correctly
        # while routing the transfer through the wrong GenVM primitive
        # (a contract-call convention, not a real send) — the ledger
        # looked fully settled while the recipient's wallet stayed at 0.
        assert wallet_balance(vm, SOLVER_A) == balance_before + expected
        history = contract.get_reward_history(SOLVER_A, 10)
        assert history[0]["kind"] == "CLAIM"
        assert all(h["settled"] for h in history if h["kind"] != "CLAIM")

    def test_claim_with_nothing_reverts(self, vm, contract):
        vm.sender = SOLVER_B
        with pytest.raises(Exception, match="EXPECTED.*nothing claimable"):
            contract.claim_rewards()


# ---------------------------------------------------------------------------
# Abandonment recovery: close_submissions is not creator-exclusive
# ---------------------------------------------------------------------------

class TestAbandonmentRecovery:
    def test_solver_can_close_submissions_if_creator_vanishes(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        _submit(vm, contract, bounty_id, solver=SOLVER_A)
        # Creator never calls close_submissions. The solver who put in real
        # work is a stakeholder and can unstick the bounty themselves.
        vm.sender = SOLVER_A
        contract.close_submissions(bounty_id)
        assert contract.get_bounty(bounty_id)["status"] == "EVALUATING"

    def test_unrelated_address_cannot_close_submissions(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        _submit(vm, contract, bounty_id, solver=SOLVER_A)
        vm.sender = SOLVER_B  # has no submission on this bounty
        with pytest.raises(Exception, match="EXPECTED.*creator or a solver"):
            contract.close_submissions(bounty_id)

    def test_withdrawn_solver_cannot_close_submissions(self, vm, contract):
        bounty_id = _fund_bounty(vm, contract)
        sub_id = _submit(vm, contract, bounty_id, solver=SOLVER_A)
        vm.sender = SOLVER_A
        contract.withdraw_submission(sub_id)
        with pytest.raises(Exception, match="EXPECTED.*creator or a solver"):
            contract.close_submissions(bounty_id)

    def test_abandoned_bounty_reaches_full_payout_via_solver_trigger(
            self, vm, contract):
        """End-to-end: creator disappears after funding + a submission
        arrives; the solver self-serves close_submissions, evaluation and
        finalization proceed permissionlessly, and the winner gets paid —
        the escrow never gets permanently stuck."""
        bounty_id = _fund_bounty(vm, contract)
        sub_id = _submit(vm, contract, bounty_id, solver=SOLVER_A)
        vm.sender = SOLVER_A
        contract.close_submissions(bounty_id)
        _mock_evaluation(vm)
        vm.sender = SOLVER_A
        contract.evaluate_submission(sub_id)
        vm.sender = SOLVER_A
        contract.finalize_bounty(bounty_id)
        assert contract.get_bounty(bounty_id)["status"] == "RESOLVED"
        assert contract.get_claimable(SOLVER_A) == str(ESCROW * 9500 // 10000)
