"""The poem path's traps are all silent ones: Kimodo drops lines rather than complaining.

Kimodo zips `prompts` against `num_frames`, broadcasts a bare int across `num_samples`
instead of across prompts, and iterates a bare string per character. None of those raise —
they just generate the wrong poem. These tests pin the checks that turn them into errors.
"""

import pytest
from pydantic import ValidationError

from app.main import FPS, GenerateRequest, Line, _segments


def poem(**kwargs) -> GenerateRequest:
    defaults = {
        "seed": 42,
        "lines": [
            {"prompt": "a body remembers", "duration_seconds": 3.0},
            {"prompt": "a place it cannot return to", "duration_seconds": 5.0},
        ],
    }
    return GenerateRequest(**{**defaults, **kwargs})


def test_segments_tile_the_motion_exactly():
    lines = [Line(prompt="first", duration_seconds=3.0),
             Line(prompt="second", duration_seconds=5.0),
             Line(prompt="third", duration_seconds=2.0)]

    segments = _segments(lines, transition_frames=5)

    assert [s["start_frame"] for s in segments] == [0, 90, 240]
    assert [s["end_frame"] for s in segments] == [90, 240, 300]
    assert segments[-1]["end_frame"] == sum(round(l.duration_seconds * FPS) for l in lines)
    assert [s["prompt"] for s in segments] == ["first", "second", "third"]


def test_the_last_line_has_nothing_to_transition_into():
    segments = _segments([Line(prompt="a"), Line(prompt="b")], transition_frames=5)

    assert segments[0]["transition_frames"] == 5
    assert segments[1]["transition_frames"] == 0


def test_a_request_is_one_phrase_or_a_poem_never_both():
    with pytest.raises(ValidationError, match="not both and not neither"):
        GenerateRequest(seed=1, prompt="move", lines=[{"prompt": "a"}])


def test_a_request_with_neither_is_rejected():
    with pytest.raises(ValidationError, match="not both and not neither"):
        GenerateRequest(seed=1)


def test_the_ghost_cloud_is_refused_for_a_poem():
    # Kimodo cannot re-roll one line alone, and four readings of a poem cost minutes.
    with pytest.raises(ValidationError, match="not to a poem"):
        poem(variants=4)


def test_the_field_bounds_keep_a_transition_shorter_than_its_line():
    """Kimodo slices the overlap off each segment, and an overlap longer than the segment
    corrupts that slicing silently rather than raising. The request model guards against
    it, but the guard cannot currently fire: the shortest allowed line is longer than the
    longest allowed transition. This pins that relationship, so if either bound moves the
    guard becomes live rather than the trap reopening unnoticed."""
    shortest_line = GenerateRequest.model_fields["duration_seconds"].metadata[0].ge * FPS
    longest_transition = GenerateRequest.model_fields["transition_frames"].metadata[1].le

    assert longest_transition < shortest_line


def test_an_empty_poem_is_rejected():
    with pytest.raises(ValidationError):
        GenerateRequest(seed=1, lines=[])


def test_a_line_with_no_prompt_is_rejected():
    with pytest.raises(ValidationError):
        GenerateRequest(seed=1, lines=[{"prompt": "", "duration_seconds": 2.0}])


def test_a_single_prompt_request_still_works_untouched():
    req = GenerateRequest(seed=1, prompt="a body remembers", variants=4)

    assert req.lines is None
    assert req.variants == 4
