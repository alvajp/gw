#!/usr/bin/env python3
"""Adds the NEXT raid season to data/raid_maps.json from the game's own configuration (no website needed).

The desktop client keeps the guild raid configuration in ~/Library/Application Support/com.snowprintstudios.tacticus/globalconfigs/live-loki/<hash>.json
(`guildBoss.guildBossSeasonConfigRotation`: the 5 configs, used one after the other, and `guildBossSeasonDataConfigsGDTO.<config>.tiers[].sets[].encounters[]`: for each
set the boards of the boss (encounterIndex 0) and of its two primes (1, 2)). The next season's config is the one after the latest season's in the rotation (the API's
`seasonConfigId`). Stages: M1 / M2 / M3 = tier 5 (Mythic) sets 0 / 1 / 2, L4 / L5 = tier 4 (Legendary) sets 3 / 4. The configs are edited by the developers from one cycle to
the next (configs 1 and 2 are not what seasons 110 and 111 used), so only the config the game has *today* tells what the next season will be.

  python3 scripts/raid_maps_from_game.py [--season N]     then  python3 scripts/fetch_raid_maps.py  (images)  and regenerate the site
"""
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP = os.path.expanduser("~/Library/Application Support/com.snowprintstudios.tacticus/globalconfigs/live-loki")
STAGES = {"M1": (5, 0), "M2": (5, 1), "M3": (5, 2), "L4": (4, 3), "L5": (4, 4)}


def game_config():
    meta = json.load(open(os.path.join(APP, "gameconfigmeta.data"), encoding="utf-8"))
    return json.load(open(os.path.join(APP, meta["lastGlobalGameConfig"] + ".json"), encoding="utf-8"))["guildBoss"]


def stages(gb, cfg):
    tiers = {t["tier"]: t["sets"] for t in gb["guildBossSeasonDataConfigsGDTO"][cfg]["tiers"]}
    out = {}
    for stage, (tier, idx) in STAGES.items():
        enc = {e["encounterIndex"]: e["boardId"] for e in next(s for s in tiers[tier] if s["set"] == idx)["encounters"]}
        out[stage] = [enc[1], enc[0], enc[2]]  # [first prime, boss, second prime]
    return out


def main():
    gb = game_config()
    rot = gb["guildBossSeasonConfigRotation"]
    files = {int(re.search(r"season-(\d+)", p).group(1)): p for p in glob.glob(os.path.join(ROOT, "data", "raid", "season-*.json"))}
    latest = max(files)
    cur_cfg = json.load(open(files[latest], encoding="utf-8"))["seasonConfigId"]
    season = int(sys.argv[sys.argv.index("--season") + 1]) if "--season" in sys.argv else latest + 1
    cfg = rot[(rot.index(cur_cfg) + (season - latest)) % len(rot)]
    path = os.path.join(ROOT, "data", "raid_maps.json")
    maps = json.load(open(path, encoding="utf-8"))
    maps["seasons"][str(season)] = stages(gb, cfg)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(maps, f, ensure_ascii=False, indent=1)
    print(f"season {season} = {cfg} (the latest season, {latest}, is {cur_cfg})")
    for st, b in maps["seasons"][str(season)].items():
        print(" ", st, b)


if __name__ == "__main__":
    main()
