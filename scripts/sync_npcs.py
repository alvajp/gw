#!/usr/bin/env python3
"""Portraits of the enemy units and summons seen in the replays -> docs/assets/npcs/<unit id>.webp.

The units of your own roster come from sync_units.py (the Tacticus Planner). The NPCs (a war's summons, a raid's adjutants' escorts ...) are not there: TacticusDB
(https://tacticusdb.com/npcs) has them. Its page script holds a table "game unit id -> picture name" and the pictures are served at
/images/generated/characters/portrait_<name>.webp; only the ids that a replay in docs/data/replays/ uses and that have no portrait yet are fetched (one small
picture each). Game art belongs to Snowprint Studios / Games Workshop.

  python3 scripts/sync_npcs.py [unit id ...]      then  scripts/replays.py  (to list the portraits in each replay)
"""
import glob
import io
import json
import os
import re
import sys
import urllib.request

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "assets", "npcs")
BASE = "https://tacticusdb.com"
UA = {"User-Agent": "tacticus-guildwar-tracker (personal guild stats site)"}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
        return r.read()


def icon_table():
    """{unit id: picture name} from the script of TacticusDB's NPC page."""
    page = get(BASE + "/npcs/__next.npcs.__PAGE__.txt").decode("utf-8", "ignore")
    for chunk in sorted(set(re.findall(r"/_next/static/chunks/[A-Za-z0-9_\-]+\.js", page))):
        js = get(BASE + chunk).decode("utf-8", "ignore")
        if '"genesSmnNeophyte":"' in js:
            return dict(re.findall(r'"([A-Za-z0-9_]+)":"([a-z0-9_]+)"', js))
    return {}


# the summons' ids that TacticusDB's table does not know: the picture they use there (the same unit as an NPC, or the same picture as a variant)
PICTURES = {"adeptSmnBattleSister": "adept_battlesister", "astraSmnLascannon": "astra_npc_02", "astraSmnMortar": "astra_mortar", "astraSmnVoxcaster": "astra_npc_03",
            "blackSmnBloodletterHSE": "black_bloodletter", "blackSmnHavoc": "black_havoc", "blackSmnTerminator": "black_terminator", "darkaSmnInfiltrator": "darka_infiltrator",
            "eldarSmnGuardian": "aelda_guardian", "eldarSmnHarlequin": "aelda_harlequin", "templInitiate": "templ_initiate", "templInitiatePyreblaster": "templ_pyreblaster",
            "templNeophyte": "templ_neophyte", "thousSmnBlueHorrorHSE": "thous_horror_02", "thousSmnPinkHorrorHSE": "thous_horror", "thousSmnRubricMarine": "thous_rubric",
            "thousSmnScreamerHSE": "thous_screamer", "thousSmnTzaangorClone": "thous_tzaangor", "tyranSmnBarbgaunt": "tyran_barbgaunt", "tyranSmnTermagant": "tyran_termagant",
            "ultraSmnEliminator": "ultra_eliminator"}


def alias(unit_id):
    """The same NPC under TacticusDB's naming: the game's "GuildBoss12Npc2DarkaHellblaster" is "darkaNpc2Hellblaster" there."""
    m = re.match(r"^GuildBoss\d+Npc(\d+)([A-Z][a-z]+)([A-Z].*)$", unit_id)
    return f"{m.group(2).lower()}Npc{m.group(1)}{m.group(3)}" if m else None


def wanted():
    ids = set()
    for f in glob.glob(os.path.join(ROOT, "docs", "data", "replays", "*.json")):
        d = json.load(open(f, encoding="utf-8"))
        ids |= {(u.get("id") or "").split(":")[0] for u in d["units"].values()} - {""}
    have = {os.path.basename(p)[:-5] for p in glob.glob(os.path.join(ROOT, "docs", "assets", "*", "*.webp"))}
    return sorted(i for i in ids if i not in have)


def main():
    ids = sys.argv[1:] or wanted()
    table = icon_table()
    os.makedirs(OUT, exist_ok=True)
    for i in ids:
        icon = table.get(i) or table.get(alias(i) or "") or PICTURES.get(i)
        if not icon:
            print("pas dans TacticusDB :", i)
            continue
        try:
            img = Image.open(io.BytesIO(get(f"{BASE}/images/generated/characters/portrait_{icon}.webp"))).convert("RGBA")
        except Exception as e:  # noqa: BLE001
            print("introuvable :", i, icon, e)
            continue
        img.thumbnail((128, 128))
        img.save(os.path.join(OUT, i + ".webp"), "WEBP", quality=85)
        print("ok", i, "<-", icon, img.size)


if __name__ == "__main__":
    main()
