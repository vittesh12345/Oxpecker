"""Shared pieces for training and evaluating a model on the Oxpecker puzzles."""
from __future__ import annotations

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
LOCAL_DATA = REPO_ROOT / "dataset" / "data"
HUB_DATASET = "EthanChen72/oxpecker-negotiation-scenarios"
DEFAULT_BASE_MODEL = "Qwen/Qwen2.5-1.5B-Instruct"

SYSTEM_PROMPT = (
    "You solve workplace pay and scheduling puzzles exactly. Apply the rules stated in the "
    "puzzle to the figures given, and answer the three questions as three numbered lines, "
    "naming arrangements as #n."
)


def load_puzzles(split: str, source: str = "local", limit: int | None = None) -> list[dict]:
    """Puzzles from the repository's dataset folder, or from the Hugging Face Hub."""
    if source == "local":
        path = LOCAL_DATA / f"puzzles-{split}.jsonl"
        rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]
    else:
        from datasets import load_dataset

        rows = list(load_dataset(source, "puzzles", split=split))
    return rows[:limit] if limit else rows


def messages_for(row: dict) -> list[dict]:
    """The conversation a model sees: instructions, then the puzzle."""
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": row["prompt"]},
    ]


def training_example(row: dict) -> dict:
    """Prompt and completion kept apart, so training only learns to write the answer."""
    return {
        "prompt": messages_for(row),
        "completion": [{"role": "assistant", "content": row["answer"]}],
    }
