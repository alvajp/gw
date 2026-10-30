"""
Write data/wars/<slug>.maps.yaml for a war straight from the game's local save,
instead of typing the 6 map names by hand.

The game keeps, for the CURRENT (or just-finished) guild war only, a
zone -> boardId table in user_progression.json
(liveEvents.liveEvents[*].components[0].config.zoneTypeConfigs). A boardId is
the war "map"; data/maps.json knows each board's English name and whether it
is one of the 6 tracked maps (hard +2 / easy +0.5). So run this right after
capturing a war, before the next war starts.

Usage:
  python3 scripts/read_maps.py <slug> --season 28 --war 4 --result win|loss
        [--progression PATH] [--dry-run]

It checks that the war in the save actually matches data/wars/<slug>.json (the
captured battles must fall inside the war's battle window) so it can't silently
read the next war's boards.
"""
import argparse
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WARS_DIR = os.path.join(ROOT, "data", "wars")
DEFAULT_SAVE = os.path.expanduser(
    "~/Library/Application Support/com.snowprintstudios.tacticus/user_progression.json"
)
SLACK_MS = 6 * 3600 * 1000


def ms_date(s):
    m = re.search(r"/Date\((\d+)\)/", s or "")
    return int(m.group(1)) if m else None


def find_war_event(save):
    for ev in save.get("liveEvents", {}).get("liveEvents", []):
        for comp in ev.get("components", []):
            cfg = comp.get("config") or {}
            if "zoneTypeConfigs" in cfg:
                return ev, cfg["zoneTypeConfigs"]
    sys.exit("No guild war zoneTypeConfigs found in the save.")


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

    with open(args.progression, encoding="utf-8") as f:
        save = json.load(f)
    ev, zones = find_war_event(save)

    start, end = ms_date(ev["activeTimeSlot"]["start"]), ms_date(ev["activeTimeSlot"]["end"])
    first, last = capture_battle_span(args.slug)
    if not (start - SLACK_MS <= first and last <= end + SLACK_MS):
        sys.exit(
            f"The war in the save ({ev['liveEventId']}) does not match data/wars/{args.slug}.json "
            f"(its battles are outside the save's battle window) -- the save already moved on to another war."
        )

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
