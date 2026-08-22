#!/usr/bin/env python3
"""Regenerate one rejected ACE-Step candidate without touching passing candidates."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from typing import Any


DEFAULT_ACE_ROOT = Path(r"D:\Grok\ACE-Step-1.5")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("candidate_dir", type=Path)
    parser.add_argument("--index", type=int, required=True)
    parser.add_argument("--seed", type=int, required=True)
    parser.add_argument("--prompt-adjustment", default="")
    parser.add_argument("--ace-root", type=Path, default=DEFAULT_ACE_ROOT)
    args = parser.parse_args()

    manifest_path = args.candidate_dir / "generation-manifest.json"
    validation_path = args.candidate_dir / "validation.json"
    if not manifest_path.is_file() or not validation_path.is_file():
        print("error: generation manifest or validation report is missing", file=sys.stderr)
        return 2
    if shutil.which("ffmpeg") is None:
        print("error: ffmpeg is not available on PATH", file=sys.stderr)
        return 2

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    prior_validation = json.loads(validation_path.read_text(encoding="utf-8"))
    results: list[dict[str, Any]] = manifest.get("results", [])
    candidates: list[dict[str, Any]] = manifest.get("candidates", [])
    if len(results) != 5 or len(candidates) != 5:
        print("error: repair requires a complete five-candidate manifest", file=sys.stderr)
        return 2
    target_result = next((item for item in results if item.get("index") == args.index), None)
    target = next((item for item in candidates if item.get("index") == args.index), None)
    prior_report = next(
        (item for item in prior_validation if item.get("metrics", {}).get("path") == target_result.get("audition")),
        None,
    ) if target_result else None
    if target_result is None or target is None or prior_report is None:
        print("error: target candidate is missing from the manifest or report", file=sys.stderr)
        return 2
    if not prior_report.get("failures"):
        print("error: refusing to replace a candidate that passed validation", file=sys.stderr)
        return 2

    from acestep.handler import AceStepHandler
    from acestep.inference import GenerationConfig, GenerationParams, generate_music
    from acestep.llm_inference import LLMHandler

    dit = AceStepHandler()
    status, ok = dit.initialize_service(
        project_root=str(args.ace_root),
        config_path="acestep-v15-sft",
        device="cuda",
        use_flash_attention=True,
        compile_model=False,
        offload_to_cpu=True,
        offload_dit_to_cpu=True,
    )
    if not ok:
        raise RuntimeError(status)

    llm = LLMHandler()
    status, ok = llm.initialize(
        checkpoint_dir=str(args.ace_root / "checkpoints"),
        lm_model_path="acestep-5Hz-lm-0.6B",
        backend="vllm",
        device="cuda",
        offload_to_cpu=True,
    )
    if not ok:
        raise RuntimeError(status)

    caption = target["caption"]
    if args.prompt_adjustment.strip():
        caption = f"{caption.rstrip(' ,.')}, {args.prompt_adjustment.strip()}"
    params = GenerationParams(
        task_type="text2music",
        caption=caption,
        lyrics=target.get("structure") or "[Instrumental]",
        instrumental=True,
        bpm=target.get("bpm"),
        keyscale=target.get("keyscale", ""),
        timesignature=target.get("timesignature", "4/4"),
        duration=manifest["duration_seconds"],
        inference_steps=50,
        guidance_scale=7.0,
        shift=3.0,
        infer_method="ode",
        use_adg=False,
        dcw_enabled=False,
        thinking=True,
        use_cot_metas=False,
        use_cot_caption=True,
        use_cot_language=False,
        lm_negative_prompt=manifest["negative_prompt"],
    )
    config = GenerationConfig(
        batch_size=1,
        use_random_seed=False,
        seeds=[args.seed],
        audio_format="flac",
    )
    generated = generate_music(dit, llm, params, config, save_dir=str(args.candidate_dir))
    if not generated.success:
        raise RuntimeError(generated.error)

    variation = target["variation"]
    stem = f"{manifest_path.parent.name}-{args.index:02d}-{variation}-retry-{args.seed}"
    master_path = args.candidate_dir / f"{stem}-master.flac"
    audition_path = args.candidate_dir / f"{stem}.mp3"
    os.replace(Path(generated.audios[0]["path"]), master_path)
    subprocess.run(
        [
            "ffmpeg", "-n", "-hide_banner", "-loglevel", "error",
            "-i", str(master_path), "-af", "volume=-2dB,aresample=44100",
            "-ar", "44100", "-ac", "2", "-codec:a", "libmp3lame",
            "-q:a", "2", str(audition_path),
        ],
        check=True,
    )

    validator = Path(__file__).with_name("validate_game_audio.py")
    retry_report_path = args.candidate_dir / f"validation-retry-{args.index:02d}.json"
    retry_validation = subprocess.run(
        [sys.executable, str(validator), str(audition_path), "--kind", "music", "--report", str(retry_report_path)],
        check=False,
    )
    if retry_validation.returncode != 0:
        print(f"error: replacement also failed; original manifest unchanged and retry retained at {audition_path}", file=sys.stderr)
        return retry_validation.returncode

    replacement = {
        **target_result,
        "seed": args.seed,
        "caption": caption,
        "master": str(master_path),
        "master_sha256": _sha256(master_path),
        "audition": str(audition_path),
        "audition_sha256": _sha256(audition_path),
    }
    manifest.setdefault("rejected_attempts", []).append(target_result)
    manifest["results"] = [replacement if item["index"] == args.index else item for item in results]
    target["seed"] = args.seed
    target["caption"] = caption

    full_report_path = args.candidate_dir / "validation.json"
    full_validation = subprocess.run(
        [
            sys.executable,
            str(validator),
            *[item["audition"] for item in manifest["results"]],
            "--kind", "music",
            "--report", str(full_report_path),
        ],
        check=False,
    )
    if full_validation.returncode != 0:
        print("error: complete repaired set failed validation; manifest unchanged", file=sys.stderr)
        return full_validation.returncode

    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    selection = {
        "status": "awaiting_user_confirmation",
        "required_keep_count": 3,
        "approved_indices": [],
        "integration_allowed": False,
        "candidates": [
            {
                "index": item["index"],
                "variation": item["variation"],
                "variation_label": item["variation_label"],
                "audition": item["audition"],
            }
            for item in manifest["results"]
        ],
    }
    (args.candidate_dir / "selection.json").write_text(
        json.dumps(selection, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"candidate {args.index} repaired; complete set ready: {args.candidate_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
