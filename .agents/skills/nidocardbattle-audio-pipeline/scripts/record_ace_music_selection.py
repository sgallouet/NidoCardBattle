#!/usr/bin/env python3
"""Record the user's explicit choice of three ACE-Step music candidates."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("candidate_dir", type=Path)
    parser.add_argument("--keep", type=int, nargs=3, required=True, metavar=("A", "B", "C"))
    args = parser.parse_args()

    manifest_path = args.candidate_dir / "generation-manifest.json"
    validation_path = args.candidate_dir / "validation.json"
    if not manifest_path.is_file() or not validation_path.is_file():
        print("error: candidate manifest or validation report is missing", file=sys.stderr)
        return 2

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    validation = json.loads(validation_path.read_text(encoding="utf-8"))
    results = manifest.get("results", [])
    available = {item.get("index") for item in results}
    approved = list(args.keep)
    if len(set(approved)) != 3 or not set(approved).issubset(available):
        print("error: --keep requires three distinct candidate numbers from this set", file=sys.stderr)
        return 2
    if len(results) != 5:
        print("error: selection is allowed only for a complete five-candidate set", file=sys.stderr)
        return 2
    if len(validation) != 5 or any(item.get("failures") for item in validation):
        print("error: all five candidates must have a passing validation report", file=sys.stderr)
        return 2

    by_index = {item["index"]: item for item in results}
    selection = {
        "status": "user_confirmed",
        "required_keep_count": 3,
        "approved_indices": approved,
        "rejected_indices": sorted(available - set(approved)),
        "integration_allowed": True,
        "approved_candidates": [by_index[index] for index in approved],
    }
    (args.candidate_dir / "selection.json").write_text(
        json.dumps(selection, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"recorded approved candidates: {', '.join(map(str, approved))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
