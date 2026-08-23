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


def test_stub_poem_tiles_its_frames_and_admits_no_model_stitched_it():
    lines = [
        {"prompt": "a body remembers", "duration_seconds": 3.0},
        {"prompt": "a place it cannot return to", "duration_seconds": 5.0},
    ]
    motion = StubGenerator().generate("kimodo", None, lines=lines)

    assert validate_motion(motion) is motion
    assert len(motion["frames"]) == round(8.0 * motion["fps"])
    assert [s["prompt"] for s in motion["segments"]] == [line["prompt"] for line in lines]
    assert motion["segments"][0]["end_frame"] == motion["segments"][1]["start_frame"]
    assert motion["segments"][-1]["transition_frames"] == 0  # nothing follows the last line
    assert motion["stub"] is True
    # `segments` says this is a poem; provenance must still say nothing generated it, or a
    # fixture could pass for a real continuous reading.
    assert motion["provenance"]["multi_prompt"] is None
    assert "variants" not in motion  # the ghost-cloud is a per-line instrument


def test_segments_that_do_not_cover_the_motion_are_rejected():
    motion = StubGenerator().generate("kimodo", "move")
    motion["segments"] = [
        {"index": 0, "prompt": "a", "start_frame": 0, "end_frame": 5,
         "transition_frames": 0, "duration_seconds": 1.0},
    ]

    with pytest.raises(RuntimeError, match="segments cover 5 frames"):
        validate_motion(motion)


def test_a_gap_between_segments_is_rejected():
    motion = StubGenerator().generate("kimodo", "move")
    total = len(motion["frames"])
    motion["segments"] = [
        {"index": 0, "prompt": "a", "start_frame": 0, "end_frame": 5,
         "transition_frames": 0, "duration_seconds": 1.0},
        {"index": 1, "prompt": "b", "start_frame": 9, "end_frame": total,
         "transition_frames": 0, "duration_seconds": 1.0},
    ]

    with pytest.raises(RuntimeError, match="expected 5"):
        validate_motion(motion)


def test_poem_request_reaches_the_worker_as_lines_not_a_prompt():
    from app.generators import KimodoGenerator

    generator = KimodoGenerator()
    sent = {}

    def capture(path, payload=None):
        sent.update(payload or {})
        return StubGenerator().generate("kimodo", "move")

    generator._json = capture
    lines = [{"prompt": "first", "duration_seconds": 2.0},
             {"prompt": "second", "duration_seconds": 2.0}]
    motion = generator.generate("kimodo", None, lines=lines, transition_frames=7)

    assert sent["lines"] == lines
    assert sent["transition_frames"] == 7
    assert "prompt" not in sent  # the worker rejects a request carrying both
    assert motion["prompt"] == "first\nsecond"


def test_provenance_says_whether_the_model_really_stitched_the_poem():
    from app.generators import KimodoGenerator

    generator = KimodoGenerator()
    worker_motion = StubGenerator().generate("kimodo", "move")
    worker_motion["multi_prompt"] = True
    worker_motion["transition_frames"] = 5

    generator._json = lambda path, payload=None: worker_motion
    motion = generator.generate(
        "kimodo", None, lines=[{"prompt": "x", "duration_seconds": 2.0}]
    )

    assert motion["provenance"]["multi_prompt"] is True
    assert motion["provenance"]["transition_frames"] == 5
    assert "multi_prompt" not in motion  # provenance, not loose beside the motion
