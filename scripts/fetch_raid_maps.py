"""Downloads the raid map visuals listed in data/raid_maps.json (https://www.tacticustable.com/images/maps/<board>_Visual.png) and writes them as
docs/assets/raid-maps/<board in lower case>.webp (512 px on the long side). Boards already converted are skipped; run it after adding a season."""
import json
import os
import urllib.request
from io import BytesIO

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "assets", "raid-maps")


def main():
    with open(os.path.join(ROOT, "data", "raid_maps.json"), encoding="utf-8") as f:
        seasons = json.load(f)["seasons"]
    boards = sorted({b for stages in seasons.values() for triple in stages.values() for b in triple})
    os.makedirs(OUT, exist_ok=True)
    for board in boards:
        path = os.path.join(OUT, board.lower() + ".webp")
        if os.path.exists(path):
            continue
        req = urllib.request.Request(f"https://www.tacticustable.com/images/maps/{board}_Visual.png", headers={"User-Agent": "tacticus-guildwar-tracker"})
        with urllib.request.urlopen(req, timeout=60) as r:
            img = Image.open(BytesIO(r.read())).convert("RGB")
        img.thumbnail((512, 512))
        img.save(path, "WEBP", quality=80)
        print(board, img.size, os.path.getsize(path))


if __name__ == "__main__":
    main()
