"""Human choices in Psych-101-style transcripts.

A transcript is plain text describing an experiment, with every choice the
person made wrapped in << and >>. Training and evaluation only ever look at
the tokens inside those markers: the model learns to predict what the person
chose, not to write the experiment.
"""
from __future__ import annotations

import re

CHOICE = re.compile(r"<<(.*?)>>", re.S)
IGNORE = -100


def choice_spans(text: str) -> list[tuple[int, int]]:
    """Character spans of each choice's content, without the << >> markers."""
    return [(m.start(1), m.end(1)) for m in CHOICE.finditer(text) if m.end(1) > m.start(1)]


def choice_of_token(offsets: list[tuple[int, int]], spans: list[tuple[int, int]]) -> list[int]:
    """For each token, the index of the choice it belongs to, or -1.

    A token counts as part of a choice if any of its characters fall inside the
    choice, so a token that merges a marker with the choice still counts.
    """
    owner = []
    j = 0
    for start, end in offsets:
        index = -1
        if end > start:
            while j < len(spans) and spans[j][1] <= start:
                j += 1
            if j < len(spans) and spans[j][0] < end:
                index = j
        owner.append(index)
    return owner


def encode(tokenizer, text: str, max_length: int) -> dict:
    """Token ids, training labels (choices only) and which choice each token belongs to.

    Long transcripts are cut at the end, so the instructions always survive and
    only the latest choices are lost.
    """
    enc = tokenizer(text, return_offsets_mapping=True, truncation=True, max_length=max_length)
    owner = choice_of_token(enc["offset_mapping"], choice_spans(text))
    ids = enc["input_ids"]
    # The first token has nothing before it to predict from, so it is never scored.
    labels = [tok if (i > 0 and owner[i] >= 0) else IGNORE for i, tok in enumerate(ids)]
    return {"input_ids": ids, "labels": labels, "owner": owner}


def first_choice_token(tokenizer, word: str) -> int | None:
    """The token a choice such as yes or no starts with when it follows <<."""
    enc = tokenizer(f"<<{word}>>", return_offsets_mapping=True, add_special_tokens=False)
    for tok, (start, end) in zip(enc["input_ids"], enc["offset_mapping"]):
        if start <= 2 < end:
            return tok if start == 2 else None
    return None
