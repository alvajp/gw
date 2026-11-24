#!/usr/bin/env python3
"""Link previews of the replays: docs/assets/replay-cards/<id>.jpg (1200 x 630, the picture Discord & co show under a replay link).

The text of the preview (title, description) comes from `summary()`, also used by generate_site.py for the <meta> tags of docs/r/<id>.html. The picture is drawn here with Pillow
from files already in the repository (the board's picture, the units' portraits, the boss's picture) and the roster names:

    python3 scripts/replay_cards.py [id ...]       (all the replays when no id)

Run it after scripts/replays.py; the pictures are committed (the daily build only writes the pages).
"""
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, "docs")
OUT = os.path.join(DOCS, "assets", "replay-cards")
W, H = 1200, 630
ACCENT = (242, 177, 52)
FONT_B, FONT_R = "/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf"


def _num(n):
    return f"{int(n):,}".replace(",", " ")  # a plain space: the picture's font has no thin space


def summary(d, player, boss_name, map_label):
    """(title, description, lines) of a replay: who, the damage, the season and the level of the boss. `lines` = what the picture writes."""
    if d.get("mode") == "GuildWars":
        date = d.get("rec") or ""
        date = "/".join(reversed(date.split("-"))) if date else ""
        verdict = {"PlayerWon": "Victoire"}.get(d.get("result"), "Défaite" if d.get("result") else "")
        title = f"Guerre de guilde · {player}"
        bits = [b for b in (verdict, map_label, date) if b]
        return title, " · ".join(bits), {"kicker": "REPLAY · GUERRE DE GUILDE", "head": "Guerre de guilde", "who": player, "big": verdict, "unit": "", "sub": " · ".join(b for b in (map_label, date) if b)}
    where = " · ".join(b for b in (f"Saison {d['season']}" if d.get("season") else "", d.get("lvl") or "") if b)
    place = " · ".join(b for b in (f"Saison {d['season']}" if d.get("season") else "", map_label) if b)  # the picture's line: the level is already in its title
    dmg = d.get("dmg") or 0
    title = f"{boss_name}{' ' + d['lvl'] if d.get('lvl') else ''} · {player}"
    desc = " · ".join(b for b in (f"{player}", f"{_num(dmg)} dégâts" if dmg else "", where, map_label) if b)
    return title, desc, {"kicker": "REPLAY · RAID", "head": boss_name + (f" · {d['lvl']}" if d.get("lvl") else ""), "who": player, "big": _num(dmg) if dmg else "", "unit": "dégâts",
                         "sub": place}


def names_and_bosses():
    sys.path.insert(0, os.path.join(ROOT, "scripts"))
    import rosters as rosters_mod
    names = {r["uid"]: r["name"] for r in rosters_mod.load_rosters()}
    try:
        bosses = json.load(open(os.path.join(DOCS, "data", "raid-meta.json"), encoding="utf-8")).get("bosses", {})
    except (OSError, ValueError):
        bosses = {}
    return names, bosses


