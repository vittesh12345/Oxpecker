"""Scores a model on the Oxpecker test puzzles.

Base model alone (the "before" score):

    python training/evaluate.py --output runs/qwen-1.5b/eval-base.json

With a trained adapter (the "after" score):

    python training/evaluate.py --adapter runs/qwen-1.5b/adapter --output runs/qwen-1.5b/eval-tuned.json

Answers are generated greedily and graded against the dataset's exact labels.
"""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import torch
from transformers import AutoModelForCausalLM, AutoTokenizer

from common import DEFAULT_BASE_MODEL, load_puzzles, messages_for
from grading import grade, summarize


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-model", default=DEFAULT_BASE_MODEL)
    parser.add_argument("--adapter", default=None, help="LoRA adapter folder or Hub id")
    parser.add_argument("--data", default="local", help="'local' for ./dataset, or a Hub dataset id")
    parser.add_argument("--split", default="test")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--max-new-tokens", type=int, default=320)
    parser.add_argument("--output", required=True, help="Where to write the scores and answers (JSON)")
    args = parser.parse_args()

    gpu = torch.cuda.is_available()
    dtype = (torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16) if gpu else torch.float32
    tokenizer = AutoTokenizer.from_pretrained(args.adapter or args.base_model)
    model = AutoModelForCausalLM.from_pretrained(args.base_model, dtype=dtype, attn_implementation="sdpa")
    if args.adapter:
        from peft import PeftModel

        model = PeftModel.from_pretrained(model, args.adapter)
    model.to("cuda" if gpu else "cpu").eval()

    rows = load_puzzles(args.split, args.data, args.limit)
    results, answers = [], []
    started = time.time()
    for i, row in enumerate(rows, 1):
        inputs = tokenizer.apply_chat_template(
            messages_for(row), add_generation_prompt=True, return_tensors="pt", return_dict=True
        ).to(model.device)
        with torch.no_grad():
            output = model.generate(
                **inputs,
                max_new_tokens=args.max_new_tokens,
                do_sample=False,
                pad_token_id=tokenizer.pad_token_id or tokenizer.eos_token_id,
            )
        answer = tokenizer.decode(output[0, inputs["input_ids"].shape[1]:], skip_special_tokens=True)
        score = grade(answer, row)
        results.append((row, score))
        answers.append({"puzzle_id": row["puzzle_id"], "answer": answer, "score": score})
        if i % 10 == 0 or i == len(rows):
            done = sum(s["all"] for _, s in results)
            print(f"{i}/{len(rows)} graded, {done} fully correct so far")

    report = {
        "base_model": args.base_model,
        "adapter": args.adapter,
        "split": args.split,
        "minutes": round((time.time() - started) / 60, 1),
        "scores": summarize(results),
        "answers": answers,
    }
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report["scores"]["overall"], indent=2))


if __name__ == "__main__":
    main()
