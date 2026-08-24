"""
Reading the language model's motion tokens.

Language of Motion generates motion as **text**: the T5 decoder emits a stream like
`<upper_id_203><upper_id_48><lower_id_151>…`, one token per four frames per body part, and
those ids index the VQ codebooks.

## Why this exists instead of upstream's parser

`lom/archs/lom.py::motion_string_to_compositional_token` cannot read the released
text-to-motion checkpoint, and it fails **silently**. It looks for a `<motion_id_0>` … 
`<motion_id_1>` wrapper; when `content.index()` raises, its helper returns a *sentinel
string* which the caller then matches, sending it down a second path that looks for
per-part `<upper_id_256>` block delimiters. The checkpoint emits neither. Both lookups miss,
and the result is **one token of value 0 per part** — a four-frame motionless body that
raises nothing and looks like an answer.

Measured on `Instruct_Mixed_T2M_LM.ckpt` (v3 Stage E spike, 2026-08-24): the model produced
311 upper and 200 lower tokens for one prompt, and upstream's parser returned `[0]` for
every part, for every seed. It made the model look deterministic *and* frozen; it was
neither.

So this module reads the stream directly, which is what upstream's own fallback branch
intends once it has an inner string. Nothing here is cleverer than upstream — it is the same
extraction without the wrapper requirement.
"""

from __future__ import annotations

import re

#: Every codebook in this model is 256 entries wide.
CODEBOOK_SIZE = 256

#: The four body parts the model decomposes into. Face and hands are named here because the
#: stream can carry them, not because text-to-motion ever produces them — see `PARTS_FROM_TEXT`.
PARTS = ("face", "hand", "upper", "lower")

#: What a text prompt actually yields. The audio path drives all four; text drives two, and
#: that is a fact about the training data rather than a failure of a given prompt.
PARTS_FROM_TEXT = ("upper", "lower")

_TOKEN = re.compile(r"<(face|hand|upper|lower)_id_(\d+)>")


def parse_stream(text: str, codebook_size: int = CODEBOOK_SIZE) -> dict[str, list[int]]:
    """
    Pull each part's token sequence out of the generated string, in emission order.

    Ids at or above `codebook_size` are the model's structural markers (start, end, pad),
    not codebook entries. They are dropped rather than clamped: clamping would fabricate a
    pose out of a punctuation mark, and upstream's own decode path clamps only *after*
    deciding what is motion.

    The parts interleave in the stream and their sequences come back at different lengths.
    That is expected — `unify` decides what to do about it, out here where the choice is
    visible.
    """
    found: dict[str, list[int]] = {part: [] for part in PARTS}
    for part, value in _TOKEN.findall(text):
        index = int(value)
        if 0 <= index < codebook_size:
            found[part].append(index)
    return found


def unify(tokens: dict[str, list[int]]) -> int:
    """
    How many tokens of each part are usable together: the shortest of the parts that spoke.

    Upper and lower are decoded independently and stop at different points, so one of them
    always outlasts the other. Taking the shorter is the only choice that never invents a
    frame — padding the short one would hold a body still while the other kept moving, and
    calling that the model's output would be a claim nobody made.
    """
    lengths = [len(tokens[part]) for part in PARTS_FROM_TEXT if tokens[part]]
    return min(lengths) if lengths else 0
