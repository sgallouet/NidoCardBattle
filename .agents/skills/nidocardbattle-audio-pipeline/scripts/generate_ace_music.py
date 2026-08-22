#!/usr/bin/env python3
"""Generate validated NidoCardBattle authored-music candidates with ACE-Step 1.5."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
from typing import Any


DEFAULT_ACE_ROOT = Path(r"D:\Grok\ACE-Step-1.5")
DEFAULT_OUTPUT_ROOT = Path(
    r"D:\Grok\stable-audio-3\outputs\nidocardbattle\candidates\ace-step-music"
)
DEFAULT_NEGATIVE = (
    "vocals, singing, choir, featureless ambient drone, environmental field recording, "
    "harsh noise, distortion, clipping, trailer music, recognizable existing melody, "
    "direct soundtrack imitation"
)
NAME_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
REQUIRED_CANDIDATES = 5


def _text(value: str | None, file_path: Path | None, default: str = "") -> str:
    if file_path is not None:
        return file_path.read_text(encoding="utf-8").strip()
    return (value or default).strip()


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    if not NAME_PATTERN.fullmatch(slug):
        raise ValueError(f"variation label cannot form a valid slug: {value!r}")
    return slug


def _load_variations(path: Path) -> list[dict[str, Any]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list) or len(raw) != REQUIRED_CANDIDATES:
        raise ValueError("--variations-file must contain a JSON list of exactly five variations")

    variations: list[dict[str, Any]] = []
    for index, item in enumerate(raw, start=1):
        if not isinstance(item, dict):
            raise ValueError(f"variation {index} must be a JSON object")
        label = str(item.get("label", "")).strip()
        prompt = str(item.get("prompt", "")).strip()
        if not label or not prompt:
            raise ValueError(f"variation {index} requires non-empty label and prompt")
        bpm = item.get("bpm")
        if bpm is not None and (not isinstance(bpm, int) or not 30 <= bpm <= 300):
            raise ValueError(f"variation {index} bpm must be an integer between 30 and 300")
        variations.append(
            {
                "label": label,
                "slug": _slugify(str(item.get("slug") or label)),
                "prompt": prompt,
                "structure": str(item.get("structure") or "[Instrumental]").strip(),
                "bpm": bpm,
                "keyscale": str(item.get("keyscale") or "").strip(),
                "timesignature": str(item.get("timesignature") or "4/4").strip(),
            }
        )
    slugs = [item["slug"] for item in variations]
    prompts = [item["prompt"].casefold() for item in variations]
    if len(set(slugs)) != REQUIRED_CANDIDATES:
        raise ValueError("variation labels/slugs must be unique")
    if len(set(prompts)) != REQUIRED_CANDIDATES:
        raise ValueError("variation prompts must be unique")
    return variations


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", required=True, help="Kebab-case candidate-set name")
    caption = parser.add_mutually_exclusive_group(required=True)
    caption.add_argument("--caption")
    caption.add_argument("--caption-file", type=Path)
    parser.add_argument("--variations-file", type=Path, required=True)
    parser.add_argument("--duration", type=float, default=60.0)
    parser.add_argument("--seed", type=int, default=812700, help="First deterministic seed")
    parser.add_argument("--negative-prompt", default=DEFAULT_NEGATIVE)
    parser.add_argument("--ace-root", type=Path, default=DEFAULT_ACE_ROOT)
    parser.add_argument("--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def _validate_args(args: argparse.Namespace) -> None:
    if not NAME_PATTERN.fullmatch(args.name):
        raise ValueError("--name must be lowercase kebab-case")
    if not 10 <= args.duration <= 360:
        raise ValueError("--duration must be between 10 and 360 seconds")


def _plan(args: argparse.Namespace, caption: str, variations: list[dict[str, Any]]) -> dict[str, Any]:
    candidate_dir = args.output_root / args.name
    candidates = [
        {
            "index": index,
            "seed": args.seed + index - 1,
            "variation": variant["slug"],
            "variation_label": variant["label"],
            "caption": f"{caption.rstrip(' ,.')}, {variant['prompt']}",
            "structure": variant["structure"],
            "bpm": variant["bpm"],
            "keyscale": variant["keyscale"],
            "timesignature": variant["timesignature"],
        }
        for index, variant in enumerate(variations, start=1)
    ]
    return {
        "candidate_dir": str(candidate_dir),
        "scene_brief": caption,
        "candidates": candidates,
        "duration_seconds": args.duration,
        "generator": {
            "root": str(args.ace_root),
            "dit": "acestep-v15-sft",
            "lm": "acestep-5Hz-lm-0.6B",
            "inference_steps": 50,
            "guidance_scale": 7.0,
            "shift": 3.0,
            "dcw_enabled": False,
            "master_format": "FLAC 48 kHz stereo",
            "audition_format": "MP3 44.1 kHz stereo VBR",
        },
        "selection_policy": {
            "status": "awaiting_user_confirmation",
            "candidate_count": REQUIRED_CANDIDATES,
            "required_keep_count": 3,
            "integration_allowed": False,
        },
    }


def main() -> int:
    args = _parse_args()
    try:
        _validate_args(args)
        caption = _text(args.caption, args.caption_file)
        variations = _load_variations(args.variations_file)
        if not caption:
            raise ValueError("caption cannot be empty")
    except (json.JSONDecodeError, OSError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    plan = _plan(args, caption, variations)
    candidate_dir = Path(plan["candidate_dir"])
    if args.dry_run:
        print(json.dumps(plan, indent=2, ensure_ascii=False))
        return 0

    required = [
        args.ace_root / "checkpoints" / "acestep-v15-sft",
        args.ace_root / "checkpoints" / "acestep-5Hz-lm-0.6B",
        args.ace_root / "checkpoints" / "vae",
    ]
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        print("error: required ACE-Step checkpoints are missing:\n  " + "\n  ".join(missing), file=sys.stderr)
        return 2
    if shutil.which("ffmpeg") is None:
        print("error: ffmpeg is not available on PATH", file=sys.stderr)
        return 2
    if candidate_dir.exists() and any(candidate_dir.iterdir()):
        print(f"error: refusing to overwrite existing candidate set: {candidate_dir}", file=sys.stderr)
        return 2
    candidate_dir.mkdir(parents=True, exist_ok=True)

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

    results: list[dict[str, Any]] = []
    for candidate in plan["candidates"]:
        index = candidate["index"]
        seed = candidate["seed"]
        params = GenerationParams(
            task_type="text2music",
            caption=candidate["caption"],
            lyrics=candidate["structure"],
            instrumental=True,
            bpm=candidate["bpm"],
            keyscale=candidate["keyscale"],
            timesignature=candidate["timesignature"],
            duration=args.duration,
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
            lm_negative_prompt=args.negative_prompt,
        )
        config = GenerationConfig(
            batch_size=1,
            use_random_seed=False,
            seeds=[seed],
            audio_format="flac",
        )
        generated = generate_music(dit, llm, params, config, save_dir=str(candidate_dir))
        if not generated.success:
            raise RuntimeError(f"seed {seed}: {generated.error}")

        raw_path = Path(generated.audios[0]["path"])
        stem = f"{args.name}-{index:02d}-{candidate['variation']}"
        master_path = candidate_dir / f"{stem}-master.flac"
        audition_path = candidate_dir / f"{stem}.mp3"
        os.replace(raw_path, master_path)
        subprocess.run(
            [
                "ffmpeg", "-n", "-hide_banner", "-loglevel", "error",
                "-i", str(master_path), "-af", "volume=-2dB,aresample=44100",
                "-ar", "44100", "-ac", "2", "-codec:a", "libmp3lame",
                "-q:a", "2", str(audition_path),
            ],
            check=True,
        )
        results.append(
            {
                "index": index,
                "seed": seed,
                "variation": candidate["variation"],
                "variation_label": candidate["variation_label"],
                "caption": candidate["caption"],
                "structure": candidate["structure"],
                "bpm": candidate["bpm"],
                "keyscale": candidate["keyscale"],
                "timesignature": candidate["timesignature"],
                "master": str(master_path),
                "master_sha256": _sha256(master_path),
                "audition": str(audition_path),
                "audition_sha256": _sha256(audition_path),
            }
        )
        print(f"generated {audition_path}")

    validator = Path(__file__).with_name("validate_game_audio.py")
    report_path = candidate_dir / "validation.json"
    manifest = {
        **plan,
        "negative_prompt": args.negative_prompt,
        "validation_report": str(report_path),
        "results": results,
    }
    (candidate_dir / "generation-manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    validation = subprocess.run(
        [
            sys.executable,
            str(validator),
            *[item["audition"] for item in results],
            "--kind", "music",
            "--report", str(report_path),
        ],
        check=False,
    )
    if validation.returncode != 0:
        print(f"error: validation rejected candidate set; masters retained at {candidate_dir}", file=sys.stderr)
        return validation.returncode
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
            for item in results
        ],
    }
    (candidate_dir / "selection.json").write_text(
        json.dumps(selection, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    print(f"candidate set ready: {candidate_dir}")
    print("integration blocked: ask the user to choose exactly three candidate numbers")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
