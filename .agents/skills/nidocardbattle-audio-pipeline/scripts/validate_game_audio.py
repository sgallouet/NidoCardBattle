#!/usr/bin/env python3
"""Validate NidoCardBattle runtime audio and emit compact JSON metrics."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
import soundfile as sf


PROFILES = {
    "impact": (0.08, 2.0),
    "footstep": (0.08, 1.5),
    "ui": (0.04, 2.5),
    "creature": (0.20, 4.0),
    "sting": (0.20, 6.0),
    "ambient": (3.0, 180.0),
    "music": (5.0, 380.0),
}


def db(value: float) -> float:
    return 20 * math.log10(max(value, 1e-12))


def spectral_high_band_db(audio: np.ndarray, sample_rate: int) -> float:
    """Estimate energy above 16 kHz without allocating a full-track FFT."""
    mono = np.mean(audio, axis=1)
    frame_size = min(8192, len(mono))
    if frame_size < 64 or sample_rate <= 32_000:
        return -120.0
    window = np.hanning(frame_size).astype(np.float32)
    frame_count = min(48, max(1, len(mono) // frame_size))
    starts = np.linspace(0, max(0, len(mono) - frame_size), frame_count, dtype=int)
    frequencies = np.fft.rfftfreq(frame_size, 1.0 / sample_rate)
    high_mask = frequencies >= 16_000
    total_energy = 0.0
    high_energy = 0.0
    for start in starts:
        spectrum = np.abs(np.fft.rfft(mono[start : start + frame_size] * window)) ** 2
        total_energy += float(np.sum(spectrum))
        high_energy += float(np.sum(spectrum[high_mask]))
    ratio = high_energy / max(total_energy, 1e-30)
    return 10 * math.log10(max(ratio, 1e-12))


def inspect(path: Path, kind: str) -> tuple[dict, list[str], list[str]]:
    failures: list[str] = []
    warnings: list[str] = []
    try:
        audio, sample_rate = sf.read(path, always_2d=True, dtype="float32")
        info = sf.info(path)
    except Exception as exc:
        return {"path": str(path)}, [f"decode failed: {exc}"], warnings

    frames, channels = audio.shape
    duration = frames / sample_rate if sample_rate else 0.0
    finite = bool(np.isfinite(audio).all())
    peak = float(np.max(np.abs(audio))) if frames else 0.0
    rms = float(np.sqrt(np.mean(audio * audio) + 1e-20)) if frames else 0.0
    crest = peak / max(rms, 1e-12)
    high_band_db = spectral_high_band_db(audio, sample_rate)
    clipped = int(np.count_nonzero(np.abs(audio) >= 0.999))
    edge_frames = min(frames // 2, max(1, int(sample_rate * 0.010)))
    start_rms = float(np.sqrt(np.mean(audio[:edge_frames] ** 2) + 1e-20)) if frames else 0.0
    end_rms = float(np.sqrt(np.mean(audio[-edge_frames:] ** 2) + 1e-20)) if frames else 0.0

    format_name = info.format.upper()
    if path.suffix.lower() != ".mp3" or not any(marker in format_name for marker in ("MP3", "MPEG")):
        failures.append(f"expected MP3, decoded format is {info.format}")
    if sample_rate != 44_100:
        failures.append(f"expected 44100 Hz, got {sample_rate}")
    if channels != 2:
        failures.append(f"expected stereo, got {channels} channel(s)")
    minimum, maximum = PROFILES[kind]
    if not minimum <= duration <= maximum:
        failures.append(f"duration {duration:.3f}s is outside {kind} range {minimum:.2f}-{maximum:.2f}s")
    if not finite:
        failures.append("decoded samples contain NaN or infinity")
    if peak <= 1e-5 or db(rms) < -50:
        failures.append("audio is silent or effectively silent")
    if db(peak) > -1.0:
        failures.append(f"decoded peak {db(peak):.2f} dBFS exceeds -1 dBFS")
    if clipped:
        failures.append(f"found {clipped} full-scale clipped sample(s)")
    if crest < 1.3:
        failures.append(f"crest factor {crest:.2f} suggests flattened audio")
    if kind == "music" and high_band_db > -45 and crest < 5.0:
        failures.append(
            f"broadband energy {high_band_db:.1f} dB above 16 kHz with crest {crest:.2f} "
            "suggests collapsed or accelerated-sounding generation"
        )

    if kind not in {"ambient", "music"}:
        if db(start_rms) > -30:
            warnings.append(f"opening 10 ms is active at {db(start_rms):.1f} dBFS; inspect attack")
        if db(end_rms) > -35:
            warnings.append(f"ending 10 ms is active at {db(end_rms):.1f} dBFS; inspect tail")
    else:
        edge_jump = float(np.max(np.abs(audio[0] - audio[-1]))) if frames else 0.0
        if db(edge_jump) > -24:
            warnings.append(f"loop boundary jump is {db(edge_jump):.1f} dBFS; audition the seam")

    metrics = {
        "path": str(path.resolve()),
        "kind": kind,
        "format": info.format,
        "subtype": info.subtype,
        "sample_rate": sample_rate,
        "channels": channels,
        "duration_seconds": round(duration, 4),
        "peak_dbfs": round(db(peak), 3),
        "rms_dbfs": round(db(rms), 3),
        "crest_factor": round(crest, 3),
        "high_band_16k_db": round(high_band_db, 3),
        "clipped_samples": clipped,
        "start_rms_dbfs": round(db(start_rms), 3),
        "end_rms_dbfs": round(db(end_rms), 3),
    }
    return metrics, failures, warnings


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="+", type=Path)
    parser.add_argument("--kind", choices=sorted(PROFILES), required=True)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()

    results = []
    failed = False
    for path in args.files:
        metrics, failures, warnings = inspect(path, args.kind)
        result = {"metrics": metrics, "failures": failures, "warnings": warnings}
        results.append(result)
        failed |= bool(failures)
        state = "FAIL" if failures else "PASS"
        print(f"{state} {path}")
        for issue in failures:
            print(f"  error: {issue}")
        for warning in warnings:
            print(f"  warning: {warning}")
        if not failures:
            print(
                f"  {metrics['duration_seconds']:.3f}s, {metrics['sample_rate']} Hz, "
                f"{metrics['channels']}ch, peak {metrics['peak_dbfs']:.2f} dBFS, "
                f"RMS {metrics['rms_dbfs']:.2f} dBFS, crest {metrics['crest_factor']:.2f}"
            )

    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
