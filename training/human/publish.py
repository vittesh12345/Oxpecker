"""Uploads a trained human-choice adapter with a model card built from its
measured before-and-after scores.

    python training/human/publish.py --run runs/human/qwen-0.5b --repo <user>/human-choice-qwen2.5-0.5b-lora

The run folder needs adapter/, training.json, eval-base.json and eval-tuned.json.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path


def card(repo: str, training: dict, base: dict, tuned: dict) -> str:
    model = training["base_model"]
    sections = []
    if "psych101" in tuned and "psych101" in base:
        b, t = base["psych101"], tuned["psych101"]
        sections.append(f"""### Psych-101, held-out participants

Average negative log-likelihood of each human choice (lower is better), over {t['choices']:,}
choices by {t['transcripts']} participants who were never trained on.

| Model | NLL per choice |
| --- | --- |
| {model} (before) | {b['mean_nll_per_choice']} |
| This adapter (after) | {t['mean_nll_per_choice']} |
""")
    if "oxpecker" in tuned and "oxpecker" in base and tuned["oxpecker"].get("answers"):
        b, t = base["oxpecker"], tuned["oxpecker"]
        sections.append(f"""### Oxpecker workplace decisions (never trained on)

{t['answers']} real yes/no answers to pay and scheduling proposals, recorded with consent in
[Oxpecker](https://github.com/vittesh12345/Oxpecker)'s research mode. Accuracy is how often the
model's more likely answer matched the person's.

| Model | Accuracy | Log loss |
| --- | --- | --- |
| Always guess the more common answer | {t['always_guess_common_answer']} | n/a |
| {model} (before) | {b['accuracy']} | {b['log_loss']} |
| This adapter (after) | {t['accuracy']} | {t['log_loss']} |
""")
    extra = (
        f"plus {len(training['extra_files'])} extra transcript file(s)"
        if training.get("extra_files")
        else "with no Oxpecker data in training"
    )
    return f"""---
base_model: {model}
library_name: peft
license: apache-2.0
datasets:
  - marcelbinz/Psych-101
language:
  - en
tags:
  - lora
  - cognitive-science
  - decision-making
  - psychology
---

# Human-choice model ({model.split('/')[-1]} + LoRA)

A small model fine-tuned to predict what people choose in psychology experiments, following the
approach of [Centaur](https://huggingface.co/marcelbinz/Llama-3.1-Centaur-70B) (Binz et al.)
at a much smaller scale. It reads a transcript of an experiment and assigns probabilities to the
choice a person makes next. Training covers only the people's choices, not the experiment text.

## Results

{chr(10).join(sections) or 'No evaluations were run.'}
## Training

- Base model: `{model}`
- Data: {training['transcripts']:,} transcripts sampled from Psych-101 (160 experiments), {extra}; {training['choice_tokens']:,} choice tokens
- LoRA rank {training['lora_rank']}, all linear layers; {training['epochs']} epoch(s); learning rate {training['learning_rate']}; effective batch size {training['effective_batch_size']}; up to {training['max_length']} tokens per transcript (longer ones cut at the end)
- {training['steps']} optimizer steps, final training loss {training['final_train_loss']}, {training['minutes']} minutes on {training['device']}

Code: the `training/human/` folder of [Oxpecker](https://github.com/vittesh12345/Oxpecker).

## Limitations

- **Small and partial.** A sub-billion-parameter model trained on a sample of Psych-101. Centaur
  itself is a 70B model trained on all of it; expect this one to be far weaker.
- **Lab tasks, not life.** Psych-101 comes from experiments, mostly with online participants. Good
  scores there do not show the model predicts real-world decisions well, which is why the
  Oxpecker results above are reported separately.
- **Not for decisions about people.** It models average tendencies in experiments. It should not
  be used to judge, rank or make decisions about any real person.

## Credit

Psych-101 and the training approach come from Binz et al., *Centaur: a foundation model of human
cognition*. Psych-101 is released under Apache-2.0.
"""


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--run", required=True)
    parser.add_argument("--repo", required=True)
    parser.add_argument("--private", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
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
    print(api.upload_folder(repo_id=args.repo, folder_path=adapter, commit_message="Upload human-choice adapter").commit_url)


if __name__ == "__main__":
    main()
