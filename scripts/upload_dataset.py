"""Uploads ./dataset to the Hugging Face dataset repository.

Usage, from the repository root:

    pip install huggingface_hub
    hf auth login          # or set HF_TOKEN to a token with write access
    npm run dataset        # regenerate the files first
    python scripts/upload_dataset.py
"""
import re
import subprocess
from pathlib import Path

from huggingface_hub import HfApi

ROOT = Path(__file__).resolve().parent.parent
# The repository id lives in one place: the dataset card generator.
REPO_ID = re.search(
    r"DATASET_REPO = '([^']+)'", (ROOT / "src/dataset/card.ts").read_text(encoding="utf-8")
).group(1)


def main() -> None:
    commit = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True
    ).stdout.strip()
    api = HfApi()
    api.create_repo(REPO_ID, repo_type="dataset", exist_ok=True)
    info = api.upload_folder(
        repo_id=REPO_ID,
        repo_type="dataset",
        folder_path=ROOT / "dataset",
        commit_message=f"Update from github.com/vittesh12345/Oxpecker@{commit or 'local'}",
    )
    print(info.commit_url)


if __name__ == "__main__":
    main()
