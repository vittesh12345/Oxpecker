"""Measures how well a model predicts people's actual choices.

    python training/human/evaluate.py --psych101 runs/human/data/heldout.jsonl \\
        --oxpecker paysim-transcripts.jsonl --output runs/human/eval-base.json

    python training/human/evaluate.py --adapter runs/human/qwen-0.5b/adapter ... --output runs/human/eval-tuned.json

Two measures:
- Psych-101 held-out participants: average negative log-likelihood of each
  human choice (lower is better), overall and per experiment.
- Oxpecker research transcripts (people's yes/no to workplace proposals):
  how often the model's more likely answer matches the person's, its log loss,
  and the score of always guessing the more common answer, for comparison.
"""
from __future__ import annotations

import argparse
import json
import math
import time
from collections import defaultdict
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

from choices import CHOICE, encode, first_choice_token


def read_jsonl(path: str, limit: int | None) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        rows = [json.loads(line) for line in f if line.strip()]
    return rows[:limit] if limit else rows


def log_probs(model, ids: list[int]) -> torch.Tensor:
    with torch.no_grad():
        logits = model(input_ids=torch.tensor([ids], device=model.device)).logits[0].float()
    return torch.log_softmax(logits, dim=-1)


def psych101(model, tokenizer, rows, max_length) -> dict:
    per_experiment: dict[str, list[float]] = defaultdict(list)
    for row in rows:
        enc = encode(tokenizer, row["text"], max_length)
        lp = log_probs(model, enc["input_ids"])
        nll: dict[int, float] = defaultdict(float)
        for t in range(1, len(enc["input_ids"])):
            owner = enc["owner"][t]
            if owner >= 0:
                nll[owner] -= lp[t - 1, enc["input_ids"][t]].item()
        per_experiment[row["experiment"]].extend(nll.values())
    every = [v for values in per_experiment.values() for v in values]
    return {
        "choices": len(every),
        "transcripts": len(rows),
        "mean_nll_per_choice": round(sum(every) / max(1, len(every)), 4),
        "by_experiment": {
            exp: {"choices": len(v), "mean_nll_per_choice": round(sum(v) / len(v), 4)}
            for exp, v in sorted(per_experiment.items()) if v
        },
    }


def oxpecker(model, tokenizer, rows, max_length) -> dict:
    yes_id, no_id = first_choice_token(tokenizer, "yes"), first_choice_token(tokenizer, "no")
    if yes_id is None or no_id is None or yes_id == no_id:
        raise SystemExit("This tokenizer merges << with yes/no, so yes/no can't be compared from one token.")
    results, skipped = [], 0
    by_scenario: dict[str, list] = defaultdict(list)
    for row in rows:
        enc = encode(tokenizer, row["text"], max_length)
        lp = log_probs(model, enc["input_ids"])
        answers = [m.group(1) for m in CHOICE.finditer(row["text"])]
        firsts: dict[int, int] = {}
        for t, owner in enumerate(enc["owner"]):
            if owner >= 0 and owner not in firsts:
                firsts[owner] = t
        for owner, t in firsts.items():
            answer = answers[owner] if owner < len(answers) else None
            if answer not in ("yes", "no") or t == 0 or enc["input_ids"][t] not in (yes_id, no_id):
                skipped += 1
                continue
            a, b = lp[t - 1, yes_id].item(), lp[t - 1, no_id].item()
            p_yes = 1 / (1 + math.exp(b - a))
            p_actual = p_yes if answer == "yes" else 1 - p_yes
            item = {"correct": (p_yes > 0.5) == (answer == "yes"), "log_loss": -math.log(max(p_actual, 1e-9)), "yes": answer == "yes"}
            results.append(item)
            by_scenario[row["experiment"]].append(item)

    def rates(items):
        if not items:
            return {"answers": 0}
        share_yes = sum(i["yes"] for i in items) / len(items)
        return {
            "answers": len(items),
            "accuracy": round(sum(i["correct"] for i in items) / len(items), 4),
            "log_loss": round(sum(i["log_loss"] for i in items) / len(items), 4),
            "always_guess_common_answer": round(max(share_yes, 1 - share_yes), 4),
        }

    return {**rates(results), "skipped": skipped, "by_scenario": {k: rates(v) for k, v in sorted(by_scenario.items())}}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-model", default="Qwen/Qwen2.5-0.5B")
    parser.add_argument("--adapter", default=None)
    parser.add_argument("--psych101", default=None, help="Held-out transcripts from prepare.py")
    parser.add_argument("--oxpecker", default=None, help="Transcripts exported from Oxpecker's research mode")
    parser.add_argument("--max-length", type=int, default=2048)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    if not args.psych101 and not args.oxpecker:
        raise SystemExit("Give --psych101, --oxpecker, or both.")

    gpu = torch.cuda.is_available()
    dtype = (torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16) if gpu else torch.float32
    tokenizer = AutoTokenizer.from_pretrained(args.adapter or args.base_model)
    model = AutoModelForCausalLM.from_pretrained(args.base_model, dtype=dtype, attn_implementation="sdpa")
    if args.adapter:
        from peft import PeftModel

        model = PeftModel.from_pretrained(model, args.adapter)
    model.to("cuda" if gpu else "cpu").eval()

    started = time.time()
    report: dict = {"base_model": args.base_model, "adapter": args.adapter}
    if args.psych101:
        report["psych101"] = psych101(model, tokenizer, read_jsonl(args.psych101, args.limit), args.max_length)
        print("Psych-101 held out:", {k: v for k, v in report["psych101"].items() if k != "by_experiment"})
    if args.oxpecker:
        report["oxpecker"] = oxpecker(model, tokenizer, read_jsonl(args.oxpecker, args.limit), args.max_length)
        print("Oxpecker:", {k: v for k, v in report["oxpecker"].items() if k != "by_scenario"})
    report["minutes"] = round((time.time() - started) / 60, 1)
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