def card(d, player, boss_name, map_label, path):
    from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps
    _t, _d, L = summary(d, player, boss_name, map_label)
    font = lambda size, bold=True: ImageFont.truetype(FONT_B if bold else FONT_R, size)
    img = Image.new("RGB", (W, H), (13, 16, 20))
    pic = d.get("pic")
    board = None
    if pic and os.path.exists(os.path.join(DOCS, "assets", pic["src"])):
        board = Image.open(os.path.join(DOCS, "assets", pic["src"])).convert("RGB")
    if board is not None:  # the board, blurred and dark, behind everything
        bg = ImageOps.fit(board, (W, H), centering=(0.5, 0.5)).filter(ImageFilter.GaussianBlur(14))
        img.paste(Image.blend(bg, Image.new("RGB", (W, H), (13, 16, 20)), 0.72))
    over = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(over).rectangle((0, 0, W, 6), fill=ACCENT + (255,))
    img.paste(over, (0, 0), over)
    dr = ImageDraw.Draw(img)
    if board is not None:  # right: the board, in a rounded frame
        bh = H - 80
        bw = int(board.size[0] * bh / board.size[1])
        pic_img = board.resize((bw, bh), Image.LANCZOS)
        mask = Image.new("L", (bw, bh), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, bw - 1, bh - 1), 22, fill=255)
        x0 = W - bw - 56
        img.paste(pic_img, (x0, 40), mask)
        dr.rounded_rectangle((x0, 40, x0 + bw - 1, 40 + bh - 1), 22, outline=(255, 255, 255), width=2)
        right = x0 - 30
    else:
        right = W - 56
    # left: the text (the boss's portrait first when the replay has one)
    x = 56
    boss_art = os.path.join(DOCS, "assets", "bosses", f"{d.get('key')}.webp") if d.get("key") else ""
    tx = x
    dr.text((x, 44), L["kicker"], font=font(22), fill=ACCENT)
    if boss_art and os.path.exists(boss_art):
        bs = 130
        ic = Image.open(boss_art).convert("RGBA").resize((bs, bs), Image.LANCZOS)
        m = Image.new("L", (bs, bs), 0)
        ImageDraw.Draw(m).ellipse((0, 0, bs - 1, bs - 1), fill=255)
        dr.ellipse((x - 3, 84 - 3, x + bs + 3, 84 + bs + 3), fill=ACCENT)
        img.paste(ic, (x, 84), m)
        tx = x + bs + 28
    head = L["head"]
    size = 58
    while dr.textlength(head, font=font(size)) > right - tx and size > 30:
        size -= 2
    dr.text((tx, 84), head, font=font(size), fill=(240, 242, 245))
    dr.text((tx, 84 + size + 16), L["who"], font=font(46), fill=ACCENT)
    y = 84 + 130 + 34
    if L["big"]:
        dr.text((x, y), L["big"], font=font(88), fill=(255, 255, 255))
        if L["unit"]:
            dr.text((x + dr.textlength(L["big"], font=font(88)) + 18, y + 52), L["unit"], font=font(34, False), fill=(190, 198, 208))
        y += 112
    if L["sub"]:
        dr.text((x, y), L["sub"], font=font(30, False), fill=(190, 198, 208))
    # the team's portraits along the bottom
    team = [u for u in d["units"].values() if u["o"] == 0 and not u.get("parent") and u.get("id")]
    n = len(team)
    s = 86
    gap = 14
    ty = H - 56 - s
    for i, u in enumerate(team):
        art = (d.get("art") or {}).get(u["id"].split(":")[0])
        px = x + i * (s + gap)
        if px + s > right:
            break
        ring = ACCENT if u.get("mow") else (255, 255, 255)
        dr.ellipse((px - 3, ty - 3, px + s + 3, ty + s + 3), fill=ring)
        if art and os.path.exists(os.path.join(DOCS, "assets", art)):
            ic = Image.open(os.path.join(DOCS, "assets", art)).convert("RGBA").resize((s, s), Image.LANCZOS)
            m = Image.new("L", (s, s), 0)
            ImageDraw.Draw(m).ellipse((0, 0, s - 1, s - 1), fill=255)
            img.paste(ic, (px, ty), m)
    dr.text((x, H - 40 + 2), "Les Joyeux Psychos · Tacticus", font=font(20, False), fill=(130, 140, 152)) if n == 0 else None
    img.save(path, "JPEG", quality=86, optimize=True)


def main(ids=None):
    from medals import map_label  # scripts/medals.py
    names, bosses = names_and_bosses()
    os.makedirs(OUT, exist_ok=True)
    done = 0
    for f in sorted(glob.glob(os.path.join(DOCS, "data", "replays", "*.json"))):
        rid = os.path.basename(f)[:-5]
        if ids and rid not in ids:
            continue
        d = json.load(open(f, encoding="utf-8"))
        player = names.get(d.get("user"), "Joueur")
        boss_name = (bosses.get(d.get("key")) or {}).get("n") or "Raid"
        card(d, player, boss_name, map_label(d.get("map")), os.path.join(OUT, rid + ".jpg"))
        done += 1
    print(f"{done} card(s) in docs/assets/replay-cards/")


if __name__ == "__main__":
    sys.path.insert(0, os.path.join(ROOT, "scripts"))
    main(set(sys.argv[1:]))
