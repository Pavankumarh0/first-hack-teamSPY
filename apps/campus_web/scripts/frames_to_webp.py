"""Joins a transparent PNG sequence into a looping animated WebP (and copies a
still frame). Used by scripts/render-characters.mjs; needs Pillow with WebP.

    python scripts/frames_to_webp.py <frames dir> <out.webp> <fps> [<still frame index> <out_still.png>]

Every second frame is kept (15 fps): the characters move gently, and it
halves the file size. The body bob moves every pixel, so WebP cannot reuse
much between frames - each character ends up around 300-400 KB.
"""
import sys
from pathlib import Path

from PIL import Image

QUALITY = 75
STEP = 2


def main(frames_dir: str, out: str, fps: str, still_index: str | None = None, still_out: str | None = None) -> None:
    files = sorted(Path(frames_dir).glob("*.png"))
    if not files:
        sys.exit(f"no PNG frames in {frames_dir}")
    all_frames = [Image.open(f).convert("RGBA") for f in files]
    frames = all_frames[::STEP]
    frames[0].save(
        out,
        format="WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=round(1000 * STEP / float(fps)),
        loop=0,
        quality=QUALITY,
        alpha_quality=90,
        method=4,
    )
    if still_index is not None and still_out:
        all_frames[min(int(still_index), len(all_frames) - 1)].save(still_out, format="PNG", optimize=True)
    print(f"{out}: {len(frames)} frames, {Path(out).stat().st_size // 1024} KB")


if __name__ == "__main__":
    main(*sys.argv[1:])
