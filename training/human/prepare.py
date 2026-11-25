"""Samples Psych-101 into a training set and a held-out set of participants.

    python training/human/prepare.py --output runs/human/data

Psych-101 (marcelbinz/Psych-101, Apache-2.0) holds transcripts of 160
psychology experiments with 60,092 participants. It is far too large to train
on in full with one small GPU, so this keeps up to --per-experiment
participants from every experiment, which keeps all 160 represented. About one
participant in twenty is set aside, by a fixed hash, for evaluation only.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import random
from collections import defaultdict
from pathlib import Path


def held_out(experiment: str, participant: str, one_in: int) -> bool:
    digest = hashlib.md5(f"{experiment}/{participant}".encode()).hexdigest()
    return int(digest, 16) % one_in == 0


def rows_from(source: str):
    if Path(source).exists():
        with open(source, encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    yield json.loads(line)
    else:
        from datasets import load_dataset

        yield from load_dataset(source, split="train", streaming=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", default="marcelbinz/Psych-101", help="Hub dataset id or a local JSONL file")
    parser.add_argument("--output", required=True)
    parser.add_argument("--per-experiment", type=int, default=8, help="Training participants kept per experiment")
    parser.add_argument("--heldout-per-experiment", type=int, default=2)
    parser.add_argument("--heldout-one-in", type=int, default=20)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    rng = random.Random(args.seed)
    seen: dict[tuple[str, bool], int] = defaultdict(int)
    keep: dict[tuple[str, bool], list[dict]] = defaultdict(list)
    for row in rows_from(args.source):
        experiment, participant = str(row["experiment"]), str(row["participant"])
        heldout = held_out(experiment, participant, args.heldout_one_in)
        limit = args.heldout_per_experiment if heldout else args.per_experiment
        key = (experiment, heldout)
        seen[key] += 1
        item = {"text": row["text"], "experiment": experiment, "participant": participant}
        # Reservoir sampling: every participant in an experiment has the same chance of being kept.
        if len(keep[key]) < limit:
            keep[key].append(item)
        else:
            slot = rng.randrange(seen[key])
            if slot < limit:
                keep[key][slot] = item

    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    for heldout, name in ((False, "train.jsonl"), (True, "heldout.jsonl")):
        rows = [r for (exp, h), items in sorted(keep.items()) if h == heldout for r in items]
        with open(out / name, "w", encoding="utf-8") as f:
            for r in rows:
                f.write(json.dumps(r) + "\n")
        experiments = len({r["experiment"] for r in rows})
        print(f"{out / name}: {len(rows)} transcripts from {experiments} experiments")


if __name__ == "__main__":
    main()
