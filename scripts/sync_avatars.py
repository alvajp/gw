#!/usr/bin/env python3
"""Player avatars for the Joueurs pages: data/avatars.json (member id -> "<unit>__<frame>") and docs/assets/avatars/<unit>__<frame>.webp.

The war captures (data/wars/*.json) carry each fighter's `avatarUnitId` (the unit whose portrait is the avatar) and `avatarFrameId` (the frame around it); the API's roster
does not. Both pictures are the game's own, read from its files on this Mac (needs UnityPy + Pillow): the portrait from Bundles/avatars, the round frame from Bundles/idunvisualconfiguration_*.resource. Only the frames found with certainty are drawn (FRAME_TEX); an avatar whose frame is unknown is shown without one. Only current members are kept
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
# frame id (in the war captures) -> the game's texture "ui_avatar_frame_<name>" (round, 256 px, all in Bundles/idunvisualconfiguration_*.resource; the middle is filled with a blue
# emblem that the portrait replaces). The tiers of the loyalty club are the ranks' names.
FRAME_TEX = {
    "frameFebruary2026": "february_2026", "frameApril2026": "april_2026", "frameMay2026": "may_2026", "frameAugust2026": "august_2026", "frameSeptember2026": "september_2026",
    "frameOctober2026": "october_2026", "frameNovember2026": "november_2026", "frameDecember2026": "december_2026", "frameHalloween2025": "halloween_2025", "frameHolidays2025": "holidays_2025",
    "frameMythic01": "mythic", "frameTyranids": "tyranids", "frameSpaceWolves": "space_wolves", "frameDarkAngels": "dark_angels", "frameCrusade": "crusade", "frameElderShop": "elder_shop",
    "frame1yAnniversary": "1y_anniversary", "frameAnniversary2024": "2y_anniversary", "frameAnniversary2025": "3y_anniversary", "frameAmbassador": "ambassador", "frameCreator": "creator",
    "framePreRegistration": "pre_registration", "frameSpaceMarine2": "sm2", "frameEarlyContributor": "early_contributor",
    "frameLoyalty_tier_corporal": "corporal", "frameLoyalty_tier_sergeant": "sergeant", "frameLoyalty_tier_lieutenant": "lieutenant", "frameLoyalty_tier_commissar": "commissar",
    "frameLoyalty_tier_colonel": "colonel", "frameLoyalty_tier_castellan": "castellan", "frameLoyalty_tier_general": "general", "frameLoyalty_tier_high_marshal": "highmarshal",
}
_cache = {}


def textures(pattern):
    """{texture name: image} of the Texture2D of the bundles matching `pattern` under Bundles/ (cached)."""
    if pattern not in _cache:
        import UnityPy
        UnityPy.config.FALLBACK_UNITY_VERSION = "6000.3.13f1"
        found = {}
        for f in glob.glob(os.path.join(BUNDLES, pattern)):
            for o in UnityPy.load(f).objects:
                if o.type.name == "Texture2D":
                    x = o.read()
                    found[x.m_Name] = x.image.convert("RGBA")
        _cache[pattern] = found
    return _cache[pattern]


def disc(frame):
    """(centre x, centre y, outline) of the blue disc in the middle of a frame (the placeholder emblem the portrait replaces), by casting rays from the middle until the colour stops
    being the dark blue of the disc: the outline is a polygon, so every frame's own shape is respected."""
    import math
    w, h = frame.size
    px = frame.load()
    blue = lambda p: p[3] > 200 and p[2] > p[1] + 15 and p[2] > p[0] + 30 and p[0] < 110
    cx, cy = w * 0.5, h * 0.465
    pts = []
    for k in range(96):
        a = 2 * math.pi * k / 96
        def at(r):
            return px[min(w - 1, max(0, int(cx + r * math.cos(a)))), min(h - 1, max(0, int(cy + r * math.sin(a))))]

        r, last, gap = 0, 0, 0
        while r < w * 0.5 and gap < 6:  # a few stray pixels (the emblem's highlights, a dot in the middle) do not end the disc
            if blue(at(r)):
                last, gap = r, 0
            else:
                gap += 1
            r += 1
        r = last
        pts.append((cx + (r - 2) * math.cos(a), cy + (r - 2) * math.sin(a)))  # 2 px inside: the disc's own edge shadow stays
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, pts


