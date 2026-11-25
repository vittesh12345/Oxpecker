---
pretty_name: Oxpecker Workplace Negotiation Scenarios
license: cc-by-4.0
language:
  - en
task_categories:
  - question-answering
  - text-generation
tags:
  - negotiation
  - fairness
  - scheduling
  - constraint-satisfaction
  - workplace
  - synthetic
size_categories:
  - n<1K
configs:
  - config_name: puzzles
    default: true
    data_files:
      - split: train
        path: data/puzzles-train.jsonl
      - split: test
        path: data/puzzles-test.jsonl
  - config_name: scenarios
    data_files:
      - split: train
        path: data/scenarios.jsonl
  - config_name: arrangements
    data_files:
      - split: train
        path: data/arrangements.jsonl
---

# Oxpecker Workplace Negotiation Scenarios

Small, fully synthetic workplace disagreements over **shift trades, tip splits and wages**, with
every possible outcome worked out and every answer computed exactly.

The data comes from [Oxpecker](https://github.com/vittesh12345/Oxpecker), an open-source pay and
scheduling simulator. In the app, each person sets private limits (the least pay they can accept,
the most hours they can work, the shifts they can't do). The app proposes only arrangements inside
everyone's limits and ranks them by a stated fairness rule. This dataset exports that machinery:
the scenarios, the projected pay and hours under every arrangement, and generated reasoning
puzzles whose answers come from the same rules.

Version 1.0.0. No real people, workplaces or negotiation sessions are included.

## What's inside

| Config | Rows | One row is |
| --- | --- | --- |
| `puzzles` (default) | 320 train, 80 test | A scenario with specific limits, a self-contained prompt and the exact answer |
| `scenarios` | 8 | A scenario: story, people, private briefs, limits, priorities and options |
| `arrangements` | 177 | One possible arrangement in a scenario, with each person's projected figures |

```python
from datasets import load_dataset

puzzles = load_dataset("<this-repo-id>", "puzzles")
scenarios = load_dataset("<this-repo-id>", "scenarios")
```

### The scenarios

| Scenario | Type | People | Arrangements | Puzzles | Puzzles where nothing fits |
| --- | --- | --- | --- | --- | --- |
| The Saturday swap | Shift trade | 2 coworkers | 11 | 50 | 7 |
| Holiday weekend cover | Shift trade | 3 coworkers | 17 | 50 | 17 |
| The last bus home | Shift trade | 2 coworkers | 15 | 50 | 21 |
| A share for the kitchen | Tip split | 3 coworkers | 14 | 50 | 13 |
| The tip jar | Tip split | 3 coworkers | 7 | 50 | 4 |
| Friday dinner | Tip split | 2 coworkers | 26 | 50 | 12 |
| Keys without the pay | Wage talk | Worker and manager | 44 | 50 | 17 |
| The outside offer | Wage talk | Worker and manager | 35 | 50 | 21 |

## The puzzle task

Each puzzle gives a scenario, each person's limits and priority, today's arrangement, and a
numbered table of every alternative arrangement with each person's projected figures (pay, hours,
tips, shifts and so on). It then asks three questions:

1. **Which arrangements respect every person's limits?** A figure exactly on a limit counts as
   respecting it, and an arrangement must not give anyone a shift they said they can't work.
2. **Which of those is the most balanced?** Each person is scored from 0 to 1 on the measures
   their priority names, scaled across the arrangements from question 1 and averaged by the
   stated weights. The most balanced arrangement is the one whose worst-off person scores highest
   (leximin), with ties broken by the next-lowest score, then the higher average, then fewer
   changes from today. Arrangements still tied are all listed.
3. **If nothing fits, which arrangement is closest?** Among arrangements that give nobody a shift
   they can't work, the one with the smallest total shortfall relative to the limits it misses.

The prompt states all three rules in full, so a careful reader can reach the exact answer from the
prompt alone. 112 of 400 puzzles have no arrangement that respects every limit,
and 35 have a tie for most balanced.

### Puzzle fields

- `puzzle_id`, `scenario_id`, `category`, `split`
- `prompt`: the full, self-contained task text
- `answer`: a reference answer in plain text
- `respecting`: arrangement numbers that respect every limit (empty when none do)
- `most_balanced`: arrangement numbers tied for most balanced
- `closest`: the closest arrangement when nothing fits, or `null`
- `shortfalls`: for the closest arrangement, whose limits it misses and by how much
- `people`: each person's name, role, priority and limits in structured form
- `facts`: the names and figures the scenario was built with
- `arrangement_count`: how many arrangements the prompt lists

Grading only needs `respecting`, `most_balanced` and `closest`. Compare sets, since order in
the answer does not matter.

### How puzzles vary

Each scenario has 50 puzzles. The first keeps the practice names and figures;
the rest swap in different first names and move every dollar figure (wages, tip totals,
differentials) by up to 15%. Limits are drawn around the scenario's suggested ones: some tighter,
some looser, some switched off, plus occasional extra unavailable shifts. Each person's priority is
drawn from the options the scenario offers. The last 10 puzzles of every scenario
form the test split, so both splits cover all eight scenarios.

## How it was made

Everything is generated by code in the Oxpecker repository (`src/dataset/`), using the same
engine the app runs. Each scenario is small enough to enumerate completely, so labels are exact
rather than annotated or model-generated. Generation is seeded: running `npm run dataset` in the
repository reproduces these files byte for byte, and the repository's tests fail if the committed
files and the generator drift apart.

## Intended uses

- Evaluating whether a model can apply stated constraints and a stated fairness rule to a table of
  numbers, and say clearly when no option works.
- Fine-tuning or prompting models to explain workplace trade-offs in concrete terms (pay, hours,
  shifts) instead of generalities.
- Building teaching material or role-play around everyday negotiations, using the `scenarios`
  config's public and private briefs.

## Limitations

- **Synthetic and small.** Eight scenario families, invented figures, 400 puzzles.
  It says nothing about how real people negotiate or what they consider fair.
- **One fairness rule.** "Most balanced" is leximin over normalized scores. It is one reasonable
  rule among many, not a ground truth about fairness.
- **US-style workplaces and US dollars.** Pay is gross: tax, deductions and overtime premiums are
  not modeled.
- **Not legal or financial advice.** Tip-pooling, scheduling and wage rules vary by place. The tip
  scenarios carry a caution to that effect.
- **Names are for variety only.** They were picked to vary the text and are not meant to signal
  anything about the people in a scenario.
