import json
import os
import time
from copy import deepcopy

import httpx
import pytest
from fastapi import HTTPException

from app import main
from app.generators import StubGenerator
from app.providers import GenerationRequest, WorkerProvider
from app.store import MotionStore, key_for
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

import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from app.generators import KNOWN_MODELS, RouterGenerator, UnknownModel, make_generator
from app.providers import FixtureProvider, infer_hosting


def build(monkeypatch, **env) -> RouterGenerator:
    """A router built from a clean environment — nothing inherited from the shell."""
    for key in list(os.environ):
        if key.startswith("BODYPROMPT_"):
            monkeypatch.delenv(key, raising=False)
    # Remembering is on by default, and these tests are about routing. A test that wants a
    # store passes one in; nothing here should write motions into the repository.
    monkeypatch.setenv("BODYPROMPT_STORE_DIR", "off")
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
        payload = json.dumps(body).encode()
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
            "payload": json.loads(self.rfile.read(length)),
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
            time.sleep(0.05)
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


# ---------------------------------------------------------------------------
# Remembering — v3 Stage C.
#
# The rule these pin: a stored motion is THE SAME GENERATION, served again. The store may
# save the GPU time; it may never redescribe the motion as having been cheaper than it was.
# ---------------------------------------------------------------------------


class _Provider:
    """A provider that counts its calls, and can be made to fail like a worker that is down."""

    model = source = "kimodo"
    hosting = "local"
    concurrency = 1

    def __init__(self, *, fails: bool = False) -> None:
        self.calls = 0
        self.fails = fails

    def ready(self) -> bool:
        return not self.fails

    def describe(self) -> dict:
        return {"model": self.model, "source": self.source, "ready": self.ready()}

    def generate(self, req: GenerationRequest) -> dict:
        self.calls += 1
        if self.fails:
            raise RuntimeError("kimodo worker unavailable at http://worker.test:8010")
        motion = StubGenerator().generate("kimodo", req.prompt or "move")
        motion["seed"] = req.seed
        # What a real worker reports: a duration, and the moment it happened.
        motion["provenance"]["source"] = "kimodo"
        motion["provenance"]["inference_ms"] = 41_000
        return motion


def _router(tmp_path, provider=None, **store_kwargs):
    provider = provider or _Provider()
    router = RouterGenerator(
        {"kimodo": provider}, store=MotionStore(tmp_path, **store_kwargs)
    )
    return router, provider


def test_a_seeded_request_is_answered_from_the_store_the_second_time(tmp_path):
    router, provider = _router(tmp_path)

    first = router.generate("kimodo", "a body remembers", seed=7)
    second = router.generate("kimodo", "a body remembers", seed=7)

    assert provider.calls == 1  # the model ran once
    assert second["frames"] == first["frames"]
    assert second["provenance"]["served_from_store"] is True
    assert first["provenance"]["served_from_store"] is False


def test_serving_from_the_store_never_redescribes_how_long_the_model_took(tmp_path):
    """The lie this forbids is the flattering one: a replay reading as a fast generation."""
    router, _ = _router(tmp_path)

    first = router.generate("kimodo", "move", seed=7)
    second = router.generate("kimodo", "move", seed=7)

    assert second["provenance"]["inference_ms"] == first["provenance"]["inference_ms"]
    assert second["provenance"]["generated_at"] == first["provenance"]["generated_at"]
    # The one thing that IS new: when this copy was handed over.
    assert second["provenance"]["served_at"] >= second["provenance"]["generated_at"]
    assert "served_at" not in first["provenance"]


def test_a_motion_replays_with_the_worker_down(tmp_path):
    """Remembering is not hosting. This is the whole point of the stage, in one test."""
    store = MotionStore(tmp_path)
    live = RouterGenerator({"kimodo": _Provider()}, store=store)
    live.generate("kimodo", "a body remembers a place", seed=7)

    dead_worker = _Provider(fails=True)
    later = RouterGenerator({"kimodo": dead_worker}, store=MotionStore(tmp_path))

    replayed = later.generate("kimodo", "a body remembers a place", seed=7)

    assert replayed["provenance"]["served_from_store"] is True
    assert dead_worker.calls == 0
    assert validate_motion(replayed) is replayed
    # And the worker really is down — anything not remembered still fails honestly.
    with pytest.raises(RuntimeError):
        later.generate("kimodo", "something never generated", seed=7)


def test_an_unseeded_request_is_recorded_but_never_served(tmp_path):
    """No seed means "roll again". A store that answered it would falsify the ghost-cloud."""
    router, provider = _router(tmp_path)

    router.generate("kimodo", "move", seed=None)
    router.generate("kimodo", "move", seed=None)

    assert provider.calls == 2
    assert router.store.stats()["entries"] == 2  # both kept, neither served


