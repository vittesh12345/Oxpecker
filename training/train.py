"""Fine-tunes a small open model on the Oxpecker puzzles with LoRA.

On one GPU with 24 GB or more:

    python training/train.py --output runs/qwen-1.5b

Only the small LoRA adapter is saved, not a full copy of the base model.
`--tiny-random` swaps in a tiny untrained model so the whole pipeline can be
checked on a CPU in a few minutes; its output is meaningless.
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import torch
from datasets import Dataset
from peft import LoraConfig
from transformers import AutoConfig, AutoModelForCausalLM, AutoTokenizer
from trl import SFTConfig, SFTTrainer

from common import DEFAULT_BASE_MODEL, load_puzzles, training_example


def tiny_model(base: str, out: Path):
    """A two-layer, randomly initialised model with the base model's tokenizer."""
    config = AutoConfig.from_pretrained(base)
    for name, value in {
        "hidden_size": 64,
        "intermediate_size": 128,
        "num_hidden_layers": 2,
        "num_attention_heads": 2,
        "num_key_value_heads": 1,
        "head_dim": 32,
        "max_window_layers": 2,
    }.items():
        if hasattr(config, name):
            setattr(config, name, value)
    if getattr(config, "layer_types", None) is not None:
        config.layer_types = config.layer_types[: config.num_hidden_layers]
    torch.manual_seed(0)
    model = AutoModelForCausalLM.from_config(config)
    model.save_pretrained(out / "tiny-base")
    AutoTokenizer.from_pretrained(base).save_pretrained(out / "tiny-base")
    return model


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-model", default=DEFAULT_BASE_MODEL)
    parser.add_argument("--data", default="local", help="'local' for ./dataset, or a Hub dataset id")
    parser.add_argument("--output", required=True)
    parser.add_argument("--epochs", type=float, default=3)
    parser.add_argument("--learning-rate", type=float, default=2e-4)
    parser.add_argument("--lora-rank", type=int, default=32)
    parser.add_argument("--max-length", type=int, default=7168)
    parser.add_argument("--batch-size", type=int, default=1)
    parser.add_argument("--grad-accum", type=int, default=8)
    parser.add_argument("--limit", type=int, default=None, help="Train on only this many puzzles")
    parser.add_argument("--max-steps", type=int, default=-1)
    parser.add_argument("--tiny-random", action="store_true", help="Pipeline check on CPU; output is meaningless")
    args = parser.parse_args()

    out = Path(args.output)
    out.mkdir(parents=True, exist_ok=True)
    rows = load_puzzles("train", args.data, args.limit)
    train_set = Dataset.from_list([training_example(r) for r in rows])

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
    tokenizer = AutoTokenizer.from_pretrained(args.base_model)

    config = SFTConfig(
        output_dir=str(out / "checkpoints"),
        num_train_epochs=args.epochs,
        max_steps=args.max_steps,
        learning_rate=args.learning_rate,
        lr_scheduler_type="cosine",
        warmup_steps=0.05,  # a fraction of total steps
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        gradient_checkpointing=gpu,
        max_length=args.max_length,
        completion_only_loss=True,
        bf16=bf16,
        fp16=gpu and not bf16,
        logging_steps=5,
        save_strategy="no",
        report_to="none",
        seed=42,
    )
    lora = LoraConfig(
        r=args.lora_rank,
        lora_alpha=args.lora_rank * 2,
        lora_dropout=0.05,
        target_modules="all-linear",
        task_type="CAUSAL_LM",
    )

    trainer = SFTTrainer(
        model=model,
        args=config,
        train_dataset=train_set,
        processing_class=tokenizer,
        peft_config=lora,
    )
    started = time.time()
    result = trainer.train()
    trainer.model.save_pretrained(out / "adapter")
    tokenizer.save_pretrained(out / "adapter")

    summary = {
        "base_model": str(out / "tiny-base") if args.tiny_random else args.base_model,
        "tiny_random": args.tiny_random,
        "train_puzzles": len(rows),
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