# every portrait texture (256 px) is a round picture whose base circle is 156 px wide and centred at (128, 127); the artwork (a head, a helmet ...) may stick out of it. The circle is
# what sits on the frame's disc, so the portraits are centred on it, not on their own bounding box.
AV_CENTRE, AV_DIAM = (128, 127), 156


def compose(unit, frame):
    from PIL import Image, ImageDraw
    av = textures("avatars/" + unit + "_*.resource").get(f"ui_avatar_{unit}")
    if av is None:
        return None
    tex = FRAME_TEX.get(frame)
    fr = textures("idunvisualconfiguration_*.resource").get("ui_avatar_frame_" + tex) if tex else None
    if fr is None:  # no frame: the square around the circle that holds the whole artwork
        bb = av.getbbox() or (0, 0, 256, 256)
        half = max(AV_CENTRE[0] - bb[0], bb[2] - AV_CENTRE[0], AV_CENTRE[1] - bb[1], bb[3] - AV_CENTRE[1])
        box = (AV_CENTRE[0] - half, AV_CENTRE[1] - half, AV_CENTRE[0] + half, AV_CENTRE[1] + half)
        return av.crop(box).resize((SIZE, SIZE), Image.LANCZOS)
    cx, cy, pts = disc(fr)
    diam = (max(p[0] for p in pts) - min(p[0] for p in pts) + max(p[1] for p in pts) - min(p[1] for p in pts)) / 2
    k = diam / AV_DIAM
    scaled = av.resize((round(av.size[0] * k), round(av.size[1] * k)), Image.LANCZOS)
    canvas = Image.new("RGBA", fr.size, (0, 0, 0, 0))
    canvas.paste(scaled, (round(cx - AV_CENTRE[0] * k), round(cy - AV_CENTRE[1] * k)), scaled)
    hole = Image.new("L", fr.size, 255)
    ImageDraw.Draw(hole).polygon(pts, fill=0)  # the blue disc is cut out of the frame, the portrait shows through
    ring = fr.copy()
    ring.putalpha(Image.composite(fr.getchannel("A"), Image.new("L", fr.size, 0), hole))
    canvas.alpha_composite(ring)
    return canvas.resize((SIZE, SIZE), Image.LANCZOS)


# members that never appear in a war capture: their avatar as the player says it (member id -> (portrait unit, frame id)); a capture wins as soon as there is one
MANUAL = {
    "fa88f74f-f5d9-42ad-83cc-ad8a40cd7cd8": ("aelda_lhykhis_01", "frameOctober2026"),  # Erebus: Lhykhis, "War for Armageddon" frame
    "421892f7-fd74-4a04-8fd1-e136f1b4de5d": ("tauta_farsight_01", "frameMythic01"),  # Arkkanan: Farsight, Mythic frame
}


def main():
    members = {r["uid"] for r in rosters_mod.load_rosters()}
    seen = {uid: v for uid, v in MANUAL.items() if uid in members}
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
        key = f"{unit}__{frame if frame in FRAME_TEX else ''}"
        if key not in made:
            img = compose(unit, frame)
            made[key] = img is not None
            if img is not None:
                img.save(os.path.join(OUT, key + ".webp"), "WEBP", quality=88, method=6)
        if made[key]:
            out[uid] = key
    for f in glob.glob(os.path.join(OUT, "*.webp")):  # pictures nobody uses any more
        if os.path.basename(f)[:-5] not in set(out.values()):
            os.remove(f)
    with open(DATA, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=0, sort_keys=True)
    print(f"{len(out)} avatar(s) of {len(members)} members, {len(made)} picture(s); no avatar: {len(members) - len(out)}")
    print("frames not drawn:", sorted({fr for _, fr in seen.values() if fr and fr not in FRAME_TEX}))


if __name__ == "__main__":
    main()
