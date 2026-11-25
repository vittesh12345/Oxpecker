"""Uploads a trained adapter to the Hugging Face Hub with a model card built from
its real training settings and test scores.

    python training/publish_model.py --run runs/qwen-1.5b --repo <user>/oxpecker-qwen2.5-1.5b-lora

The run folder must hold `adapter/`, `training.json`, `eval-base.json` and
`eval-tuned.json`, as written by train.py and evaluate.py. Nothing is published
without both evaluations, so the card always reports measured results.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from common import HUB_DATASET, SYSTEM_PROMPT


def pct(value: float) -> str:
    return f"{value * 100:.1f}%"


def card(repo: str, training: dict, base: dict, tuned: dict) -> str:
    b, t = base["scores"], tuned["scores"]
    rows = "\n".join(
        f"| {label} | {pct(b['overall'][key])} | {pct(t['overall'][key])} |"
        for key, label in [
            ("all", "**All three questions right**"),
            ("respecting", "Q1: which arrangements respect every limit"),
            ("most_balanced", "Q2: which is most balanced"),
            ("closest", "Q3: closest arrangement when nothing fits"),
        ]
    )
    kinds = "\n".join(
        f"| {kind} | {t['by_kind'][kind]['count']} | {pct(b['by_kind'][kind]['all'])} | {pct(t['by_kind'][kind]['all'])} |"
        for kind in t["by_kind"]
    )
    scenarios = "\n".join(
        f"| {sid} | {pct(b['by_scenario'][sid]['all'])} | {pct(s['all'])} |"
        for sid, s in t["by_scenario"].items()
    )
    base_model = training["base_model"]
    return f"""---
base_model: {base_model}
library_name: peft
license: apache-2.0
datasets:
  - {HUB_DATASET}
language:
  - en
pipeline_tag: text-generation
tags:
  - lora
  - negotiation
  - scheduling
  - constraint-satisfaction
---

# Oxpecker puzzle solver ({base_model.split('/')[-1]} + LoRA)

A LoRA adapter for [{base_model}](https://huggingface.co/{base_model}), fine-tuned to answer
the workplace pay and scheduling puzzles in
[{HUB_DATASET}](https://huggingface.co/datasets/{HUB_DATASET}). Each puzzle gives people's
limits, their priorities and a table of possible arrangements, and asks which arrangements
respect every limit, which is most balanced, and which comes closest when nothing fits.

## Results on the {t['overall']['count']} held-out test puzzles

Greedy decoding, graded exactly against the dataset's labels. "Before" is the base model with the
same prompt and no fine-tuning.

| Measure | Before | After |
| --- | --- | --- |
{rows}

| Puzzle kind | Puzzles | Before | After (all three right) |
| --- | --- | --- | --- |
{kinds}

| Scenario | Before | After (all three right) |
| --- | --- | --- |
{scenarios}

## Training

- Base model: `{base_model}`
- Data: {training['train_puzzles']} training puzzles; loss on the answer only
- LoRA rank {training['lora_rank']}, all linear layers; {training['epochs']} epochs; learning rate {training['learning_rate']}; effective batch size {training['effective_batch_size']}; sequences up to {training['max_length']} tokens
- {training['steps']} optimizer steps, final training loss {training['final_train_loss']}, {training['minutes']} minutes on {training['device']}

The code is in the `training/` folder of [Oxpecker](https://github.com/vittesh12345/Oxpecker).

## Use

```python
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

tokenizer = AutoTokenizer.from_pretrained("{repo}")
model = AutoModelForCausalLM.from_pretrained("{base_model}", device_map="auto")
model = PeftModel.from_pretrained(model, "{repo}")

messages = [
    {{"role": "system", "content": {json.dumps(SYSTEM_PROMPT)}}},
    {{"role": "user", "content": puzzle_prompt}},  # the `prompt` field of a puzzle
]
inputs = tokenizer.apply_chat_template(messages, add_generation_prompt=True, return_tensors="pt", return_dict=True).to(model.device)
print(tokenizer.decode(model.generate(**inputs, max_new_tokens=320)[0, inputs["input_ids"].shape[1]:], skip_special_tokens=True))
```

## Limitations

- **Narrow.** It is trained on one puzzle format from eight synthetic scenarios. It is not a
  general negotiation or HR assistant, and it does not know employment law.
- **A short program does this exactly.** The Oxpecker engine solves these puzzles perfectly; the
  model is useful for studying how well language models apply stated constraints and fairness
  rules, not as a replacement for the engine.
- **"Most balanced" is one fairness rule** (leximin over normalized scores), not a ground truth.
- Scores above come from {t['overall']['count']} puzzles, so small differences are noise.
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--run", required=True, help="Run folder from train.py and evaluate.py")
    parser.add_argument("--repo", required=True, help="Hub model repository to create or update")
    parser.add_argument("--private", action="store_true")
    parser.add_argument("--dry-run", action="store_true", help="Write the card but do not upload")
    args = parser.parse_args()

    run = Path(args.run)
    load = lambda name: json.loads((run / name).read_text(encoding="utf-8"))  # noqa: E731
    training, base, tuned = load("training.json"), load("eval-base.json"), load("eval-tuned.json")
    if training.get("tiny_random"):
        raise SystemExit("This run used --tiny-random, a pipeline check. Its model is meaningless; not publishing it.")

    adapter = run / "adapter"
    (adapter / "README.md").write_text(card(args.repo, training, base, tuned), encoding="utf-8")
    for name in ("training.json", "eval-base.json", "eval-tuned.json"):
        (adapter / name).write_text((run / name).read_text(encoding="utf-8"), encoding="utf-8")
    print(f"Model card written to {adapter / 'README.md'}")
    if args.dry_run:
        return

    from huggingface_hub import HfApi

    api = HfApi()
    api.create_repo(args.repo, repo_type="model", private=args.private, exist_ok=True)
    info = api.upload_folder(repo_id=args.repo, folder_path=adapter, commit_message="Upload Oxpecker LoRA adapter")
    print(info.commit_url)


if __name__ == "__main__":
    main()
