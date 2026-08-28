#!/usr/bin/env python3
"""Normalize a transparent unit source into the standard runtime sprite frame."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def normalize_unit(
    source: Path,
    output: Path,
    frame_size: int,
    content_size: int,
    ground_y: int,
    alpha_threshold: int,
) -> None:
    if not source.is_file():
        raise FileNotFoundError(f"Unit source does not exist: {source}")
    if output.suffix.lower() != ".webp":
        raise ValueError(f"Unit output must be a WebP file: {output}")
    if not 0 < content_size <= frame_size:
        raise ValueError("Content size must fit inside the output frame.")
    if not 0 < ground_y <= frame_size:
        raise ValueError("Ground position must fit inside the output frame.")
    if not 1 <= alpha_threshold <= 255:
        raise ValueError("Alpha threshold must be within 1..255.")

    unit = Image.open(source).convert("RGBA")
    visible = unit.getchannel("A").point(
        lambda value: 255 if value >= alpha_threshold else 0
    )
    bounds = visible.getbbox()
    if bounds is None:
        raise ValueError(f"Unit source has no visible pixels: {source}")

    width = bounds[2] - bounds[0]
    height = bounds[3] - bounds[1]
    source_padding = max(2, round(max(width, height) * 0.02))
    crop_bounds = (
        max(0, bounds[0] - source_padding),
        max(0, bounds[1] - source_padding),
        min(unit.width, bounds[2] + source_padding),
        min(unit.height, bounds[3] + source_padding),
    )
    cropped = unit.crop(crop_bounds)
    cropped.thumbnail((content_size, content_size), Image.Resampling.LANCZOS)

    normalized = Image.new("RGBA", (frame_size, frame_size), (0, 0, 0, 0))
    x = (frame_size - cropped.width) // 2
    y = ground_y - cropped.height
    normalized.alpha_composite(cropped, (x, y))

    output.parent.mkdir(parents=True, exist_ok=True)
    normalized.save(output, format="WEBP", lossless=True, method=6)
    print(
        f"Generated {output} from crop {crop_bounds}; "
        f"content {cropped.width}x{cropped.height} at {x},{y}."
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--frame-size", type=int, default=200)
    parser.add_argument("--content-size", type=int, default=188)
    parser.add_argument("--ground-y", type=int, default=192)
    parser.add_argument("--alpha-threshold", type=int, default=20)
    args = parser.parse_args()
    normalize_unit(
        args.source.resolve(),
        args.output.resolve(),
        args.frame_size,
        args.content_size,
        args.ground_y,
        args.alpha_threshold,
    )


if __name__ == "__main__":
    main()
