"""
The worker's contract, checked without a GPU.

`torch` is not a host dependency, so `health()` would otherwise return its early "no torch"
shape and every assertion below would pass against the wrong branch. The stub is what makes
these tests about the worker rather than about the absence of CUDA — the same fix the
SnapMoGen suite needed for the same reason.
"""

import sys
import types

import pytest

from app.main import MAX_FRAMES, MIN_FRAMES, GenerateRequest, app, health, requested_frames


@pytest.fixture
def no_cuda(monkeypatch):
    torch = types.ModuleType("torch")
    torch.cuda = types.SimpleNamespace(is_available=lambda: False)
    monkeypatch.setitem(sys.modules, "torch", torch)
    return torch


def test_health_declares_that_a_poem_may_not_be_sent_here(no_cuda):
    """A CAPABILITY, not a record of anything that happened. The triptych reads this to
    decide how to ask, so `false` here is what makes it ask line by line."""
    reported = health()

    assert reported["can_stitch_poems"] is False
    assert reported["model_version"] == "LanguageOfMotion-T2M-v1"
    assert reported["ready"] is False  # no CUDA in this fixture


def test_health_names_what_is_missing_rather_than_hiding_it(no_cuda):
    """SMPL-X is behind a registration a human has to pass. An operator should learn that
    from /health, not from a FileNotFoundError raised inside smplx."""
    missing = health()["missing"]

    assert any("SMPL-X" in item for item in missing)
    assert all("(" in item for item in missing)  # every entry names the path it wanted


def test_a_poem_is_refused_with_a_reason_not_a_500():
    with pytest.raises(ValueError, match="cannot generate a poem"):
        GenerateRequest(lines=[{"prompt": "one"}], seed=1)


def test_a_request_with_no_prompt_is_refused():
    with pytest.raises(ValueError, match="prompt is required"):
        GenerateRequest(seed=1)


def test_a_seed_is_required_because_the_motion_must_be_able_to_name_it():
    with pytest.raises(Exception):
        GenerateRequest(prompt="move")


def test_durations_clamp_to_what_this_worker_will_serve():
    assert requested_frames(2.0) == MIN_FRAMES
    assert requested_frames(5.0) == 150
    assert requested_frames(10.0) == MAX_FRAMES
    # The instrument's own bounds are 2-10 s; anything outside is still clamped, not obeyed.
    assert requested_frames(0.1) == MIN_FRAMES
    assert requested_frames(60.0) == MAX_FRAMES


def test_the_two_endpoints_the_service_reaches_are_the_only_ones():
    routes = {r.path for r in app.routes if not r.path.startswith("/openapi")}

    assert "/health" in routes
    assert "/generate" in routes
