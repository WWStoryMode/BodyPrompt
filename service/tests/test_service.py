from copy import deepcopy

import httpx
import pytest
from fastapi import HTTPException

from app import main
from app.generators import StubGenerator
from app.validation import validate_motion


def test_stub_reports_fixture_provenance_and_non_nesting_variants():
    motion = StubGenerator().generate(
        "snapmogen", "a body remembers", variants=4, duration_seconds=5
    )

    assert motion["stub"] is True
    assert motion["provenance"]["source"] == "fixture"
    assert len(motion["variants"]) == 3
    assert all("variants" not in sibling for sibling in motion["variants"])
    assert validate_motion(motion) is motion


def test_kimodo_provenance_records_what_the_worker_did_not_what_was_asked():
    from app.generators import KimodoGenerator

    generator = KimodoGenerator()
    worker_motion = StubGenerator().generate("kimodo", "move")
    worker_motion["post_processing"] = False  # the worker's own report

    generator._json = lambda path, payload=None: worker_motion
    motion = generator.generate("kimodo", "move", post_processing=True)

    assert motion["provenance"]["post_processing"] is False
    assert "post_processing" not in motion  # it belongs in provenance, not beside it


def test_fixture_provenance_says_post_processing_never_applied():
    motion = StubGenerator().generate("snapmogen", "move", post_processing=True)

    assert motion["provenance"]["post_processing"] is None
    assert motion["provenance"]["denoising_steps"] is None


def test_provenance_records_the_steps_the_worker_used_not_the_request():
    """A request of None resolves to the worker's configured default. Step count shifts
    the motion by a real fraction of sibling variance, so the record must name the number
    that produced this motion, never the absence of a request."""
    from app.generators import KimodoGenerator

    generator = KimodoGenerator()
    worker_motion = StubGenerator().generate("kimodo", "move")
    worker_motion["denoising_steps"] = 75  # what the worker resolved it to

    generator._json = lambda path, payload=None: worker_motion
    motion = generator.generate("kimodo", "move", denoising_steps=None)

    assert motion["provenance"]["denoising_steps"] == 75
    assert "denoising_steps" not in motion  # provenance, not loose beside the motion


def test_requested_steps_reach_the_worker():
    from app.generators import KimodoGenerator

    generator = KimodoGenerator()
    sent = {}

    def capture(path, payload=None):
        sent.update(payload or {})
        return StubGenerator().generate("kimodo", "move")

    generator._json = capture
    generator.generate("kimodo", "move", denoising_steps=25)

    assert sent["denoising_steps"] == 25


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_generate_validates_request_before_backend():
    transport = httpx.ASGITransport(app=main.app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        assert (await client.post("/generate", json={
            "model": "kimodo", "prompt": "", "duration_seconds": 5, "variants": 1,
        })).status_code == 422
        assert (await client.post("/generate", json={
            "model": "kimodo", "prompt": "move", "duration_seconds": 11, "variants": 1,
        })).status_code == 422
        assert (await client.post("/generate", json={
            "model": "kimodo", "prompt": "move", "duration_seconds": 5, "variants": 5,
        })).status_code == 422


def test_invalid_backend_motion_becomes_service_error(monkeypatch):
    fixture = StubGenerator().generate("snapmogen", "move")
    broken = deepcopy(fixture)
    broken["frames"][0]["positions"] = broken["frames"][0]["positions"][:-1]

    monkeypatch.setattr(main.GENERATOR, "generate", lambda *args, **kwargs: broken)

    with pytest.raises(HTTPException) as raised:
        main.generate(main.GenerateRequest(model="snapmogen", prompt="move"))

    assert raised.value.status_code == 503
    assert "invalid canonical motion" in raised.value.detail


def test_health_describes_model_sources():
    capabilities = main.health()["capabilities"]
    assert {item["model"] for item in capabilities} == {
        "kimodo", "snapmogen", "language-of-motion"
    }
