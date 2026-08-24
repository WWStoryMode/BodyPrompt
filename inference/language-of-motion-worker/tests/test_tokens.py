"""
Reading the motion-token stream.

These exist because the upstream parser fails **silently** on the released text-to-motion
checkpoint — it returns one zero token per part, which is a four-frame motionless body that
raises nothing. The v3 Stage E spike measured 311 upper and 200 lower tokens where upstream
returned `[0]`, for every seed, which made the model look deterministic and frozen when it
was neither. Every test below is a way that could happen again.
"""

from app.tokens import CODEBOOK_SIZE, PARTS_FROM_TEXT, parse_stream, unify


def stream(*tokens: str) -> str:
    return "".join(tokens)


def test_a_real_stream_is_read_in_order():
    text = stream("<upper_id_203>", "<upper_id_48>", "<lower_id_151>", "<upper_id_54>")

    found = parse_stream(text)

    assert found["upper"] == [203, 48, 54]  # order preserved across the interleaving
    assert found["lower"] == [151]


def test_a_text_prompt_produces_no_face_and_no_hand_tokens():
    """Not a failure. The released text-to-motion checkpoint drives two of the model's four
    body parts, so the 33 SMPL-X joints for face and hands are never generated at all."""
    found = parse_stream(stream("<upper_id_1>", "<lower_id_2>"))

    assert found["face"] == []
    assert found["hand"] == []
    assert set(PARTS_FROM_TEXT) == {"upper", "lower"}


def test_structural_markers_are_dropped_not_clamped():
    """Ids at or above the codebook are start/end/pad markers. Clamping one to 255 would
    fabricate a pose out of a punctuation mark."""
    text = stream("<upper_id_256>", "<upper_id_7>", "<upper_id_258>", "<upper_id_255>")

    assert parse_stream(text)["upper"] == [7, 255]


def test_a_stream_with_no_motion_tokens_yields_nothing_rather_than_zero():
    """The exact upstream failure: `[0]` is a real codebook entry and reads as a pose. An
    empty list cannot be mistaken for one."""
    assert parse_stream("I am afraid I cannot do that")["upper"] == []
    assert unify(parse_stream("")) == 0


def test_the_usable_length_is_the_shorter_part():
    """Upper and lower stop at different points. Padding the short one would hold a body
    still while the other kept moving, and that stillness would read as a choice."""
    tokens = {"face": [], "hand": [], "upper": list(range(311)), "lower": list(range(200))}

    assert unify(tokens) == 200


def test_a_part_that_never_spoke_does_not_zero_the_length():
    """face and hand are always empty for text; if they counted, every generation would
    unify to zero frames and the worker would refuse every prompt."""
    tokens = {"face": [], "hand": [], "upper": [1, 2, 3], "lower": [4, 5]}

    assert unify(tokens) == 2


def test_the_codebook_bound_is_configurable_and_enforced():
    assert parse_stream("<upper_id_9>", codebook_size=8)["upper"] == []
    assert parse_stream("<upper_id_7>", codebook_size=8)["upper"] == [7]
    assert CODEBOOK_SIZE == 256
