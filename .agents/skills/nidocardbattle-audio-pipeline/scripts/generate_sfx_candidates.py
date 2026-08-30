#!/usr/bin/env python3
"""Generate two review-only NidoCardBattle SFX candidates from unclamped audio."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import subprocess
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import soundfile as sf
from stable_audio_3 import StableAudioModel

from validate_game_audio import inspect


SAMPLE_RATE = 44_100
TARGET_PEAK_DBFS = -3.5
STAGING_ROOT = Path(r"D:\grok\stable-audio-3\outputs\nidocardbattle\candidates\sfx-review-rounds")
FFMPEG = Path(
    r"C:\Users\Simon\AppData\Local\Microsoft\WinGet\Packages"
    r"\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe"
    r"\ffmpeg-9.0-full_build\bin\ffmpeg.exe"
)


@dataclass(frozen=True)
class GenerationContract:
    set_name: str
    event_id: str
    trigger: str
    prompt: str
    kind: str
    raw_duration: float
    minimum_duration: float
    maximum_duration: float | None
    tail_ms: int
    seed: int
    steps: int
    minimum_crest: float
    volume: float
    cooldown_ms: int
    pool: int


def decode_unclamped(model: StableAudioModel, contract: GenerationContract, seed: int) -> np.ndarray:
    latents = model.generate(
        prompt=contract.prompt,
        duration=contract.raw_duration,
        seed=seed,
        steps=contract.steps,
        return_latents=True,
    )
    decoded = model.same.decode(latents, chunked=None)
    audio = decoded[0, :, : int(contract.raw_duration * SAMPLE_RATE)]
    result = audio.detach().float().cpu().numpy().T.astype(np.float64)
    if result.ndim != 2 or result.shape[1] != 2:
        raise RuntimeError(f"Unexpected decoded shape: {result.shape}")
    if not np.isfinite(result).all():
        raise RuntimeError("Generated samples contain NaN or infinity")
    return result


def frame_rms(audio: np.ndarray, frame_size: int) -> np.ndarray:
    mono = audio.mean(axis=1)
    usable = len(mono) - (len(mono) % frame_size)
    if usable < frame_size:
        return np.array([float(np.sqrt(np.mean(mono * mono) + 1e-20))])
    frames = mono[:usable].reshape(-1, frame_size)
    return np.sqrt(np.mean(frames * frames, axis=1) + 1e-20)


def trim_one_shot(audio: np.ndarray, contract: GenerationContract) -> np.ndarray:
    centered = audio - np.mean(audio, axis=0, keepdims=True)
    raw_peak = float(np.max(np.abs(centered)))
    if raw_peak < 1e-6:
        raise RuntimeError("Generated audio is silent")

    frame_size = max(1, int(SAMPLE_RATE * 0.010))
    envelope = frame_rms(centered / raw_peak, frame_size)
    smoothed = np.convolve(envelope, np.ones(5) / 5, mode="same")
    floor = float(np.quantile(smoothed, 0.12))
    high = float(np.quantile(smoothed, 0.95))
    threshold = max(10 ** (-44 / 20), floor * 2.4, high * 0.045)
    active = smoothed >= threshold
    bridge_frames = max(1, int(0.18 / 0.010))
    active = np.convolve(
        active.astype(np.int8), np.ones(bridge_frames, dtype=np.int8), mode="same"
    ) > 0
    indices = np.flatnonzero(active)

    if len(indices):
        start_frame = max(0, int(indices[0]) - 4)
        tail_frames = max(1, int(contract.tail_ms / 10))
        end_frame = min(len(envelope), int(indices[-1]) + tail_frames + 1)
        clip = centered[start_frame * frame_size : min(len(centered), end_frame * frame_size)].copy()
    else:
        clip = centered.copy()

    minimum_samples = int(contract.minimum_duration * SAMPLE_RATE)
    if len(clip) < minimum_samples:
        mono = centered.mean(axis=1)
        peak_index = int(np.argmax(np.abs(mono)))
        start = max(0, min(peak_index - int(0.05 * SAMPLE_RATE), len(centered) - minimum_samples))
        clip = centered[start : start + minimum_samples].copy()

    clip -= np.mean(clip, axis=0, keepdims=True)
    peak = float(np.max(np.abs(clip)))
    clip *= (10 ** (TARGET_PEAK_DBFS / 20)) / max(peak, 1e-12)

    fade_in = min(len(clip) // 4, int(0.008 * SAMPLE_RATE))
    fade_out = min(len(clip) // 4, int(0.055 * SAMPLE_RATE))
    clip[:fade_in] *= np.sin(np.linspace(0, math.pi / 2, fade_in))[:, None] ** 2
    clip[-fade_out:] *= np.cos(np.linspace(0, math.pi / 2, fade_out))[:, None] ** 2
    return clip.astype(np.float32)


def encode_mp3(wav_path: Path, mp3_path: Path) -> None:
    subprocess.run(
        [
            str(FFMPEG), "-hide_banner", "-loglevel", "error", "-y",
            "-i", str(wav_path), "-codec:a", "libmp3lame", "-qscale:a", "3", str(mp3_path),
        ],
        check=True,
    )


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parse_args() -> GenerationContract:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("set_name")
    parser.add_argument("--event-id", required=True)
    parser.add_argument("--trigger", required=True)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--kind", choices=("impact", "footstep", "ui", "creature", "sting"), required=True)
    parser.add_argument("--duration", type=float, required=True, dest="raw_duration")
    parser.add_argument("--minimum", type=float, required=True, dest="minimum_duration")
    parser.add_argument("--maximum", type=float, dest="maximum_duration")
    parser.add_argument("--tail-ms", type=int, required=True)
    parser.add_argument("--seed", type=int, required=True)
    parser.add_argument("--steps", type=int, default=8)
    parser.add_argument("--minimum-crest", type=float, default=1.3)
    parser.add_argument("--volume", type=float, required=True)
    parser.add_argument("--cooldown-ms", type=int, required=True)
    parser.add_argument("--pool", type=int, required=True)
    args = parser.parse_args()
    for value in (args.set_name, args.event_id):
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", value):
            parser.error(f"expected lowercase kebab-case identifier, got {value!r}")
    return GenerationContract(**vars(args))


def main() -> int:
    contract = parse_args()
    if not FFMPEG.exists():
        raise FileNotFoundError(FFMPEG)

    output_dir = STAGING_ROOT / contract.set_name
    expected = [output_dir / f"{contract.set_name}-{suffix}{extension}" for suffix in ("a", "b") for extension in (".wav", ".mp3")]
    existing = [path for path in expected if path.exists()]
    if existing:
        raise FileExistsError(f"Refusing to overwrite existing candidate: {existing[0]}")
    output_dir.mkdir(parents=True, exist_ok=True)

    print("Loading Stable Audio 3 small-sfx on CUDA...", flush=True)
    model = StableAudioModel.from_pretrained("small-sfx", device="cuda", model_half=True)
    candidates = []
    for suffix, seed in zip(("a", "b"), (contract.seed, contract.seed + 10_000), strict=True):
        print(f"Generating {suffix.upper()} with seed {seed}...", flush=True)
        processed = trim_one_shot(decode_unclamped(model, contract, seed), contract)
        wav_path = output_dir / f"{contract.set_name}-{suffix}.wav"
        mp3_path = output_dir / f"{contract.set_name}-{suffix}.mp3"
        sf.write(wav_path, processed, SAMPLE_RATE, subtype="PCM_24")
        encode_mp3(wav_path, mp3_path)
        metrics, failures, warnings = inspect(mp3_path, contract.kind)
        if contract.maximum_duration is not None and metrics.get("duration_seconds", math.inf) > contract.maximum_duration:
            failures.append(
                f"trimmed duration {metrics['duration_seconds']:.3f}s exceeds single-shot maximum "
                f"{contract.maximum_duration:.3f}s"
            )
        if metrics.get("crest_factor", 0.0) < contract.minimum_crest:
            failures.append(
                f"crest factor {metrics.get('crest_factor', 0.0):.2f} is below requested transient minimum "
                f"{contract.minimum_crest:.2f}"
            )
        if failures:
            raise RuntimeError(f"Validation failed for {mp3_path}: {failures}")
        candidates.append(
            {
                "label": suffix.upper(),
                "seed": seed,
                "wav_master": str(wav_path),
                "audition_file": str(mp3_path),
                "sha256": sha256(mp3_path),
                "metrics": metrics,
                "warnings": warnings,
            }
        )
        print(
            f"PASS {mp3_path.name}: {metrics['duration_seconds']:.3f}s, "
            f"peak {metrics['peak_dbfs']:.2f} dBFS, crest {metrics['crest_factor']:.2f}",
            flush=True,
        )

    manifest = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "generator": "Stable Audio 3 small-sfx; unclamped latent decode; activity trim; PCM24 master",
        "contract": vars(contract),
        "candidates": candidates,
        "semantic_status": "awaiting_user_review",
        "integration_allowed": False,
    }
    manifest_path = output_dir / "generation-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {manifest_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
