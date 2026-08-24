import sys

import numpy as np
import pytest
from pydantic import ValidationError

from app.main import (
    MAX_FRAMES,
    MIN_FRAMES,
    UNIT_LENGTH,
    GenerateRequest,
    install_numpy_shim,
    requested_frames,
)


def test_a_short_line_is_raised_to_the_model_s_floor():
    """
    A poem line may be 2 s. SnapMoGen's configured minimum is 128 frames (4.27 s), and
    below it the model does NOT refuse — it returns something. Silence there would mean a
    two-second line quietly answered by motion the model was never asked to make well.
    """
    assert requested_frames(2.0) == MIN_FRAMES
    assert requested_frames(4.27) == MIN_FRAMES


def test_a_long_line_is_held_to_the_model_s_ceiling():
    assert requested_frames(10.0) <= MAX_FRAMES
    assert requested_frames(999.0) == MAX_FRAMES


def test_every_length_is_a_whole_number_of_units():
    """Lengths quantise to multiples of UNIT_LENGTH, so 3.0 s can never be exactly 90."""
    for seconds in (2.0, 3.0, 4.5, 5.0, 6.7, 8.0, 10.0):
        assert requested_frames(seconds) % UNIT_LENGTH == 0


def test_a_poem_is_refused_rather_than_faked():
    """
    SnapMoGen cannot condition a line on the body the previous line left. Generating the
    lines separately and returning them as one motion would be exactly the flattery that
    `segments` and `provenance.multi_prompt` exist to prevent.
    """
    with pytest.raises(ValidationError, match="cannot generate a poem"):
        GenerateRequest(seed=1, lines=[{"prompt": "first", "duration_seconds": 2.0}])


def test_a_request_still_needs_a_prompt():
    with pytest.raises(ValidationError, match="send 'prompt'"):
        GenerateRequest(seed=1)


def test_a_single_prompt_is_accepted_with_the_shared_contract():
    req = GenerateRequest(seed=7, prompt="a body remembers", duration_seconds=6,
                          variants=4, denoising_steps=16)

    assert req.prompt == "a body remembers"
    assert req.variants == 4
    assert req.denoising_steps == 16


def test_the_numpy_shim_makes_the_removed_test_module_importable():
    """
    SnapMoGen imports numpy.core.umath_tests, removed in numpy 1.16 — years before its own
    pinned 1.24.3, so it is broken on their pins too. matrix_multiply is batched matmul.
    """
    sys.modules.pop("numpy.core.umath_tests", None)
    install_numpy_shim()

    import numpy.core.umath_tests as ut

    a = np.random.default_rng(0).normal(size=(4, 3, 3))
    b = np.random.default_rng(1).normal(size=(4, 3, 3))
    assert np.allclose(ut.matrix_multiply(a, b), a @ b)


def test_installing_the_shim_twice_does_not_replace_a_real_module():
    install_numpy_shim()
    first = sys.modules["numpy.core.umath_tests"]
    install_numpy_shim()

    assert sys.modules["numpy.core.umath_tests"] is first


def test_health_says_why_it_is_not_ready_rather_than_just_that_it_is_not(monkeypatch):
    """A worker with no weights must be diagnosable from /health alone.

    torch is a container dependency, not a host one, so it is stubbed: without it `health`
    returns its early "no torch" shape and the test would pass on the wrong branch.
    """
    import types as _types

    from app.main import app, health

    torch_stub = _types.ModuleType("torch")
    torch_stub.cuda = _types.SimpleNamespace(is_available=lambda: True)
    monkeypatch.setitem(sys.modules, "torch", torch_stub)

    app.state.load_error = "RuntimeError: SnapMoGen is not set up: missing /meta/mean.npy"
    report = health()

    assert report["ready"] is False
    assert "not set up" in report["error"]
    assert report["model_version"] == "SnapMoGen-MoMaskPlus"
    # The length rules are part of the contract, so a caller can see them without guessing.
    assert (report["min_frames"], report["max_frames"]) == (MIN_FRAMES, MAX_FRAMES)
