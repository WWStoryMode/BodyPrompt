from copy import deepcopy

import httpx
import pytest
from fastapi import HTTPException

from app import main
from app.generators import StubGenerator
from app.providers import GenerationRequest, WorkerProvider
from app.validation import validate_motion


def worker(**kwargs) -> WorkerProvider:
    """A worker provider with no worker behind it — tests supply `_json` themselves.

    The provenance rules these tests pin used to live in `KimodoGenerator`. They moved to
    `WorkerProvider` when hosting was split from routing; the rules did not change, only
    the class that keeps them, so the assertions below are the v1 assertions verbatim.
    """
    return WorkerProvider("kimodo", "http://worker.test:8010", **kwargs)


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
    provider = worker()
    worker_motion = StubGenerator().generate("kimodo", "move")
    worker_motion["post_processing"] = False  # the worker's own report

    provider._json = lambda path, payload=None: worker_motion
    motion = provider.generate(
        GenerationRequest(model="kimodo", prompt="move", post_processing=True)
    )

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
    provider = worker()
    worker_motion = StubGenerator().generate("kimodo", "move")
    worker_motion["denoising_steps"] = 75  # what the worker resolved it to

    provider._json = lambda path, payload=None: worker_motion
    motion = provider.generate(
        GenerationRequest(model="kimodo", prompt="move", denoising_steps=None)
    )

    assert motion["provenance"]["denoising_steps"] == 75
    assert "denoising_steps" not in motion  # provenance, not loose beside the motion


def test_requested_steps_reach_the_worker():
    provider = worker()
    sent = {}

    def capture(path, payload=None):
        sent.update(payload or {})
        return StubGenerator().generate("kimodo", "move")

    provider._json = capture
    provider.generate(GenerationRequest(model="kimodo", prompt="move", denoising_steps=25))

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
    provider = worker()
    sent = {}

    def capture(path, payload=None):
        sent.update(payload or {})
        return StubGenerator().generate("kimodo", "move")

    provider._json = capture
    lines = [{"prompt": "first", "duration_seconds": 2.0},
             {"prompt": "second", "duration_seconds": 2.0}]
    motion = provider.generate(
        GenerationRequest(model="kimodo", lines=lines, transition_frames=7)
    )

    assert sent["lines"] == lines
    assert sent["transition_frames"] == 7
    assert "prompt" not in sent  # the worker rejects a request carrying both
    assert motion["prompt"] == "first\nsecond"


def test_provenance_says_whether_the_model_really_stitched_the_poem():
    provider = worker()
    worker_motion = StubGenerator().generate("kimodo", "move")
    worker_motion["multi_prompt"] = True
    worker_motion["transition_frames"] = 5

    provider._json = lambda path, payload=None: worker_motion
    motion = provider.generate(
        GenerationRequest(model="kimodo", lines=[{"prompt": "x", "duration_seconds": 2.0}])
    )

    assert motion["provenance"]["multi_prompt"] is True
    assert motion["provenance"]["transition_frames"] == 5
    assert "multi_prompt" not in motion  # provenance, not loose beside the motion


# ---- the provider split (v3 stage A) ----------------------------------------
#
# Where a model lives, which model a request goes to, and whether that model is real used
# to be one class with the answers written into it. These pin the seams.

import json as _json
import os
import threading
import time as _time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from app.generators import KNOWN_MODELS, RouterGenerator, UnknownModel, make_generator
from app.providers import FixtureProvider, infer_hosting


def build(monkeypatch, **env) -> RouterGenerator:
    """A router built from a clean environment — nothing inherited from the shell."""
    for key in list(os.environ):
        if key.startswith("BODYPROMPT_"):
            monkeypatch.delenv(key, raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)
    return make_generator()


def test_every_known_model_is_present_even_when_nothing_is_configured(monkeypatch):
    router = build(monkeypatch)

    # The dropdown must never have a silent hole in it: a model with no configuration is a
    # fixture that says so, not an absence.
    assert {c["model"] for c in router.capabilities()} == set(KNOWN_MODELS)
    assert all(c["source"] == "fixture" for c in router.capabilities())
    assert router.ml is False


def test_a_model_becomes_real_by_configuration_alone(monkeypatch):
    router = build(monkeypatch, BODYPROMPT_MODEL_KIMODO="http://kimodo-worker:8010")

    assert router.provider_for("kimodo").source == "kimodo"
    assert isinstance(router.provider_for("snapmogen"), FixtureProvider)
    # One real model is enough to make the service one that runs models.
    assert router.ml is True


def test_capabilities_say_where_each_model_lives(monkeypatch):
    router = build(
        monkeypatch,
        BODYPROMPT_MODEL_KIMODO="http://kimodo-worker:8010",
        BODYPROMPT_MODEL_SNAPMOGEN="https://gpu.example.com/snapmogen",
    )
    hosting = {c["model"]: c["hosting"] for c in router.capabilities()}

    assert hosting["kimodo"] == "local"          # a compose service name has no dots
    assert hosting["snapmogen"] == "remote"
    assert hosting["language-of-motion"] == "in-process"


