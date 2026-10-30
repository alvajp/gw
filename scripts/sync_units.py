"""
Build data/units.json + docs/assets/units/*.webp: the real name and round
portrait of every character / machine of war seen in a captured defense.

Source: the community Tacticus Planner (https://tacticusplanner.app), whose
JS bundle embeds the unit list (id, name, round-icon path) and serves the
portrait images. Only units that actually appear as defenders in
data/wars/*.json are fetched, one small image each. Re-run after adding a war
whose defenses include a new unit; already-downloaded portraits are kept.
Game art belongs to Snowprint Studios / Games Workshop.

Usage: python3 scripts/sync_units.py
"""
import glob
import io
import json
import os
import re
import time
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WARS_DIR = os.path.join(ROOT, "data", "wars")
OUT_JSON = os.path.join(ROOT, "data", "units.json")
OUT_DIR = os.path.join(ROOT, "docs", "assets", "units")
BASE = "https://tacticusplanner.app"
UA = {"User-Agent": "tacticus-guildwar-tracker (personal guild stats site)"}
SIZE = 64


def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30) as r:
        return r.read()


def used_unit_ids():
    heroes, mows = set(), set()
    for f in glob.glob(os.path.join(WARS_DIR, "*.json")):
        if f.endswith((".legacy.json", ".extra.json")):
            continue
        with open(f, encoding="utf-8") as fh:
            data = json.load(fh)
        for er in data["eventResults"]:
            for l in er["eventResponseData"].get("activityLogs", []):
                d = l.get("defender") if l["type"] == "battleFinished" else None
                if not d:
                    continue
                heroes.update(u["unitId"] for u in d.get("units", []))
                if d.get("machineOfWar"):
                    mows.add(d["machineOfWar"]["unitId"])
    return heroes, mows


def find_record(js, uid):
    """(name, round icon file name) for a unit id, from either record shape the
    planner bundle uses ({id,Name,...RoundIcon} or {snowprintId,name,...roundIcon})."""
    for pat in (rf'\bid:"{uid}",Name:"([^"]*)"', rf'snowprintId:"{uid}",name:"([^"]*)"'):
        m = re.search(pat, js)
        if m:
            window = js[m.end(): m.end() + 3000]
            icon = re.search(r'[Rr]oundIcon:"[^"]*/([^"/]+\.png)"', window)
            if icon:
                return m.group(1), icon.group(1)
    return None, None


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    html = fetch(BASE + "/").decode("utf-8", "replace")
    bundle = re.search(r'/assets/(index-[A-Za-z0-9_-]+\.js)', html).group(1)
    js = fetch(f"{BASE}/assets/{bundle}").decode("utf-8", "replace")

    units = {}
    if os.path.exists(OUT_JSON):
        with open(OUT_JSON, encoding="utf-8") as f:
            units = json.load(f)
    heroes, mows = used_unit_ids()
    missing = []
    for uid in sorted(heroes | mows):
        out_path = os.path.join(OUT_DIR, uid + ".webp")
        if uid in units and os.path.exists(out_path):
            continue
        name, icon = find_record(js, uid)
        if not icon:
            missing.append(uid)
            continue
        base = icon[:-4]
        m = re.search(re.escape(base) + r"-[A-Za-z0-9_-]{8}\.png", js)
        if not m:
            missing.append(uid)
            continue
        img = Image.open(io.BytesIO(fetch(f"{BASE}/assets/{m.group(0)}"))).convert("RGBA")
        img.thumbnail((SIZE, SIZE), Image.LANCZOS)
        img.save(out_path, "WEBP", quality=90)
        units[uid] = {"name": name, "image": f"assets/units/{uid}.webp", "mow": uid in mows and uid not in heroes}
        print("ok", uid, name)
        time.sleep(0.15)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(dict(sorted(units.items())), f, ensure_ascii=False, indent=1)
    if missing:
        print("No name/portrait found for:", missing)
    print(f"{len(units)} units in {OUT_JSON}")


if __name__ == "__main__":
    main()
