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
