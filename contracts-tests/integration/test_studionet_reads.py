"""Integration smoke tests against the DEPLOYED StudioNet contract.

These hit the live network (read-only) and are skipped automatically when
the network is unreachable. Run:  .venv/bin/pytest contracts-tests/integration/ -v
"""

import pytest

CONTRACT = "0x79F636e231D22ffFAE68c4FB9e69223287a5D2C4"


@pytest.fixture(scope="module")
def client():
    try:
        from genlayer_py import create_client
        from genlayer_py.chains import studionet
        c = create_client(chain=studionet)
        # probe connectivity with a cheap read
        c.read_contract(address=CONTRACT, function_name="get_config", args=[])
        return c
    except Exception as exc:  # noqa: BLE001
        pytest.skip(f"StudioNet unreachable: {exc}")


def _read(client, fn, args=None):
    return client.read_contract(address=CONTRACT, function_name=fn,
                                args=args or [])


def test_config_matches_protocol(client):
    cfg = _read(client, "get_config")
    assert cfg["winner_share_bps"] == 8500
    assert cfg["win_threshold"] == 55
    assert "REDEFINING" in cfg["tiers"]


def test_platform_stats_shape(client):
    stats = _read(client, "get_platform_stats")
    for key in ("bounties_total", "open_escrow", "unclaimed_rewards",
                "solvers_total"):
        assert key in stats


def test_escrow_invariant_holds(client):
    inv = _read(client, "check_escrow_invariant")
    assert inv["healthy"] is True


def test_pagination_is_consistent(client):
    stats = _read(client, "get_platform_stats")
    page = _read(client, "get_bounty_page", [0, 10])
    assert page["total"] == int(stats["bounties_total"])
    assert len(page["items"]) <= 10
