#!/usr/bin/env python3
"""Player avatars for the Joueurs pages: data/avatars.json (member id -> "<unit>__<frame>") and docs/assets/avatars/<unit>__<frame>.webp.

The war captures (data/wars/*.json) carry each fighter's `avatarUnitId` (the unit whose portrait is the avatar) and `avatarFrameId` (the frame around it); the API's roster
does not. Both pictures are the game's own, read from its files on this Mac (needs UnityPy + Pillow): the portrait from Bundles/avatars, the frame from the bundle of the
event it comes from. Only the frames found with certainty are drawn (FRAME_SRC); an avatar whose frame is unknown is shown without one. Only current members are kept
(data/rosters). Run after new war captures or roster members:  <UnityPy python> scripts/sync_avatars.py
"""
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import rosters as rosters_mod  # noqa: E402

OUT = os.path.join(ROOT, "docs", "assets", "avatars")
DATA = os.path.join(ROOT, "data", "avatars.json")
BUNDLES = (glob.glob(os.path.expanduser("~/Library/Caches/tacticus/games/*/Tacticus.app/Contents/Resources/Data/StreamingAssets/Bundles")) or [""])[0]
SIZE = 96
# frame id -> (bundle glob under Bundles/, texture name, share of the frame's side the picture takes[, (x, y, radius) of an opaque disc in its middle to cut out])
FRAME_SRC = {
    "frameFebruary2026": ("liveevents/seasonal/frame/february_2026_*.resource", "ui_frame_february_2026", 0.84),
    "frameHalloween2025": ("liveevents/seasonal/frame/halloween_2025_event_*.resource", "ui_frame_halloween_25", 0.84),
    "frameMythic01": ("liveevents/seasonal/frame/mythic_01_event_*.resource", "ui_frame", 0.84),
    "frameApril2026": ("liveevents/seasonal/season_april_2026_*.resource", "ui_frame_april_2026", 0.84),
    "frameMay2026": ("liveevents/seasonal/season_may_2026_*.resource", "ui_frame_may_2026", 0.84),
    "frameSeptember2026": ("liveevents/seasonal/season_september_2026_*.resource", "ui_frame_september_2026", 0.84),
    "frameTyranids": ("ui/seasonal_event_progress_*.resource", "ui_avatar_frame_tyranids", 0.54, (0.5, 0.46, 0.265)),
}


def texture(pattern, name):
    import UnityPy
    UnityPy.config.FALLBACK_UNITY_VERSION = "6000.3.13f1"
    for f in glob.glob(os.path.join(BUNDLES, pattern)):
        for o in UnityPy.load(f).objects:
            if o.type.name == "Texture2D":
                x = o.read()
                if x.m_Name == name:
                    return x.image.convert("RGBA")
    return None


def compose(unit, frame):
    from PIL import Image
    av = texture(f"avatars/{unit}_*.resource", f"ui_avatar_{unit}")
    if av is None:
        return None
    bbox = av.getbbox()
    av = av.crop(bbox) if bbox else av
    fr = texture(*FRAME_SRC[frame][:2]) if frame in FRAME_SRC else None
    if fr is None:
        side, share = SIZE, 1.0
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    else:
        side, share = fr.size[0], FRAME_SRC[frame][2]
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        if len(FRAME_SRC[frame]) > 3:  # a round frame whose texture is filled in the middle (the Tyranids' emblem): cut the disc out so the picture shows
            from PIL import ImageDraw
            cx, cy, rad = (v * side for v in FRAME_SRC[frame][3])
            hole = Image.new("L", fr.size, 255)
            ImageDraw.Draw(hole).ellipse((cx - rad, cy - rad, cx + rad, cy + rad), fill=0)
            fr.putalpha(Image.composite(fr.getchannel("A"), Image.new("L", fr.size, 0), hole))
    inner = int(side * share)
    if fr is not None and len(FRAME_SRC[frame]) == 3:  # a square frame: the round portrait sits on a dark square filling the frame's opening (no bare corners)
        pad = (side - inner) // 2
        canvas.paste(Image.new("RGBA", (inner, inner), (22, 28, 40, 255)), (pad, pad))
    av.thumbnail((inner, inner), Image.LANCZOS)
    ay = int(FRAME_SRC[frame][3][1] * side - av.size[1] / 2) if fr is not None and len(FRAME_SRC[frame]) > 3 else (side - av.size[1]) // 2
    canvas.paste(av, ((side - av.size[0]) // 2, ay), av)
    if fr is not None:
        canvas.alpha_composite(fr.resize((side, side)) if fr.size != (side, side) else fr)
    return canvas.resize((SIZE, SIZE), Image.LANCZOS)


def main():
    members = {r["uid"] for r in rosters_mod.load_rosters()}
    seen = {}
    for path in sorted(glob.glob(os.path.join(ROOT, "data", "wars", "war-vs-*.json"))):  # chronological: the latest capture wins
        def walk(o):
            if isinstance(o, dict):
                if "avatarUnitId" in o and o.get("userId") in members:
                    seen[o["userId"]] = (o["avatarUnitId"], o.get("avatarFrameId") or "")
                for v in o.values():
                    walk(v)
            elif isinstance(o, list):
                for x in o:
                    walk(x)
        walk(json.load(open(path, encoding="utf-8")))
    os.makedirs(OUT, exist_ok=True)
    out, made = {}, {}
    for uid, (unit, frame) in sorted(seen.items()):
        key = f"{unit}__{frame if frame in FRAME_SRC else ''}"
        if key not in made:
            img = compose(unit, frame)
            made[key] = img is not None
            if img is not None:
                img.save(os.path.join(OUT, key + ".webp"), "WEBP", quality=88, method=6)
        if made[key]:
            out[uid] = key
    with open(DATA, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=0, sort_keys=True)
    print(f"{len(out)} avatar(s) of {len(members)} members, {len(made)} picture(s); no avatar: {len(members) - len(out)}")
    print("frames not drawn:", sorted({fr for _, fr in seen.values() if fr and fr not in FRAME_SRC}))


if __name__ == "__main__":
    main()