def test_hosting_can_be_overridden_when_the_guess_is_wrong(monkeypatch):
    # The dotted-host rule is a heuristic, so it must be possible to say otherwise.
    assert infer_hosting("http://my.gpu.box:8010") == "remote"
    router = build(
        monkeypatch,
        BODYPROMPT_MODEL_KIMODO="http://my.gpu.box:8010",
        BODYPROMPT_MODEL_KIMODO_HOSTING="local",
    )

    assert router.provider_for("kimodo").hosting == "local"
    assert router.provider_for("kimodo").concurrency == 1  # follows the hosting


def test_an_unknown_model_is_a_bad_request_not_a_broken_service(monkeypatch):
    router = build(monkeypatch)

    with pytest.raises(UnknownModel):
        router.generate("no-such-model", "move")

    # And the endpoint says 422, not 503: retrying will never make this work.
    monkeypatch.setattr(main, "GENERATOR", router)
    with pytest.raises(HTTPException) as raised:
        main.generate(main.GenerateRequest(model="no-such-model", prompt="move"))
    assert raised.value.status_code == 422


def test_the_legacy_backend_variable_still_selects_kimodo(monkeypatch):
    # Every existing doc and compose file says BODYPROMPT_BACKEND=kimodo. It keeps working.
    router = build(
        monkeypatch,
        BODYPROMPT_BACKEND="kimodo",
        BODYPROMPT_KIMODO_URL="http://kimodo-worker:8010",
    )

    assert router.provider_for("kimodo").source == "kimodo"
    assert router.provider_for("snapmogen").source == "fixture"


def test_being_explicit_beats_the_legacy_variable(monkeypatch):
    router = build(
        monkeypatch,
        BODYPROMPT_BACKEND="kimodo",
        BODYPROMPT_KIMODO_URL="http://old:8010",
        BODYPROMPT_MODEL_KIMODO="http://new:8010",
    )

    assert router.provider_for("kimodo")._url == "http://new:8010"


class _FakeWorker(BaseHTTPRequestHandler):
    """The smallest thing that behaves like a worker. Records what it was sent."""

    seen: dict = {}

    def _reply(self, body: dict) -> None:
        payload = _json.dumps(body).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def do_GET(self):  # noqa: N802 - http.server's spelling
        self._reply({"ok": True, "ready": True, "model_version": "fake-worker/v9"})

    def do_POST(self):  # noqa: N802
        length = int(self.headers.get("content-length", 0))
        _FakeWorker.seen = {
            "payload": _json.loads(self.rfile.read(length)),
            "authorization": self.headers.get("authorization"),
        }
        self._reply(StubGenerator().generate("kimodo", "move"))

    def log_message(self, *args):  # keep pytest output clean
        pass


def test_a_remote_worker_is_reached_over_http_and_carries_its_token():
    """
    The remote path, proven against a real socket rather than a promise.

    Local and remote are the same class, so this also re-proves the local transport. What
    is remote-specific is the bearer token, and that a worker's OWN reported model version
    reaches provenance — the service must never state which checkpoint ran somewhere else.
    """
    server = ThreadingHTTPServer(("127.0.0.1", 0), _FakeWorker)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        url = f"http://127.0.0.1:{server.server_address[1]}"
        provider = WorkerProvider("kimodo", url, token="s3cret", hosting="remote")

        assert provider.ready() is True
        motion = provider.generate(
            GenerationRequest(model="kimodo", prompt="move", denoising_steps=25)
        )
    finally:
        server.shutdown()

    assert _FakeWorker.seen["authorization"] == "Bearer s3cret"
    assert _FakeWorker.seen["payload"]["denoising_steps"] == 25
    assert motion["provenance"]["model_version"] == "fake-worker/v9"
    assert motion["provenance"]["hosting"] == "remote"
    assert motion["stub"] is False


def test_a_local_provider_runs_one_generation_at_a_time():
    """
    One local GPU serves one generation at a time.

    The triptych asks for three models at once and should keep doing so — that is right
    against three remote endpoints, and the browser has no business knowing where the
    models are today. So the limit is enforced where the answer is known.
    """
    peak = 0
    live = 0
    lock = threading.Lock()

    class _Slow:
        model = source = "kimodo"
        hosting = "local"
        concurrency = 1

        def ready(self):
            return True

        def describe(self):
            return {"model": self.model, "source": self.source, "ready": True}

        def generate(self, req):
            nonlocal peak, live
            with lock:
                live += 1
                peak = max(peak, live)
            _time.sleep(0.05)
            with lock:
                live -= 1
            return StubGenerator().generate("kimodo", "move")

    router = RouterGenerator({"kimodo": _Slow()})
    threads = [
        threading.Thread(target=router.generate, args=("kimodo", "move")) for _ in range(4)
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert peak == 1


def test_the_router_chooses_a_seed_so_the_motion_can_name_it():
    """A seed of None means "pick one" — but the motion must be able to say which one."""
    seen = []

    class _Recording:
        model = source = "kimodo"
        hosting = "local"
        concurrency = 1

        def ready(self):
            return True

        def describe(self):
            return {}

        def generate(self, req):
            seen.append(req.seed)
            return StubGenerator().generate("kimodo", "move")

    router = RouterGenerator({"kimodo": _Recording()})
    router.generate("kimodo", "move", seed=None)
    router.generate("kimodo", "move", seed=7)

    assert isinstance(seen[0], int)  # decided here, not left to the worker
    assert seen[1] == 7              # an explicit seed is never overridden
