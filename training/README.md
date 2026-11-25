# Training a model on the Oxpecker puzzles

These scripts fine-tune a small open model to answer the puzzles in the
[Oxpecker dataset](https://huggingface.co/datasets/EthanChen72/oxpecker-negotiation-scenarios),
score it before and after on the 80 held-out test puzzles, and publish it with a model card that
reports those scores.

| Script | What it does |
| --- | --- |
| `evaluate.py` | Generates answers for the test puzzles and grades them exactly |
| `train.py` | LoRA fine-tuning with TRL; the loss covers the answer only |
| `publish_model.py` | Writes the model card from the real scores and uploads the adapter |
| `grading.py` | Reads the three answer lines and compares them with the labels |

The headline score is **all three questions right**. The per-question scores are there to show
where a model goes wrong.

## What you need

- An NVIDIA GPU. A 24 GB card (L4, A10, L40S, RTX 4090 or larger) runs the default
  Qwen2.5-1.5B-Instruct comfortably. The free 16 GB T4 on Google Colab should use
  `--base-model Qwen/Qwen2.5-0.5B-Instruct`.
- Python 3.10 or newer, and a Hugging Face token with write access for the last step.

Prompts run up to about 6,500 tokens, so `--max-length` defaults to 7,168. Lowering it below
that cuts the answer off the longest examples.

## Run it

From the repository root:

```bash
pip install -r training/requirements.txt
```

```bash
python training/evaluate.py --output runs/qwen-1.5b/eval-base.json
```

```bash
python training/train.py --output runs/qwen-1.5b
```

```bash
python training/evaluate.py --adapter runs/qwen-1.5b/adapter --output runs/qwen-1.5b/eval-tuned.json
```

```bash
hf auth login
```

```bash
python training/publish_model.py --run runs/qwen-1.5b --repo <your-hf-name>/oxpecker-qwen2.5-1.5b-lora
```

On a 24 GB GPU, training takes very roughly 20 to 40 minutes and each evaluation 5 to 15 minutes.
These are estimates; nobody has timed a full run yet.

On Google Colab, open `oxpecker_colab.ipynb` from this folder, switch the runtime to a GPU, and
run the cells in order.

## What has been checked

The full pipeline (training, saving the adapter, generating, grading, writing the model card)
ran on a CPU with a tiny untrained stand-in model (`train.py --tiny-random`). That checks the
code paths, not the quality: no real model has been trained or scored yet. The grader is tested
against all 400 reference answers in `test_grading.py`:

```bash
python -m unittest discover training
```

## Expectations

Treat this as an experiment. 320 training puzzles is a small set, the questions need careful
arithmetic over long tables, and a short program (the Oxpecker engine) already solves them
exactly. The "before" and "after" scores are the honest measure of what fine-tuning achieved.
