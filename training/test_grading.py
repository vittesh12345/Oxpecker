"""Checks the grader against the dataset's own reference answers.

Run from the repository root:  python -m unittest discover training
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from common import load_puzzles, training_example  # noqa: E402
from grading import grade, parse_answer, summarize  # noqa: E402

PUZZLES = load_puzzles("train") + load_puzzles("test")


class ReferenceAnswers(unittest.TestCase):
    def test_every_reference_answer_scores_full_marks(self):
        for row in PUZZLES:
            self.assertTrue(grade(row["answer"], row)["all"], row["puzzle_id"])

    def test_summary_counts_everything(self):
        report = summarize([(row, grade(row["answer"], row)) for row in PUZZLES])
        self.assertEqual(report["overall"]["count"], len(PUZZLES))
        self.assertEqual(report["overall"]["all"], 1.0)
        self.assertEqual(set(report["by_kind"]), {"something fits", "nothing fits"})


class WrongAnswers(unittest.TestCase):
    def fits(self):
        return next(r for r in PUZZLES if len(r["respecting"]) >= 2)

    def nothing_fits(self):
        return next(r for r in PUZZLES if not r["respecting"] and r["closest"] is not None)

    def test_a_missing_arrangement_fails_question_one(self):
        row = self.fits()
        wrong = row["answer"].replace(f"#{row['respecting'][-1]}", "", 1)
        self.assertFalse(grade(wrong, row)["respecting"])

    def test_a_wrong_closest_fails_question_three(self):
        row = self.nothing_fits()
        wrong = row["answer"].replace(f"#{row['closest']}", f"#{row['closest'] + 1}")
        score = grade(wrong, row)
        self.assertTrue(score["respecting"])
        self.assertFalse(score["closest"])

    def test_claiming_a_fit_when_nothing_fits_fails(self):
        row = self.nothing_fits()
        self.assertFalse(grade("1. #1, #2\n2. #1\n3. Not needed.", row)["respecting"])

    def test_empty_or_rambling_answers_fail(self):
        row = self.fits()
        self.assertFalse(grade("", row)["all"])
        self.assertFalse(grade("I think the second option seems fairest overall.", row)["all"])

    def test_order_and_formatting_do_not_matter(self):
        row = self.fits()
        listed = ", ".join(f"#{n}" for n in reversed(row["respecting"]))
        best = ", ".join(f"#{n}" for n in row["most_balanced"])
        answer = f"**1.** {listed}\n**2.** Most balanced: {best}\n**3.** Not needed."
        self.assertTrue(grade(answer, row)["all"])

    def test_parser_reads_each_line(self):
        parsed = parse_answer("1. No arrangement fits.\n2. Not applicable.\n3. Closest: #7 (Saturday close).")
        self.assertEqual((parsed.respecting, parsed.most_balanced, parsed.closest), ([], [], 7))


class TrainingExamples(unittest.TestCase):
    def test_prompt_and_answer_are_kept_apart(self):
        example = training_example(PUZZLES[0])
        self.assertEqual([m["role"] for m in example["prompt"]], ["system", "user"])
        self.assertEqual(example["prompt"][1]["content"], PUZZLES[0]["prompt"])
        self.assertEqual(example["completion"], [{"role": "assistant", "content": PUZZLES[0]["answer"]}])


if __name__ == "__main__":
    unittest.main()
