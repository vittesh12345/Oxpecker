"""Tests for finding and masking human choices.

Run from the repository root:  python -m unittest discover training/human
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from choices import IGNORE, choice_of_token, choice_spans, encode  # noqa: E402


class Spans(unittest.TestCase):
    def test_finds_each_choice_without_markers(self):
        text = "Pick a key. You press <<D>>. Then <<P>>. Do you accept? You answer <<yes>>."
        self.assertEqual([text[a:b] for a, b in choice_spans(text)], ["D", "P", "yes"])

    def test_ignores_empty_choices(self):
        self.assertEqual(choice_spans("<<>> and <<x>>"), [(11, 12)])


class Ownership(unittest.TestCase):
    def test_tokens_inside_a_choice_belong_to_it(self):
        #        0123456789012345
        text = "go <<left>> now"
        offsets = [(0, 2), (2, 3), (3, 5), (5, 9), (9, 11), (11, 15)]
        self.assertEqual(choice_of_token(offsets, choice_spans(text)), [-1, -1, -1, 0, -1, -1])

    def test_a_token_that_merges_a_marker_with_the_choice_still_counts(self):
        text = "a <<yes>> b <<no>>"
        offsets = [(0, 1), (1, 7), (7, 9), (9, 11), (11, 16), (16, 18)]
        self.assertEqual(choice_of_token(offsets, choice_spans(text)), [-1, 0, -1, -1, 1, -1])

    def test_special_tokens_with_no_text_are_never_choices(self):
        self.assertEqual(choice_of_token([(0, 0), (0, 3)], [(0, 3)]), [-1, 0])


class FakeTokenizer:
    """Splits on single characters, so offsets are easy to reason about."""

    def __call__(self, text, return_offsets_mapping=False, truncation=False, max_length=None, add_special_tokens=True):
        chars = list(text)[:max_length] if truncation else list(text)
        return {"input_ids": [ord(c) for c in chars], "offset_mapping": [(i, i + 1) for i in range(len(chars))]}


class Encoding(unittest.TestCase):
    def test_only_choice_tokens_are_trained_on(self):
        enc = encode(FakeTokenizer(), "x <<ab>> y", max_length=100)
        trained = [chr(t) for t, label in zip(enc["input_ids"], enc["labels"]) if label != IGNORE]
        self.assertEqual(trained, ["a", "b"])

    def test_long_transcripts_are_cut_at_the_end(self):
        enc = encode(FakeTokenizer(), "<<a>> then <<b>>", max_length=6)
        self.assertEqual(len(enc["input_ids"]), 6)
        self.assertEqual(sorted({o for o in enc["owner"] if o >= 0}), [0])


if __name__ == "__main__":
    unittest.main()
