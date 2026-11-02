"""
Write data/wars/<slug>.maps.yaml for a war straight from the game's local save,
instead of typing the 6 map names by hand.

The game keeps, for the CURRENT guild war only (prep or battle phase), a zone -> boardId
table in user_progression.json (liveEvents.liveEvents[*].components[0].config.zoneTypeConfigs),
plus each guild's real 5x3 battlefield layout. A boardId is the war "map"; data/maps.json knows
each board's English name and whether it is one of the 6 tracked maps (hard +2 / easy +0.5).

The save is overwritten by the next war's prep as soon as a war ends, so the data comes from,
in order: the save itself, or a snapshot taken earlier by scripts/snapshot_war.py
(data/snapshots/). Snapshot during the war -- or schedule snapshot_war.py -- and the war can be
added whenever you like.

Usage:
  python3 scripts/read_maps.py <slug> --season 28 --war 4 --result win|loss
        [--progression PATH] [--dry-run]

The yaml also gets each guild's layout for that war (layout_ours / layout_theirs). Only data whose
time window matches the captured battles is used, so another war's boards can never be read by mistake.
"""
import argparse
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from snapshot_war import best_snapshot, extract_snapshots, stored_snapshots

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WARS_DIR = os.path.join(ROOT, "data", "wars")
DEFAULT_SAVE = os.path.expanduser(
    "~/Library/Application Support/com.snowprintstudios.tacticus/user_progression.json"
)
def capture_battle_span(slug):
    with open(os.path.join(WARS_DIR, slug + ".json"), encoding="utf-8") as f:
        data = json.load(f)
    ts = [
        l["createdOn"]
        for er in data["eventResults"]
        for l in er["eventResponseData"].get("activityLogs", [])
        if l["type"] == "battleFinished"
    ]
    return min(ts), max(ts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("slug")
    ap.add_argument("--season", type=int, required=True)
    ap.add_argument("--war", type=int, required=True)
    ap.add_argument("--result", choices=("win", "loss"), required=True)
    ap.add_argument("--progression", default=DEFAULT_SAVE)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    first, last = capture_battle_span(args.slug)
    with open(args.progression, encoding="utf-8") as f:
        save = json.load(f)
    # the war in the save first (and keep a copy), then anything snapshotted earlier
    from_save = extract_snapshots(save)
    snap = best_snapshot(from_save, first) or best_snapshot(stored_snapshots(), first)
    if not snap:
        sys.exit(
            f"No game-save data matches data/wars/{args.slug}.json: the save already moved on to another war "
            f"({', '.join(x['liveEventId'] for x in from_save) or 'none'}) and no snapshot covers it. "
            "Write its maps.yaml by hand. (Run scripts/snapshot_war.py during a war to avoid this.)"
        )
    zones = {z: {"boardId": b} for z, b in snap["boards"].items()}
    layouts = {k: v for k, v in snap["layouts"].items()}
    ev = {"liveEventId": snap["liveEventId"]}
    print(f"Using {snap['liveEventId']} ({snap['kind']}).")

    with open(os.path.join(ROOT, "data", "maps.json"), encoding="utf-8") as f:
        maps = json.load(f)["maps"]

    hard, easy, boards, unknown = {}, {}, {}, []
    for zone, z in zones.items():
        board = z["boardId"]
        boards[zone] = board
        m = maps.get(board)
        if not m:
            unknown.append((zone, board))
        elif m.get("difficulty") == "hard":
            hard[zone] = m["name"]
        elif m.get("difficulty") == "easy":
            easy[zone] = m["name"]
    if unknown:
        print("WARNING unknown boardId (add it to data/maps.json):", unknown, file=sys.stderr)
    if len(hard) != 3 or len(easy) != 3:
        print(f"WARNING expected 3 hard + 3 easy tracked maps, got {len(hard)} + {len(easy)}", file=sys.stderr)

    lines = [f"season: {args.season}", f"war_number: {args.war}", f"result: {args.result}", "hard:"]
    lines += [f'  {z}: "{n}"' for z, n in hard.items()]
    lines.append("easy:")
    lines += [f'  {z}: "{n}"' for z, n in easy.items()]
    lines.append("boards:")
    lines += [f"  {z}: {b}" for z, b in boards.items()]
    for key in ("ours", "theirs"):
        if key in layouts:
            lines.append(f"layout_{key}:")
            lines += [f'  r{i}: "{",".join(row)}"' for i, row in enumerate(layouts[key], start=1)]
    out = "\n".join(lines) + "\n"

    path = os.path.join(WARS_DIR, args.slug + ".maps.yaml")
    if args.dry_run:
        print(out)
    else:
        with open(path, "w", encoding="utf-8") as f:
            f.write(out)
        print(f"Wrote {path} ({ev['liveEventId']})")


if __name__ == "__main__":
    main()
