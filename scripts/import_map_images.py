"""
Replace the cropped map thumbnails in docs/assets/maps/ with high-quality map
images (square art with transparent surroundings, e.g. 2000x2000).

Usage:
  python3 scripts/import_map_images.py <image> "<map name or boardId>"   # one image, e.g. "Three Bridges" (= C1_37)
  python3 scripts/import_map_images.py <folder>                         # every image in it, named after its map
                                                                        # ("Three Bridges.png", "C1_37.webp"...)

Each image is trimmed to its visible area, padded to a square and resized to
480x480 (retina for the ~240px tiles) as a transparent WebP, saved over
docs/assets/maps/<boardId>.webp -- same path as before, so data/maps.json and
the site don't change. Re-run scripts/generate_site.py afterwards.
"""
import json
import os
import re
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "docs", "assets", "maps")
SIZE = 480


def load_maps():
    with open(os.path.join(ROOT, "data", "maps.json"), encoding="utf-8") as f:
        return json.load(f)["maps"]


def norm(s):
    return re.sub(r"[^a-z0-9]", "", s.lower())


def board_for(label, maps):
    """Board id for a boardId ("C1_37") or an English map name ("Three Bridges")."""
    wanted = norm(label)
    for board, m in maps.items():
        if wanted in (norm(board), norm(m["name"])):
            return board
    return None


def convert(src, board):
    im = Image.open(src).convert("RGBA")
    bbox = im.split()[3].point(lambda a: 255 if a > 8 else 0).getbbox()  # visible area
    if bbox:
        im = im.crop(bbox)
    side = max(im.size)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(im, ((side - im.width) // 2, (side - im.height) // 2))
    square = square.resize((SIZE, SIZE), Image.LANCZOS)
    out = os.path.join(OUT_DIR, board + ".webp")
    square.save(out, "WEBP", quality=85, alpha_quality=100, method=6)
    return out, os.path.getsize(out)


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    maps = load_maps()
    target = sys.argv[1]
    jobs = []
    if os.path.isdir(target):
        for name in sorted(os.listdir(target)):
            stem, ext = os.path.splitext(name)
            if ext.lower() not in (".png", ".webp", ".jpg", ".jpeg"):
                continue
            board = board_for(stem, maps)
            if board:
                jobs.append((os.path.join(target, name), board))
            else:
                print("skipped (no map named like that):", name)
    else:
        if len(sys.argv) < 3:
            sys.exit('Give the map name too, e.g. "Three Bridges"')
        board = board_for(sys.argv[2], maps)
        if not board:
            sys.exit(f"Unknown map {sys.argv[2]!r}; known: " + ", ".join(m["name"] for m in maps.values()))
        jobs.append((target, board))
    for src, board in jobs:
        out, size = convert(src, board)
        print(f"{maps[board]['name']:20s} ({board}) -> {os.path.relpath(out, ROOT)} ({size // 1024} KB)")
    print(f"{len(jobs)} image(s) imported.")


if __name__ == "__main__":
    main()