def test_the_key_splits_on_everything_that_decides_the_motion():
    base = GenerationRequest(model="kimodo", prompt="move", seed=7)
    variations = [
        GenerationRequest(model="snapmogen", prompt="move", seed=7),
        GenerationRequest(model="kimodo", prompt="move slowly", seed=7),
        GenerationRequest(model="kimodo", prompt="move", seed=8),
        GenerationRequest(model="kimodo", prompt="move", seed=7, variants=4),
        GenerationRequest(model="kimodo", prompt="move", seed=7, duration_seconds=7.0),
        GenerationRequest(model="kimodo", prompt="move", seed=7, denoising_steps=75),
        GenerationRequest(model="kimodo", prompt="move", seed=7, post_processing=False),
    ]

    keys = {key_for(base)} | {key_for(request) for request in variations}
    assert len(keys) == len(variations) + 1


def test_the_key_ignores_a_control_the_request_could_not_have_used():
    """`transition_frames` means nothing to a single prompt; splitting on it would mean two
    identical requests missing each other over a number neither of them used."""
    a = GenerationRequest(model="kimodo", prompt="move", seed=7, transition_frames=5)
    b = GenerationRequest(model="kimodo", prompt="move", seed=7, transition_frames=20)
    assert key_for(a) == key_for(b)

    lines = [{"prompt": "one", "duration_seconds": 3.0}]
    poem_a = GenerationRequest(model="kimodo", lines=lines, seed=7, duration_seconds=5.0)
    poem_b = GenerationRequest(model="kimodo", lines=lines, seed=7, duration_seconds=9.0)
    assert key_for(poem_a) == key_for(poem_b)  # a poem's lines carry their own durations
    # …but the transition between its lines is real, and does split.
    poem_c = GenerationRequest(model="kimodo", lines=lines, seed=7, transition_frames=20)
    assert key_for(poem_a) != key_for(poem_c)


def test_a_poem_is_remembered_by_its_lines(tmp_path):
    router, provider = _router(tmp_path)
    lines = [
        {"prompt": "a body remembers", "duration_seconds": 3.0},
        {"prompt": "a place it cannot return to", "duration_seconds": 5.0},
    ]

    router.generate("kimodo", None, lines=lines, seed=7)
    router.generate("kimodo", None, lines=deepcopy(lines), seed=7)
    edited = deepcopy(lines)
    edited[1]["prompt"] = "a place it returns to"
    router.generate("kimodo", None, lines=edited, seed=7)

    assert provider.calls == 2  # the identical poem was remembered; the edited one was not
    assert router.store.entries()[0]["lines"] == 2


def test_the_store_outlives_the_process(tmp_path):
    """A reload destroying a forty-second generation is the failure this stage exists for."""
    MotionStore(tmp_path).put(
        "abc", {"frames": [], "seed": 7}, GenerationRequest(model="kimodo", prompt="move")
    )
    assert MotionStore(tmp_path).get("abc") == {"frames": [], "seed": 7}


def test_eviction_drops_what_has_not_been_used(tmp_path):
    store = MotionStore(tmp_path, limit=2)
    request = GenerationRequest(model="kimodo", prompt="move")
    for key in ("aaa", "bbb"):
        store.put(key, {"frames": [], "seed": 1}, request)
    # Age them explicitly rather than trusting two writes to land a filesystem tick apart.
    for key, age in (("aaa", 200), ("bbb", 100)):
        path = tmp_path / f"{key}.json"
        os.utime(path, (time.time() - age, time.time() - age))

    store.get("aaa")  # replaying "aaa" is what makes it worth keeping
    store.put("ccc", {"frames": [], "seed": 1}, request)

    assert store.get("aaa") is not None
    assert store.get("ccc") is not None
    assert store.get("bbb") is None
    assert not (tmp_path / "bbb.meta.json").exists()  # the metadata goes with it


def test_a_store_that_cannot_be_written_disables_itself(tmp_path):
    """Remembering is a convenience. Losing it must never take generation down with it."""
    blocked = tmp_path / "not-a-directory"
    blocked.write_text("")

    store = MotionStore(blocked / "motions")

    assert store.enabled is False
    assert store.error is not None
    assert store.stats() == {"enabled": False, "error": store.error}

    router = RouterGenerator({"kimodo": _Provider()}, store=store)
    motion = router.generate("kimodo", "move", seed=7)
    assert validate_motion(motion) is motion
    assert motion["provenance"]["served_from_store"] is False


def test_the_listing_says_what_is_remembered_without_returning_it(tmp_path):
    router, _ = _router(tmp_path)
    router.generate("kimodo", "a body remembers", seed=7)

    entry = router.store.entries()[0]

    assert entry["model"] == "kimodo"
    assert entry["prompt"] == "a body remembers"
    assert entry["seed"] == 7
    assert entry["frames"] > 0
    assert "frames" not in entry or isinstance(entry["frames"], int)
    assert entry["generated_at"]
    assert "positions" not in json.dumps(entry)  # metadata only, never the motion
