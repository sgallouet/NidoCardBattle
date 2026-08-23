#!/usr/bin/env python3
"""Normalize site art and bake projected structure-shadow masks."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

try:
    from PIL import Image, ImageFilter
except ImportError as error:
    raise SystemExit(
        "Pillow is required. Install it with: python -m pip install -r tools/requirements-shadows.txt"
    ) from error


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
SHADOW_CANVAS_WIDTH = 384
ALPHA_THRESHOLD = 8


@dataclass(frozen=True)
class ShadowAsset:
    source: Path
    output: Path


SHADOW_ASSETS = [
    ShadowAsset(Path("assets/game/sites/keep.webp"), Path("assets/game/sites/shadows/keep.webp")),
    ShadowAsset(Path("assets/game/sites/keep-undead.webp"), Path("assets/game/sites/shadows/keep-undead.webp")),
    ShadowAsset(Path("assets/game/sites/fort-neutral.webp"), Path("assets/game/sites/shadows/fort-neutral.webp")),
    ShadowAsset(Path("assets/game/sites/fort-human.webp"), Path("assets/game/sites/shadows/fort-human.webp")),
    ShadowAsset(Path("assets/game/sites/fort-undead.webp"), Path("assets/game/sites/shadows/fort-undead.webp")),
    ShadowAsset(Path("assets/game/sites/garrison-neutral.webp"), Path("assets/game/sites/shadows/garrison-neutral.webp")),
    ShadowAsset(Path("assets/game/sites/garrison-human.webp"), Path("assets/game/sites/shadows/garrison-human.webp")),
    ShadowAsset(Path("assets/game/sites/garrison-undead.webp"), Path("assets/game/sites/shadows/garrison-undead.webp")),
    ShadowAsset(Path("assets/game/sites/well-neutral-v3.webp"), Path("assets/game/sites/shadows/well-neutral.webp")),
    ShadowAsset(Path("assets/game/sites/well-human-v3.webp"), Path("assets/game/sites/shadows/well-human.webp")),
    ShadowAsset(Path("assets/game/sites/well-undead-v3.webp"), Path("assets/game/sites/shadows/well-undead.webp")),
    ShadowAsset(Path("assets/game/decorations/ruin.webp"), Path("assets/game/decorations/shadows/ruin.webp")),
]


def clipped(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def largest_alpha_component(image: Image.Image) -> list[int]:
    alpha = image.getchannel("A")
    width, height = image.size
    values = alpha.tobytes()
    visited = bytearray(width * height)
    largest: list[int] = []

    for start, value in enumerate(values):
        if value <= ALPHA_THRESHOLD or visited[start]:
            continue
        visited[start] = 1
        stack = [start]
        component: list[int] = []
        while stack:
            index = stack.pop()
            component.append(index)
            x = index % width
            neighbors = []
            if x > 0:
                neighbors.append(index - 1)
            if x + 1 < width:
                neighbors.append(index + 1)
            if index >= width:
                neighbors.append(index - width)
            if index + width < width * height:
                neighbors.append(index + width)
            for neighbor in neighbors:
                if not visited[neighbor] and values[neighbor] > ALPHA_THRESHOLD:
                    visited[neighbor] = 1
                    stack.append(neighbor)
        if len(component) > len(largest):
            largest = component

    if not largest:
        raise ValueError("Image has no visible alpha component.")
    return largest


def normalize_undead_keep() -> None:
    source_path = REPOSITORY_ROOT / "assets/source/sites/keep-undead.png"
    output_path = REPOSITORY_ROOT / "assets/game/sites/keep-undead.webp"
    source = Image.open(source_path).convert("RGBA")
    threshold_mask = source.getchannel("A").point(
        lambda value: 255 if value > ALPHA_THRESHOLD else 0
    )
    bounds = threshold_mask.getbbox()
    if bounds is None:
        raise ValueError(f"{source_path} has no visible pixels.")

    cropped = source.crop(bounds)
    scale = min(252 / cropped.width, 252 / cropped.height)
    resized = cropped.resize(
        (max(1, round(cropped.width * scale)), max(1, round(cropped.height * scale))),
        Image.Resampling.LANCZOS,
    )
    normalized = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    normalized.alpha_composite(resized, ((256 - resized.width) // 2, 252 - resized.height))

    component = largest_alpha_component(normalized)
    cleaned = Image.new("RGBA", normalized.size, (0, 0, 0, 0))
    source_pixels = normalized.load()
    cleaned_pixels = cleaned.load()
    for index in component:
        x = index % normalized.width
        y = index // normalized.width
        cleaned_pixels[x, y] = source_pixels[x, y]

    output_path.parent.mkdir(parents=True, exist_ok=True)
    cleaned.save(output_path, format="WEBP", lossless=True, method=6)
    print(f"Normalized {source_path.relative_to(REPOSITORY_ROOT)} -> {output_path.relative_to(REPOSITORY_ROOT)}.")


def bake_projected_shadow(asset: ShadowAsset) -> None:
    source_path = REPOSITORY_ROOT / asset.source
    output_path = REPOSITORY_ROOT / asset.output
    art = Image.open(source_path).convert("RGBA")
    width, height = art.size
    component = largest_alpha_component(art)
    alpha_values = art.getchannel("A").tobytes()
    baseline_y = max(index // width for index in component) - 2
    mask = Image.new("L", (SHADOW_CANVAS_WIDTH, height), 0)
    mask_pixels = mask.load()

    for index in component:
        source_alpha = alpha_values[index]
        x = index % width
        y = index // width
        caster_height = max(0.0, baseline_y - y)
        projected_x = round(x + 18.0 + caster_height * 0.38)
        projected_y = round(baseline_y - caster_height * 0.27 - 3.0)
        if not (0 <= projected_x < mask.width and 0 <= projected_y < mask.height):
            continue

        east_gate = clipped((projected_x - width * 0.58) / (width * 0.46), 0.0, 1.0)
        height_gate = clipped(caster_height / (height * 0.70), 0.14, 1.0)
        far_fade = clipped(
            1.0 - (projected_x - (width + height * 0.28)) / (height * 0.35),
            0.22,
            1.0,
        )
        opacity = round(
            source_alpha * east_gate * (height_gate ** 0.72) * far_fade * 0.78
        )
        if opacity > mask_pixels[projected_x, projected_y]:
            mask_pixels[projected_x, projected_y] = opacity

        if baseline_y - height * 0.27 <= y <= baseline_y:
            contact_x = x + 13
            contact_y = y - 3
            if 0 <= contact_x < mask.width and 0 <= contact_y < mask.height:
                contact_gate = clipped(
                    (contact_x - width * 0.61) / (width * 0.39), 0.0, 1.0
                )
                contact_opacity = round(source_alpha * contact_gate * 0.24)
                if contact_opacity > mask_pixels[contact_x, contact_y]:
                    mask_pixels[contact_x, contact_y] = contact_opacity

    mask = mask.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(2.2))
    mask = mask.filter(ImageFilter.GaussianBlur(0.8))
    shadow = Image.new("RGBA", mask.size, (255, 255, 255, 0))
    shadow.putalpha(mask)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    shadow.save(output_path, format="WEBP", lossless=True, method=6)
    print(f"Baked {asset.output} from {asset.source}.")


def main() -> int:
    normalize_undead_keep()
    for asset in SHADOW_ASSETS:
        bake_projected_shadow(asset)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
