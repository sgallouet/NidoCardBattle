#!/usr/bin/env python3
"""Normalize generated sea bases, coastline pieces, and 4x2 wave sheets."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "source" / "terrain" / "sea"
GAME_TERRAIN = ROOT / "assets" / "game" / "terrain"
GAME_VFX = ROOT / "assets" / "game" / "vfx" / "environment"

WAVE_KEYS = ("calm", "double", "glint")
ALPHA_THRESHOLD = 10
CONTENT_PAD = 8


def visible_bbox(image: Image.Image, threshold: int = ALPHA_THRESHOLD) -> tuple[int, int, int, int] | None:
    alpha = image.getchannel("A").point(lambda value: 255 if value >= threshold else 0)
    return alpha.getbbox()


def crop_padded(image: Image.Image, pad: int = CONTENT_PAD) -> Image.Image:
    bounds = visible_bbox(image)
    if bounds is None:
        raise ValueError("Image has no visible pixels.")
    left, top, right, bottom = bounds
    left = max(0, left - pad)
    top = max(0, top - pad)
    right = min(image.width, right + pad)
    bottom = min(image.height, bottom + pad)
    return image.crop((left, top, right, bottom))


def center_on_canvas(image: Image.Image, width: int, height: int) -> Image.Image:
    canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    canvas.paste(image, ((width - image.width) // 2, (height - image.height) // 2), image)
    return canvas


def split_grid(image: Image.Image, columns: int = 4, rows: int = 2) -> list[Image.Image]:
    frames: list[Image.Image] = []
    for row in range(rows):
        for column in range(columns):
            x0 = round(column * image.width / columns)
            x1 = round((column + 1) * image.width / columns)
            y0 = round(row * image.height / rows)
            y1 = round((row + 1) * image.height / rows)
            cell = image.crop((x0, y0, x1, y1))
            bounds = visible_bbox(cell)
            if bounds is None:
                frames.append(Image.new("RGBA", (1, 1), (0, 0, 0, 0)))
                continue
            frames.append(cell.crop(bounds))
    return frames


def pack_frames(frames: list[Image.Image], columns: int = 4, rows: int = 2) -> tuple[Image.Image, int, int]:
    frame_width = max(frame.width for frame in frames) + CONTENT_PAD * 2
    frame_height = max(frame.height for frame in frames) + CONTENT_PAD * 2
    sheet = Image.new("RGBA", (frame_width * columns, frame_height * rows), (0, 0, 0, 0))
    for index, frame in enumerate(frames):
        column = index % columns
        row = index // columns
        centered = center_on_canvas(frame, frame_width, frame_height)
        sheet.paste(centered, (column * frame_width, row * frame_height), centered)
    return sheet, frame_width, frame_height


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, "PNG", optimize=True)


def process(source_dir: Path = SOURCE) -> dict[str, object]:
    meta: dict[str, object] = {"bases": [], "waves": {}}
    for index in range(1, 5):
        cropped = crop_padded(Image.open(source_dir / f"sea-base-0{index}.png").convert("RGBA"), pad=2)
        output = GAME_TERRAIN / f"sea-base-0{index}.png"
        save_png(cropped, output)
        meta["bases"].append({"file": output.name, "width": cropped.width, "height": cropped.height})

    for name in ("sea-edge", "sea-edge-cap"):
        cropped = crop_padded(Image.open(source_dir / f"{name}.png").convert("RGBA"), pad=6)
        output = GAME_TERRAIN / f"{name}.png"
        save_png(cropped, output)
        meta[name] = {"file": output.name, "width": cropped.width, "height": cropped.height}

    for key in WAVE_KEYS:
        source = Image.open(source_dir / f"sea-wave-{key}.png").convert("RGBA")
        frames = split_grid(source)
        if len(frames) != 8:
            raise ValueError(f"{key} did not yield 8 frames.")
        sheet, frame_width, frame_height = pack_frames(frames)
        output = GAME_VFX / f"sea-wave-{key}.png"
        save_png(sheet, output)
        meta["waves"][key] = {
            "file": output.name,
            "frameWidth": frame_width,
            "frameHeight": frame_height,
            "frameCount": 8,
            "columns": 4,
            "rows": 2,
            "sheetWidth": sheet.width,
            "sheetHeight": sheet.height,
        }

    meta_path = GAME_TERRAIN / "sea-art.json"
    meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(meta, indent=2))
    return meta


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SOURCE)
    args = parser.parse_args()
    process(args.source)


if __name__ == "__main__":
    main()
