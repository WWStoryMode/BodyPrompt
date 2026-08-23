"""The text-embedding cache is a speed-up, so its failure mode matters more than its
success one: a worker that cannot cache must still generate, and must say so.
"""

import sys
import types

import pytest

from app import main


class FakeEncoder:
    def __call__(self, texts):
        return ("features", [len(texts)])


class FakeModel:
    def __init__(self):
        self.text_encoder = FakeEncoder()


class FakeCachedEncoder:
    def __init__(self, encoder, *, model_name):
        self.encoder = encoder
        self.model_name = model_name


def test_cache_wraps_the_encoder_it_was_given(monkeypatch):
    monkeypatch.setattr(main, "_cached_text_encoder_class", lambda: FakeCachedEncoder)
    model = FakeModel()
    inner = model.text_encoder

    assert main._enable_embedding_cache(model) == "on"
    assert isinstance(model.text_encoder, FakeCachedEncoder)
    assert model.text_encoder.encoder is inner
    assert model.text_encoder.model_name == main.MODEL_VERSION


def test_a_missing_cache_leaves_the_encoder_working_and_reports_why(monkeypatch):
    # Kimodo keeps this class in a private demo submodule; a version bump could move it.
    def unavailable():
        raise ImportError("no module named kimodo.demo.embedding_cache")

    monkeypatch.setattr(main, "_cached_text_encoder_class", unavailable)
    model = FakeModel()

    state = main._enable_embedding_cache(model)

    assert state.startswith("off: ImportError")
    assert isinstance(model.text_encoder, FakeEncoder)  # still generates, only slower


def test_a_model_without_a_text_encoder_is_reported_not_crashed():
    class Bare:
        pass

    assert main._enable_embedding_cache(Bare()) == "off: model exposes no text_encoder"


def test_health_reports_the_cache_state(monkeypatch):
    # /health is where the worker admits what it is actually doing; the cache belongs there
    # beside the encoder device, or a silent fallback would look like a fast run gone slow.
    # torch and kimodo are stubbed because this test machine has neither — health() reports
    # their absence before it reports anything else, which is correct but not what is
    # under test here.
    torch = types.ModuleType("torch")
    torch.cuda = types.SimpleNamespace(is_available=lambda: True)
    monkeypatch.setitem(sys.modules, "torch", torch)
    monkeypatch.setitem(sys.modules, "kimodo", types.ModuleType("kimodo"))
    monkeypatch.setattr(main, "EMBEDDING_CACHE_STATE", "off: ImportError: gone")

    assert main.health()["text_embedding_cache"] == "off: ImportError: gone"


def test_health_admits_a_missing_runtime_before_anything_else():
    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setitem(sys.modules, "kimodo", None)  # importing None raises ImportError
    try:
        report = main.health()
    finally:
        monkeypatch.undo()

    assert report["ok"] is False
    assert report["ready"] is False
