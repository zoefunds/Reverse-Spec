"""API tests: health, wallet auth round-trip, mirrors, and authorization."""

from eth_account import Account
from eth_account.messages import encode_defunct


def _sign_in(client):
    """Full nonce -> sign -> verify flow with a throwaway key."""
    acct = Account.create()
    address = acct.address.lower()
    nonce_resp = client.post("/api/v1/auth/nonce",
                             json={"address": address})
    assert nonce_resp.status_code == 200, nonce_resp.text
    message = nonce_resp.json()["message"]
    sig = acct.sign_message(encode_defunct(text=message)).signature.hex()
    verify = client.post("/api/v1/auth/verify",
                         json={"address": address,
                               "signature": "0x" + sig.removeprefix("0x")})
    assert verify.status_code == 200, verify.text
    return address, verify.json()["token"]


class TestHealth:
    def test_healthz(self, client):
        r = client.get("/healthz")
        assert r.status_code == 200
        assert r.json()["database"] == "ok"

    def test_readyz(self, client):
        assert client.get("/readyz").json() == {"ready": True}


class TestAuth:
    def test_full_wallet_auth_flow(self, client):
        address, token = _sign_in(client)
        assert token
        profile = client.get(f"/api/v1/users/{address}")
        assert profile.status_code == 200

    def test_wrong_signer_rejected(self, client):
        victim = Account.create()
        attacker = Account.create()
        nonce = client.post("/api/v1/auth/nonce",
                            json={"address": victim.address.lower()}).json()
        sig = attacker.sign_message(
            encode_defunct(text=nonce["message"])).signature.hex()
        r = client.post("/api/v1/auth/verify",
                        json={"address": victim.address.lower(),
                              "signature": "0x" + sig.removeprefix("0x")})
        assert r.status_code == 401

    def test_nonce_single_use(self, client):
        acct = Account.create()
        address = acct.address.lower()
        nonce = client.post("/api/v1/auth/nonce",
                            json={"address": address}).json()
        sig = acct.sign_message(
            encode_defunct(text=nonce["message"])).signature.hex()
        payload = {"address": address, "signature": "0x" + sig.removeprefix("0x")}
        assert client.post("/api/v1/auth/verify", json=payload).status_code == 200
        assert client.post("/api/v1/auth/verify", json=payload).status_code == 401


class TestMirrors:
    def _bounty_payload(self, chain_id=1):
        return {
            "chain_bounty_id": chain_id,
            "title": "Fix wallet approval UX at the root",
            "spec_text": "Improve the wallet transaction confirmation flow "
                         "so users stop approving malicious transactions.",
            "true_problem_text": "",
            "category": "UX",
            "tags": ["wallet", "security"],
            "reward_escrow": "10000000000000000000",
            "deadline_note": "2026-08-17",
        }

    def test_mirror_requires_auth(self, client):
        r = client.post("/api/v1/bounties", json=self._bounty_payload())
        assert r.status_code == 401

    def test_mirror_and_list(self, client):
        _, token = _sign_in(client)
        headers = {"Authorization": f"Bearer {token}"}
        r = client.post("/api/v1/bounties", json=self._bounty_payload(),
                        headers=headers)
        assert r.status_code == 201, r.text
        listing = client.get("/api/v1/bounties").json()
        assert listing["total"] == 1
        assert listing["items"][0]["chain_bounty_id"] == 1
        detail = client.get("/api/v1/bounties/1")
        assert detail.status_code == 200
        assert detail.json()["status"] == "OPEN"

    def test_mirror_idempotent(self, client):
        _, token = _sign_in(client)
        headers = {"Authorization": f"Bearer {token}"}
        for _ in range(2):
            r = client.post("/api/v1/bounties", json=self._bounty_payload(),
                            headers=headers)
            assert r.status_code == 201
        assert client.get("/api/v1/bounties").json()["total"] == 1

    def test_search_filter(self, client):
        _, token = _sign_in(client)
        headers = {"Authorization": f"Bearer {token}"}
        client.post("/api/v1/bounties", json=self._bounty_payload(1),
                    headers=headers)
        assert client.get("/api/v1/bounties?q=wallet").json()["total"] == 1
        assert client.get("/api/v1/bounties?q=zebra").json()["total"] == 0
        assert client.get("/api/v1/bounties?status=RESOLVED").json()["total"] == 0

    def test_submission_mirror_flow(self, client):
        _, token = _sign_in(client)
        headers = {"Authorization": f"Bearer {token}"}
        client.post("/api/v1/bounties", json=self._bounty_payload(1),
                    headers=headers)
        sub = {
            "chain_submission_id": 1,
            "chain_bounty_id": 1,
            "title": "Transaction simulation instead of dialogs",
            "rationale": "x" * 120,
            "evidence_url": "https://github.com/example/tx-simulation-poc",
        }
        r = client.post("/api/v1/submissions", json=sub, headers=headers)
        assert r.status_code == 201, r.text
        subs = client.get("/api/v1/bounties/1/submissions").json()
        assert len(subs) == 1
        assert client.get("/api/v1/bounties/1").json()["submission_count"] == 1


class TestProfile:
    def test_update_me(self, client):
        address, token = _sign_in(client)
        headers = {"Authorization": f"Bearer {token}"}
        r = client.patch("/api/v1/users/me", headers=headers,
                         json={"display_name": "Null",
                               "skill_tags": ["zk", "evm"]})
        assert r.status_code == 200
        assert r.json()["display_name"] == "Null"
        public = client.get(f"/api/v1/users/{address}").json()
        assert public["skill_tags"] == ["zk", "evm"]

    def test_leaderboard_empty_ok(self, client):
        assert client.get("/api/v1/leaderboard").json() == []
