"""
Add a captured war to the site in one command.

Usage:
  python3 scripts/add_war.py <capture.json> <slug> --season N --war N --result win|loss
        [--force] [--no-maps] [--no-units]

Steps (stops at the first real problem):
  1. validates the capture (it is a game3 response, our guild is in it, it has battles)
  2. copies it to data/wars/<slug>.json (refuses to overwrite a different file without --force)
  3. scripts/read_maps.py  -> data/wars/<slug>.maps.yaml (maps, boards, battlefield layouts) from the
     game save. Run this right after the capture: the save only keeps the latest war. If the save
     has already moved on, the war is still added with an existing maps.yaml, or you are told what
     to write by hand.
  4. scripts/sync_units.py -> portraits of any new character / machine of war (needs network)
  5. scripts/generate_site.py
  6. checks: pages exist, 15 boards, layouts, every unit of the capture has a portrait
"""
import argparse
import json
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS = os.path.join(ROOT, "scripts")
WARS = os.path.join(ROOT, "data", "wars")
OUR_GUILD = "Les Joyeux Psychopathes !"


def run(script, *args, allow_fail=False):
    cmd = [sys.executable, os.path.join(SCRIPTS, script), *args]
    print(f"\n$ python3 scripts/{script} {' '.join(args)}")
    r = subprocess.run(cmd, cwd=ROOT)
    if r.returncode and not allow_fail:
        sys.exit(f"{script} failed (exit {r.returncode}).")
    return r.returncode == 0


def validate(path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    try:
        resp = data["eventResults"][0]["eventResponseData"]
        logs, guilds = resp["activityLogs"], resp["guildData"]
    except (KeyError, IndexError):
        sys.exit("This does not look like a game3 capture (no eventResults[0].eventResponseData.activityLogs/guildData).")
    names = [g["name"] for g in guilds]
    if OUR_GUILD not in names:
        sys.exit(f"{OUR_GUILD!r} is not in this capture (guilds: {names}).")
    battles = [l for l in logs if l["type"] == "battleFinished"]
    if len(battles) < 300:
        print(f"WARNING: only {len(battles)} battles -- a complete war has ~560-600 (partial capture?).")
    opp = next(n for n in names if n != OUR_GUILD)
    units = set()
    for l in battles:
        for side in ("attacker", "defender"):
            d = l.get(side) or {}
            units.update(u["unitId"] for u in d.get("units", []))
            if d.get("machineOfWar"):
                units.add(d["machineOfWar"]["unitId"])
    return opp, len(battles), units


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("capture")
    ap.add_argument("slug")
    ap.add_argument("--season", type=int, required=True)
    ap.add_argument("--war", type=int, required=True)
    ap.add_argument("--result", choices=("win", "loss"), required=True)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--no-maps", action="store_true")
    ap.add_argument("--no-units", action="store_true")
    a = ap.parse_args()

    opp, n_battles, units = validate(a.capture)
    print(f"Capture OK: vs {opp}, {n_battles} battles, {len(units)} distinct units.")

    dest = os.path.join(WARS, a.slug + ".json")
    if os.path.exists(dest) and not a.force:
        with open(dest, "rb") as f1, open(a.capture, "rb") as f2:
            if f1.read() != f2.read():
                sys.exit(f"{dest} already exists with different content (use --force to replace it).")
    else:
        shutil.copyfile(a.capture, dest)
        print(f"Copied to data/wars/{a.slug}.json")

    maps_path = os.path.join(WARS, a.slug + ".maps.yaml")
    if not a.no_maps:
        ok = run("read_maps.py", a.slug, "--season", str(a.season), "--war", str(a.war), "--result", a.result, allow_fail=True)
        if not ok and not os.path.exists(maps_path):
            sys.exit(
                f"The game save no longer holds this war, so data/wars/{a.slug}.maps.yaml could not be written. "
                "Create it by hand (season, war_number, result, hard:/easy:, boards:, layout_*) and re-run with --no-maps."
            )
        if not ok:
            print("NOTE: read_maps could not run; keeping the existing maps.yaml.")

    if not a.no_units:
        run("sync_units.py", allow_fail=True)
    run("generate_site.py")

    # ---- checks
    problems = []
    for page in (f"docs/wars/{a.slug}.html", f"docs/wars/{a.slug}-strategie.html"):
        if not os.path.exists(os.path.join(ROOT, page)):
            problems.append(f"missing page {page}")
    if os.path.exists(maps_path):
        text = open(maps_path, encoding="utf-8").read()
        boards = [l for l in text.split("boards:")[1].splitlines()[1:] if l.startswith("  ") and ":" in l][:15] if "boards:" in text else []
        if len(boards) < 15:
            problems.append("fewer than 15 boards in the maps.yaml")
        if "layout_ours:" not in text:
            problems.append("no battlefield layout in the maps.yaml (default zone order will be used)")
    known = json.load(open(os.path.join(ROOT, "data", "units.json"), encoding="utf-8"))
    missing = sorted(u for u in units if u not in known)
    if missing:
        problems.append(f"no portrait for: {', '.join(missing)}")
    print("\n" + ("All checks passed." if not problems else "Needs attention:\n - " + "\n - ".join(problems)))
    print(f"Review with a local server, then commit and push (git add -A).")


if __name__ == "__main__":
    main()
