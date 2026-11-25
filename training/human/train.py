"""Fine-tunes a small open model to predict human choices, Centaur-style.

    python training/human/train.py --data runs/human/data/train.jsonl --output runs/human/qwen-0.5b

The loss covers only the tokens of each person's choices (inside << >>), so
the model learns what people chose given what they saw. `--extra` adds more
transcripts in the same format, such as Oxpecker research exports.
`--tiny-random` checks the pipeline on a CPU with a meaningless tiny model.
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import torch
from peft import LoraConfig, get_peft_model
from transformers import AutoConfig, AutoModelForCausalLM, AutoTokenizer, Trainer, TrainingArguments

from choices import IGNORE, encode

DEFAULT_BASE = "Qwen/Qwen2.5-0.5B"


def read_jsonl(path: str) -> list[dict]:
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def tiny_model(base: str, out: Path):
    config = AutoConfig.from_pretrained(base)
    for name, value in {"hidden_size": 64, "intermediate_size": 128, "num_hidden_layers": 2,
                        "num_attention_heads": 2, "num_key_value_heads": 1, "head_dim": 32,
                        "max_window_layers": 2}.items():
        if hasattr(config, name):
            setattr(config, name, value)
    if getattr(config, "layer_types", None) is not None:
        config.layer_types = config.layer_types[: config.num_hidden_layers]
    torch.manual_seed(0)
    model = AutoModelForCausalLM.from_config(config)
    model.save_pretrained(out / "tiny-base")
    AutoTokenizer.from_pretrained(base).save_pretrained(out / "tiny-base")
    return model


class Collator:
    def __init__(self, pad_id: int):
        self.pad_id = pad_id

    def __call__(self, batch: list[dict]) -> dict:
        width = max(len(b["input_ids"]) for b in batch)
        pad = lambda seq, value: seq + [value] * (width - len(seq))  # noqa: E731
        return {
            "input_ids": torch.tensor([pad(b["input_ids"], self.pad_id) for b in batch]),
            "attention_mask": torch.tensor([pad([1] * len(b["input_ids"]), 0) for b in batch]),
            "labels": torch.tensor([pad(b["labels"], IGNORE) for b in batch]),
        }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-model", default=DEFAULT_BASE)
    parser.add_argument("--data", required=True, help="Transcripts JSONL from prepare.py")
    parser.add_argument("--extra", action="append", default=[], help="More transcripts to train on, e.g. Oxpecker exports")
    parser.add_argument("--output", required=True)
    parser.add_argument("--epochs", type=float, default=1)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--lora-rank", type=int, default=16)
    parser.add_argument("--max-length", type=int, default=2048)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--grad-accum", type=int, default=16)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--max-steps", type=int, default=-1)
    parser.add_argument("--tiny-random", action="store_true")
    args = parser.parse_args()

    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    tokenizer = AutoTokenizer.from_pretrained(args.base_model)
    rows = read_jsonl(args.data) + [r for path in args.extra for r in read_jsonl(path)]
    rows = rows[: args.limit] if args.limit else rows
    examples = []
    for row in rows:
        enc = encode(tokenizer, row["text"], args.max_length)
        if any(label != IGNORE for label in enc["labels"]):
            examples.append({"input_ids": enc["input_ids"], "labels": enc["labels"]})
    choice_tokens = sum(sum(label != IGNORE for label in e["labels"]) for e in examples)
    print(f"{len(examples)} transcripts, {sum(len(e['input_ids']) for e in examples):,} tokens, {choice_tokens:,} choice tokens")

    gpu = torch.cuda.is_available()
    bf16 = gpu and torch.cuda.is_bf16_supported()
    if args.tiny_random:
        model = tiny_model(args.base_model, out)
    else:
        model = AutoModelForCausalLM.from_pretrained(
            args.base_model,
            dtype=torch.bfloat16 if bf16 else (torch.float16 if gpu else torch.float32),
            attn_implementation="sdpa",
        )
    if gpu:
        model.gradient_checkpointing_enable()
        model.enable_input_require_grads()
    model = get_peft_model(
        model,
        LoraConfig(r=args.lora_rank, lora_alpha=args.lora_rank * 2, lora_dropout=0.05,
                   target_modules="all-linear", task_type="CAUSAL_LM"),
    )

    trainer = Trainer(
        model=model,
        args=TrainingArguments(
            output_dir=str(out / "checkpoints"),
            num_train_epochs=args.epochs,
            max_steps=args.max_steps,
            learning_rate=args.learning_rate,
            lr_scheduler_type="cosine",
            warmup_steps=0.05,  # a fraction of total steps
            per_device_train_batch_size=args.batch_size,
            gradient_accumulation_steps=args.grad_accum,
            bf16=bf16,
            fp16=gpu and not bf16,
            logging_steps=10,
            save_strategy="no",
            report_to="none",
            remove_unused_columns=False,
            seed=42,
        ),
        train_dataset=examples,
        data_collator=Collator(tokenizer.pad_token_id or tokenizer.eos_token_id),
    )
    started = time.time()
    result = trainer.train()
    model.save_pretrained(out / "adapter")
    tokenizer.save_pretrained(out / "adapter")

    summary = {
        "base_model": str(out / "tiny-base") if args.tiny_random else args.base_model,
        "tiny_random": args.tiny_random,
        "transcripts": len(examples),
        "extra_files": args.extra,
        "choice_tokens": choice_tokens,
        "epochs": args.epochs,
        "learning_rate": args.learning_rate,
        "lora_rank": args.lora_rank,
        "max_length": args.max_length,
        "effective_batch_size": args.batch_size * args.grad_accum,
        "steps": result.global_step,
        "final_train_loss": round(result.training_loss, 4),
        "minutes": round((time.time() - started) / 60, 1),
        "device": torch.cuda.get_device_name(0) if gpu else "cpu",
    }
    (out / "training.json").write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
