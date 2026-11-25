"""Grades answers to Oxpecker puzzles against the dataset's exact labels.

An answer is read the way the puzzle asks for it: three numbered lines, with
arrangements named as #n. Only the numbers matter, not their order or wording.
"""
from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass

NUMBER = re.compile(r"#(\d+)")
LINE = re.compile(r"^\s*(?:\*\*)?([123])[.)]")


@dataclass
class Parsed:
    respecting: list[int]
    most_balanced: list[int]
    closest: int | None


def parse_answer(text: str) -> Parsed:
    """Pulls the arrangement numbers out of each of the three answer lines."""
    lines: dict[str, str] = {}
    for raw in text.splitlines():
        match = LINE.match(raw)
        if match and match.group(1) not in lines:
            lines[match.group(1)] = raw[match.end():]

    first = lines.get("1", "")
    second = lines.get("2", "")
    third = lines.get("3", "")
    closest_match = re.search(r"closest[^#]*#(\d+)", third, flags=re.IGNORECASE)
    return Parsed(
        respecting=sorted({int(n) for n in NUMBER.findall(first)}),
        most_balanced=sorted({int(n) for n in NUMBER.findall(second)}),
        closest=int(closest_match.group(1)) if closest_match else None,
    )


def grade(answer: str, row: dict) -> dict[str, bool]:
    """Scores one answer. Each question is right or wrong; `all` needs all three."""
    got = parse_answer(answer)
    respecting = sorted(row["respecting"])
    balanced = sorted(row["most_balanced"])
    nothing_fits = not respecting

    q1 = got.respecting == respecting
    q2 = got.most_balanced == balanced if not nothing_fits else not got.most_balanced
    q3 = got.closest == row["closest"] if nothing_fits else got.closest is None
    return {"respecting": q1, "most_balanced": q2, "closest": q3, "all": q1 and q2 and q3}


def summarize(results: list[tuple[dict, dict[str, bool]]]) -> dict:
    """Accuracy overall, by scenario, and by whether anything fits."""

    def rates(items: list[dict[str, bool]]) -> dict[str, float]:
        n = len(items)
        return {
            key: round(sum(item[key] for item in items) / n, 4) if n else 0.0
            for key in ("respecting", "most_balanced", "closest", "all")
        } | {"count": n}

    by_scenario: dict[str, list] = defaultdict(list)
    by_kind: dict[str, list] = defaultdict(list)
    for row, score in results:
        by_scenario[row["scenario_id"]].append(score)
        by_kind["something fits" if row["respecting"] else "nothing fits"].append(score)

    return {
        "overall": rates([score for _, score in results]),
        "by_kind": {kind: rates(scores) for kind, scores in sorted(by_kind.items())},
        "by_scenario": {sid: rates(scores) for sid, scores in sorted(by_scenario.items())},
    }
