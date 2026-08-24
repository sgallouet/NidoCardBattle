#!/usr/bin/env python3
"""Bake grounded contact shadows into normalized static unit sprites."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFilter
except ImportError as error:
    raise SystemExit(
        "Pillow is required. Install it with: python -m pip install -r tools/requirements-shadows.txt"
    ) from error


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]


def percentile(values: list[int], fraction: float) -> int:
    ordered = sorted(values)
    index = min(len(ordered) - 1, round((len(ordered) - 1) * fraction))
    return ordered[index]


def bake_shadow(entry: dict[str, object], defaults: dict[str, object]) -> None:
    settings = defaults | entry
    source = (REPOSITORY_ROOT / str(settings["source"])).resolve()
    output = (REPOSITORY_ROOT / str(settings["output"])).resolve()
    if source == output:
        raise ValueError(f"Shadow output must not overwrite its normalized input: {source}")

    unit = Image.open(source).convert("RGBA")
    frame_size = int(settings["frameSize"])
    if unit.size != (frame_size, frame_size):
        raise ValueError(f"{source} must be {frame_size}x{frame_size}; found {unit.size}.")

    alpha = unit.getchannel("A")
    pixels = alpha.load()
    threshold = int(settings["alphaThreshold"])
    opaque = [
        (x, y, pixels[x, y])
        for y in range(frame_size)
        for x in range(frame_size)
        if pixels[x, y] >= threshold
    ]
    if not opaque:
        raise ValueError(f"{source} has no pixels above alpha threshold {threshold}.")

    ground_y = percentile([y for _, y, _ in opaque], float(settings["groundPercentile"]))
    contact_band = int(settings["contactBand"])
    contact = [(x, weight) for x, y, weight in opaque if ground_y - contact_band <= y <= ground_y]
    total_weight = sum(weight for _, weight in contact)
    ground_x = round(sum(x * weight for x, weight in contact) / total_weight)

    bounds = alpha.getbbox()
    if bounds is None:
        raise ValueError(f"{source} has an empty alpha bounding box.")
    silhouette_width = bounds[2] - bounds[0]
    shadow_width = round(silhouette_width * float(settings["widthFactor"]))
    shadow_width = max(int(settings["minWidth"]), min(int(settings["maxWidth"]), shadow_width))
    shadow_height = max(8, round(shadow_width * float(settings["heightRatio"])))
    center_y = ground_y + int(settings["groundOffset"])

    mask = Image.new("L", unit.size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse(
        (
            ground_x - shadow_width // 2,
            center_y - shadow_height // 2,
            ground_x + shadow_width // 2,
            center_y + shadow_height // 2,
        ),
        fill=round(255 * float(settings["opacity"])),
    )
    mask = mask.filter(ImageFilter.GaussianBlur(float(settings["blurRadius"])))
    color = tuple(int(channel) for channel in settings["color"])
    shadow = Image.new("RGBA", unit.size, (*color, 0))
    shadow.putalpha(mask)

    baked = Image.alpha_composite(shadow, unit)
    output.parent.mkdir(parents=True, exist_ok=True)
    baked.save(output, format="WEBP", lossless=True, method=6)
    print(
        f"Baked {output.relative_to(REPOSITORY_ROOT)} "
        f"({shadow_width}x{shadow_height} contact at {ground_x},{center_y})."
    )


def create_preview(
    entries: list[dict[str, object]],
    defaults: dict[str, object],
    output: Path,
) -> None:
    columns = 4
    cell_size = 220
    rows = (len(entries) + columns - 1) // columns
    preview = Image.new("RGBA", (columns * cell_size, rows * cell_size), (56, 92, 54, 255))
    draw = ImageDraw.Draw(preview)
    for index, entry in enumerate(entries):
        settings = defaults | entry
        unit = Image.open(REPOSITORY_ROOT / str(settings["output"])).convert("RGBA")
        x = index % columns * cell_size + (cell_size - unit.width) // 2
        y = index // columns * cell_size + 14
        preview.alpha_composite(unit, (x, y))
        draw.text((x + 4, y + unit.height + 1), str(settings["id"]), fill=(255, 255, 255, 255))
    output.parent.mkdir(parents=True, exist_ok=True)
    preview.save(output, optimize=True)
    print(f"Generated preview {output}.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--manifest",
        type=Path,
        default=REPOSITORY_ROOT / "assets/game/units/shadows/manifest.json",
    )
    parser.add_argument(
        "--unit",
        action="append",
        dest="unit_ids",
        help="Bake only the named unit id. May be supplied more than once.",
    )
    parser.add_argument("--preview", type=Path, help="Optional contact-sheet output for visual QA.")
    args = parser.parse_args()
    manifest = json.loads(args.manifest.resolve().read_text(encoding="utf-8"))
    defaults = manifest["defaults"]
    entries = manifest["units"]
    if args.unit_ids:
        requested = set(args.unit_ids)
        known = {str(entry["id"]) for entry in entries}
        unknown = sorted(requested - known)
        if unknown:
            raise ValueError(f"Unknown unit ids: {', '.join(unknown)}")
        entries = [entry for entry in entries if str(entry["id"]) in requested]
    for entry in entries:
        bake_shadow(entry, defaults)
    if args.preview:
        create_preview(entries, defaults, args.preview.resolve())
    return 0


if __name__ == "__main__":
    sys.exit(main())
