#!/usr/bin/env python3
"""Normalize a black-background unit source into a transparent runtime sprite."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw


def remove_connected_black_background(
    image: Image.Image,
    transparent_below: int,
    opaque_above: int,
) -> Image.Image:
    rgb = image.convert("RGB")
    red, green, blue = rgb.split()
    intensity = ImageChops.lighter(ImageChops.lighter(red, green), blue)

    connected = intensity.point(lambda value: 0 if value <= opaque_above else 255)
    ImageDraw.floodfill(connected, (0, 0), 128, thresh=0)

    span = opaque_above - transparent_below
    alpha_ramp = [
        0 if value <= transparent_below
        else 255 if value >= opaque_above
        else round((value - transparent_below) * 255 / span)
        for value in range(256)
    ]
    intensity_pixels = intensity.get_flattened_data()
    connected_pixels = connected.get_flattened_data()
    alpha = Image.new("L", rgb.size)
    alpha.putdata([
        alpha_ramp[value] if marker == 128 else 255
        for value, marker in zip(intensity_pixels, connected_pixels)
    ])

    rgba = rgb.convert("RGBA")
    rgba.putalpha(alpha)
    return rgba


def normalize_unit(
    source: Path,
    output: Path,
    frame_size: int,
    content_size: int,
    ground_y: int,
    transparent_below: int,
    opaque_above: int,
) -> None:
    if not source.is_file():
        raise FileNotFoundError(f"Unit source does not exist: {source}")
    if output.suffix.lower() != ".webp":
        raise ValueError(f"Unit output must be a WebP file: {output}")
    if not 0 <= transparent_below < opaque_above <= 255:
        raise ValueError("Black-background thresholds must increase within 0..255.")
    if not 0 < content_size <= frame_size:
        raise ValueError("Content size must fit inside the output frame.")
    if not 0 < ground_y <= frame_size:
        raise ValueError("Ground position must fit inside the output frame.")

    unit = remove_connected_black_background(
        Image.open(source),
        transparent_below,
        opaque_above,
    )
    alpha = unit.getchannel("A")
    visible = alpha.point(lambda value: 255 if value >= 16 else 0)
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
    parser.add_argument("--transparent-below", type=int, default=4)
    parser.add_argument("--opaque-above", type=int, default=32)
    args = parser.parse_args()
    normalize_unit(
        args.source.resolve(),
        args.output.resolve(),
        args.frame_size,
        args.content_size,
        args.ground_y,
        args.transparent_below,
        args.opaque_above,
    )


if __name__ == "__main__":
    main()
