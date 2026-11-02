"""
Keep the game save's guild-war config (every zone's boardId + each guild's real battlefield layout)
BEFORE the game overwrites it.

user_progression.json only holds the war that is current right now: as soon as a war ends, the next
war's PREP replaces it (G4 ended 08:44, the G5 prep was already in the file at 09:02). So run this at
any time during a war or its prep -- or let it run on a schedule -- and read_maps.py will find the
right snapshot when you add the war later.

Usage: python3 scripts/snapshot_war.py          # writes data/snapshots/<liveEventId>.json
"""
import datetime
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAVE = os.path.expanduser("~/Library/Application Support/com.snowprintstudios.tacticus/user_progression.json")
SNAP_DIR = os.path.join(ROOT, "data", "snapshots")
OUR_GUILD = "Les Joyeux Psychopathes !"


def ms_date(s):
    m = re.search(r"/Date\((\d+)\)/", s or "")
    return int(m.group(1)) if m else None


def extract_snapshots(save):
    """One snapshot dict per guild-war event (prep or war) found in the save."""
    out = []
    for ev in save.get("liveEvents", {}).get("liveEvents", []):
        for comp in ev.get("components", []):
            zones = (comp.get("config") or {}).get("zoneTypeConfigs")
            if not zones:
                continue
            teams = {k: comp[k] for k in ("team", "team1", "team2") if k in comp}
            layouts = {}
            for key, t in teams.items():
                rows = [[z["warZoneType"] for z in row] for row in t.get("defendingFrontline", {}).get("warZones", [])]
                name = t.get("guildWarGuildData", {}).get("guildName")
                if rows:
                    layouts["ours" if name == OUR_GUILD else "theirs"] = rows
            slot = ev.get("activeTimeSlot") or {}
            out.append({
                "liveEventId": ev["liveEventId"],
                "kind": "prep" if "prep" in ev["liveEventId"] else "war",
                "slot_start": ms_date(slot.get("start")),
                "slot_end": ms_date(slot.get("end")),
                "boards": {z: v["boardId"] for z, v in zones.items()},
                "layouts": layouts,
            })
    return out


def stored_snapshots():
    if not os.path.isdir(SNAP_DIR):
        return []
    out = []
    for name in sorted(os.listdir(SNAP_DIR)):
        if name.endswith(".json"):
            with open(os.path.join(SNAP_DIR, name), encoding="utf-8") as f:
                out.append(json.load(f))
    return out


HOUR = 3600 * 1000


def matches(snap, first_battle_ms):
    """Does this snapshot belong to the war whose first battle was at first_battle_ms?
    A war event: the battle falls inside its window. A prep event: the battles start when the
    prep window ends (a few hours of slack either side)."""
    s, e = snap["slot_start"], snap["slot_end"]
    if not s or not e:
        return False
    if snap["kind"] == "war":
        return s - 6 * HOUR <= first_battle_ms <= e + 6 * HOUR
    return e - 6 * HOUR <= first_battle_ms <= e + 30 * HOUR


def best_snapshot(snaps, first_battle_ms):
    """The matching snapshot, preferring a war event (has both guilds' layouts) over a prep one."""
    cands = [s for s in snaps if matches(s, first_battle_ms)]
    cands.sort(key=lambda s: (s["kind"] == "war", s.get("captured_at", "")), reverse=True)
    return cands[0] if cands else None


def main():
    with open(SAVE, encoding="utf-8") as f:
        save = json.load(f)
    os.makedirs(SNAP_DIR, exist_ok=True)
    now = datetime.datetime.now().isoformat(timespec="seconds")
    for snap in extract_snapshots(save):
        path = os.path.join(SNAP_DIR, snap["liveEventId"] + ".json")
        old = None
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                old = json.load(f)
        # don't lose a better (more complete) copy: only overwrite if the layouts did not shrink
        if old and {k: old[k] for k in ("boards", "layouts")} == {k: snap[k] for k in ("boards", "layouts")}:
            print(f"{snap['liveEventId']}: unchanged")
            continue
        if old and len(old.get("layouts", {})) > len(snap["layouts"]):
            print(f"{snap['liveEventId']}: kept the existing, more complete snapshot")
            continue
        snap["captured_at"] = now
        with open(path, "w", encoding="utf-8") as f:
            json.dump(snap, f, ensure_ascii=False, indent=1)
        print(f"{snap['liveEventId']}: saved ({snap['kind']}, layouts: {', '.join(snap['layouts']) or 'none'})")


if __name__ == "__main__":
    main()
