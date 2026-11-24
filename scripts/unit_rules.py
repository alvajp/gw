#!/usr/bin/env python3
"""What the Simulation board needs to know about each character to show where it can go and where it can be hit: data/unit_rules.json.

From the game's own configuration (~/Library/Application Support/com.snowprintstudios.tacticus/gameconfig/*.json, section units.lineup): the movement, the reach of each weapon
(1 = melee, n = ranged) and the traits that change the rules (Flying, Unstoppable / Vehicle / Immune, IndirectFire). The file is committed (the daily build has no game files):

    python3 scripts/unit_rules.py
"""
import glob
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    files = sorted(glob.glob(os.path.expanduser("~/Library/Application Support/com.snowprintstudios.tacticus/gameconfig/*.json")), key=os.path.getmtime)
    lineup = json.load(open(files[-1], encoding="utf-8"))["clientGameConfig"]["units"]["lineup"]
    out = {}
    for uid, u in lineup.items():
        tr = set(u.get("traits") or [])
        ranges = sorted({w.get("Range") or 1 for w in u.get("weapons") or []}) or [1]
        out[uid] = {"mv": u.get("Movement"), "rg": ranges, **({"fl": 1} if "Flying" in tr else {}), **({"us": 1} if tr & {"Unstoppable", "Vehicle", "Immune"} else {}),
                    **({"id": 1} if "IndirectFire" in tr else {})}
    with open(os.path.join(ROOT, "data", "unit_rules.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, indent=0, sort_keys=True)
    print(len(out), "units")


if __name__ == "__main__":
    main()
