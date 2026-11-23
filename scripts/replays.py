#!/usr/bin/env python3
"""Replays of the game's "download replay" button (~/Library/Application Support/com.snowprintstudios.tacticus/replays/*.replay.txt, a copy of them in
~/tacticus-replays-archive/; the game keeps only the 10 latest) -> what the Replay page of the site plays.

A replay file is three lines: a JSON snapshot, an empty line, then base64(gzip(JSON)). That JSON holds the battle's configuration (board, units, boss), the
messages the player sent (add a unit, move, use an ability, end turn) and, for each message, the text log the game's engine wrote while resolving it (groups /
actions / tags, e.g. "Action=UnitDamaged Entity=159 / Tag=Amount:2610"). Nothing is recomputed here: the log is only read and boiled down to a compact JSON.

  python3 scripts/replays.py [--dir DIR] [file ...]     write docs/data/replays/<id>.json and the index docs/data/replays.json (attack -> replay)

Raid attacks are matched with the guild raid API data (data/raid/season-*.json, see fetch_raid.py): same player, same boss and the same damage (the damage the log
shows on the boss is exactly the API's damageDealt; the boss's HP at the start is not a safe key: two players can fight at the same time).
"""
import base64
import glob
import gzip
import hashlib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import medals as medals_mod  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "docs", "data", "replays")
INDEX = os.path.join(ROOT, "docs", "data", "replays.json")
DEFAULT_DIR = os.path.expanduser("~/tacticus-replays-archive")
RAID_DIR = os.path.join(ROOT, "data", "raid")
MAPS_DIR = os.path.join(ROOT, "docs", "assets", "replay-maps")
BUNDLES = os.path.expanduser("~/Library/Caches/tacticus/games/*/Tacticus.app/Contents/Resources/Data/StreamingAssets/Bundles/boards/gb")


def load(path):
    """The decoded replay (dict) of a *.replay.txt file."""
    lines = open(path, encoding="utf-8").read().split("\n")
    blob = next(l for l in reversed(lines) if l.strip())
    return json.loads(gzip.decompress(base64.b64decode(blob)))


# ---------------------------------------------------------------------------------------------------------------------------------------------------
# the engine's text log: "Group=<name> Entity=<n> Source=<ability> InitialTarget=<n>" ... "Finish_Group", "Action=<name> Entity=<n>" followed by "Tag=<key>:<value>" lines
# ---------------------------------------------------------------------------------------------------------------------------------------------------
_G = re.compile(r"\s*Group=(\w+) Entity=(\S+) Source=(\S*) InitialTarget=(\S*)")
_A = re.compile(r"\s*Action=(\w+) Entity=(\S+)")
_T = re.compile(r"\s*Tag=([^:]+):(.*)")


def parse_log(text):
    """-> list of top-level nodes {t: "G"|"A", n: name, e: entity, s: source, it: initial target, tags: {}, ch: [children]}."""
    root = {"ch": []}
    stack = [root]
    last = None
    for line in text.split("\n"):
        m = _G.match(line)
        if m:
            node = {"t": "G", "n": m.group(1), "e": m.group(2), "s": m.group(3), "it": m.group(4), "tags": {}, "ch": []}
            stack[-1]["ch"].append(node)
            stack.append(node)
            last = None
            continue
        if line.strip() == "Finish_Group":
            if len(stack) > 1:
                stack.pop()
            last = None
            continue
        m = _A.match(line)
        if m:
            last = {"t": "A", "n": m.group(1), "e": m.group(2), "tags": {}, "ch": []}
            stack[-1]["ch"].append(last)
            continue
        m = _T.match(line)
        if m and last is not None:
            last["tags"][m.group(1)] = m.group(2)
    return root["ch"]


def _int(v, default=0):
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def walk(node):
    """Every action of the node, in log order (depth first)."""
    if node["t"] == "A":
        yield node
    for c in node["ch"]:
        yield from walk(c)


def tile_ids(tags):
    """The tile ids of a unit's footprint (Unit_Foot_Tile_Id_1..n)."""
    out = []
    for k in sorted((k for k in tags if k.startswith("Unit_Foot_Tile_Id_")), key=lambda k: int(k.rsplit("_", 1)[1])):
        out.append(_int(tags[k]))
    return out


def convert(rp, file_id):
    """The compact replay: {v, mode, ver, board, boss, steps ...} (see the docstring of the viewer, docs/assets/replay.js)."""
    md, bc = rp["MetaData"], rp["BattleConfiguration"]
    board = bc["Board"]
    msgs = rp["Messages"]
    inputs = [json.loads(m["Message"]["MessageJson"]) for m in msgs]
    streams = [parse_log(m["OutputStream"]) for m in msgs]
    me = (rp.get("RecordedPlayerIds") or [None])[0]

    # tiles (entity id -> column, row) and players (entity id of the player -> ours?)
    tile_pos, owner_side = {}, {}
    for stream in streams:
        for node in stream:
            for a in walk(node):
                if a["n"] == "AddTile":
                    tile_pos[_int(a["e"])] = (_int(a["tags"].get("Tile_Column")), _int(a["tags"].get("Tile_Row")))
                elif a["n"] == "AddPlayer":
                    owner_side[a["e"]] = 0 if _int(a["tags"].get("Player_Id")) == me else 1  # 0 = the player's side, 1 = the boss's side
    # stats of the configured units, to name the enemies the log does not name (unit stats are the same for a given unit)
    by_stats = {}
    for u in bc.get("Units", []):
        by_stats.setdefault((u.get("Health"), u.get("FixedArmor"), u.get("Damage")), set()).add(u.get("Id"))

    def pos(tid):
        return list(tile_pos.get(tid, (-1, -1)))

    units = {}  # entity id -> static info
    steps = []
    boss_unit = (bc.get("BossUnit") or {}).get("UnitId")
    setup_end = next((i for i, m in enumerate(inputs) if m.get("Name") == "StartBattleMessage"), -1)
    round_no = 0

    for mi, (inp, stream) in enumerate(zip(inputs, streams)):
        name = inp.get("Name")
        for node in stream:
            ev, label, actor, target = [], None, None, None
            for a in walk(node):
                tg, an = a["tags"], a["n"]
                if an == "AddUnit":
                    e = _int(a["e"])
                    side = owner_side.get(tg.get("Unit_Owner_Id"), 1)
                    units[e] = {"o": side, "b": tg.get("UnitStats_IsBoss") == "1", "t": tile_ids(tg), "parent": _int(tg.get("Unit_Parent_Id"))}
                    ev.append(["add", e])
                elif an == "AddMachine":  # a machine of war: on its platform, not on the board
                    e = _int(a["e"])
                    units[e] = {"o": owner_side.get(tg.get("Unit_Owner_Id"), 1), "b": False, "t": [], "parent": 0, "hp": 0, "hp0": 0, "m": 1}
                    ev.append(["add", e])
                elif an == "ChangeStats" and _int(a["e"]) in units and "UnitStats_MaxHealth" in tg:
                    u = units[_int(a["e"])]
                    if "hp" not in u:
                        u["hp"] = _int(tg["UnitStats_MaxHealth"])
                        u["hp0"] = _int(tg.get("UnitStats_InitRemainingHealth"), u["hp"])
                        u["m"] = _int(tg.get("UnitStats_MaxMembers"), 1)
                        u["st"] = (u["hp"], _int(tg.get("UnitStats_FixedArmor")), _int(tg.get("UnitStats_Attack")))
                        u["stats"] = {"atk": _int(tg.get("UnitStats_Attack")), "arm": _int(tg.get("UnitStats_FixedArmor")), "mov": _int(tg.get("UnitStats_Movement")),
                                      "crit": _int(tg.get("UnitStats_CritChance")), "cd": _int(tg.get("UnitStats_CritDamage")), "rng": _int(tg.get("UnitStats_Range"))}
                elif an == "ChangePosition":
                    ev.append(["mv", _int(a["e"]), [pos(t) for t in tile_ids(tg)]])
                elif an == "UnitDamaged":
                    ev.append(["dmg", _int(tg.get("Target_Id")), _int(tg.get("Attacker_Id")), _int(tg.get("Amount")),
                               1 if tg.get("Attack_DidCrit") == "1" else 0, 1 if tg.get("Attack_DidBlock") == "1" else 0,
                               1 if tg.get("Attack_DidEvade") == "1" else 0, _int(tg.get("UnitStats_RemainingHealth")),
                               _int(tg.get("UnitStats_NumberOfMembers"))])
                elif an in ("RemoveUnit", "DirectlyKillUnit"):
                    ev.append(["rm", _int(a["e"])])
                elif an == "PrepareTurn":
                    pid = tg.get("Match_CurrentPlayerId")  # whose turn it starts
                    side = owner_side.get(pid, None)
                    if side is not None:
                        if side == 0:
                            round_no = _int(tg.get("Match_AmountOfTurnsStartedByCurrentPlayer"), round_no + 1)
                        ev.append(["turn", side, round_no])
            if node["t"] == "G" and node["n"] in ("User_UseAbility", "User_MoveUnit"):
                label = node["s"] or node["n"]
                actor, target = _int(node["e"]), _int(node["it"], None) if node["it"] else None
            elif node["t"] == "G" and node["n"] == "StartTurn":
                label = "StartTurn"
            steps.append({"i": len(steps), "m": mi, "setup": mi <= setup_end, "n": node["n"], "l": label, "a": actor, "t": target, "ev": ev})

    # names: our units come from the AddUnitMessage / AddMachineMessage that created them, the enemies from their stats
    for mi, inp in enumerate(inputs):
        if inp.get("Name") in ("AddUnitMessage", "AddMachineMessage"):
            for node in streams[mi]:
                for a in walk(node):
                    if a["n"] in ("AddUnit", "AddMachine") and _int(a["e"]) in units and units[_int(a["e"])]["o"] == 0 and "id" not in units[_int(a["e"])]:
                        units[_int(a["e"])]["id"] = inp.get("UnitId")
                        units[_int(a["e"])]["mow"] = inp.get("Name") == "AddMachineMessage"
                        break
    for e, u in units.items():
        if u["b"] and boss_unit:
            u["id"] = boss_unit
        elif "id" not in u and u.get("st") and len(by_stats.get(u["st"], ())) == 1:
            u["id"] = next(iter(by_stats[u["st"]]))
    for u in units.values():
        u.pop("st", None)
        u["t"] = [pos(t) for t in u["t"]]

    # the board: [column, row, tile id, elevation, kind] per cell (kind: 0 walkable, 1 blocking (wall, water ...), 2 not playable / no deployment)
    walk_type = {t["Id"]: t.get("WalkableType", 0) for t in bc.get("Tiles", [])}
    cells = []
    for col, column in enumerate(board.get("Tiles", [])):
        for row, t in enumerate(column.get("Tile", [])):
            kind = walk_type.get(t.get("TileId"), 0)
            cells.append([col, row, t.get("TileId"), t.get("Elevation", 0), 2 if t.get("ForceUnplayable") and not kind else kind])
    boss = bc.get("BossUnit") or {}
    return {
        "v": 1, "id": file_id, "mode": md.get("Mode"), "ver": md.get("GameVersion"), "map": board.get("Id"), "w": board.get("Width"), "h": board.get("Height"),
        "cells": cells, "tile0": min(tile_pos) if tile_pos else 0, "boss": boss.get("UnitId"), "hp0": boss.get("RemainingHealth"), "max": boss.get("Health"),
        "rounds": (bc.get("Victory") or {}).get("VictoryConditions", {}).get("MainPlayerRoundLimitation"), "user": md.get("UserId"),
        "units": {str(k): v for k, v in units.items()}, "steps": [s for s in steps if s["ev"] or s["l"]],
    }


# The board's picture ("GB_<board>_Visual", 2048 x 2048, from the game's bundles) is a slightly tilted view (the rows are squashed to 0.90), so the grid is not a regular one:
# flat-top hexagons of radius R pixels, columns 1.5 R apart, rows sy * sqrt(3) * R apart, the even columns of the picture half a row lower. The lattice was fitted on the metal
# tiles of the platforms (edge maps of 4 boards, then checked on the walls / elevated cells of the replays). The board's own configuration in the bundle says where the
# playable 7 x 10 cells sit in the 13 x 15 visual grid: logical column c is visual column PlayableMinCol + c, logical row r is picture row PlayableMaxRow - r (row 0 at the bottom).
GEO = {"R": 91.5, "sy": 0.90, "ox": 104.0, "oy": 32.0}


def _bundle_config(name):
    """(PlayableMinCol, PlayableMaxRow) from the board's visual configuration in the game's bundle, None when unreadable."""
    import UnityPy
    for f in glob.glob(os.path.join(BUNDLES, name + "_*.resource")):
        if "_texture_" in f:
            continue
        for obj in UnityPy.load(f).objects:
            if obj.type.name == "MonoBehaviour":
                try:
                    t = obj.read_typetree()
                except Exception:
                    continue
                if "PlayableMinCol" in t:
                    return t["PlayableMinCol"], t["PlayableMaxRow"]
    return None


def extract_map(board, cols, rows):
    """The game's own picture of a raid board -> docs/assets/replay-maps/<board>.webp (cropped around the playable cells); returns {src, x0, y0, w, h, c0, r0, + GEO}: the
    crop's box in texture pixels and where the playable cells sit in the lattice. None when the picture cannot be read (needs UnityPy + Pillow and the game's files on this Mac)."""
    name = board.lower()
    try:
        import UnityPy
    except ImportError:
        return None
    UnityPy.config.FALLBACK_UNITY_VERSION = "6000.3.13f1"
    cfg = _bundle_config(name)
    if cfg is None:
        return None
    c0, r0 = cfg
    R, sy, ox, oy = GEO["R"], GEO["sy"], GEO["ox"], GEO["oy"]
    hs = sy * 3 ** 0.5 * R
    xs = [ox + R + (c + c0) * 1.5 * R for c in range(cols)]
    ys = [oy + (r0 - r + (0.5 if (c + c0) % 2 == 0 else 0)) * hs + hs / 2 for c in range(cols) for r in range(rows)]
    m = 0.6 * R
    box = [max(0, int(min(xs) - R - m)), max(0, int(min(ys) - hs / 2 - m)), min(2048, int(max(xs) + R + m) + 1), min(2048, int(max(ys) + hs / 2 + m) + 1)]
    pic = {"src": "replay-maps/" + name + ".webp", "x0": box[0], "y0": box[1], "w": box[2] - box[0], "h": box[3] - box[1], "c0": c0, "r0": r0, **GEO}
    out = os.path.join(MAPS_DIR, name + ".webp")
    found = glob.glob(os.path.join(BUNDLES, name + "_texture_*.resource"))
    if not found:
        return None
    for obj in UnityPy.load(found[0]).objects:
        if obj.type.name == "Texture2D":
            os.makedirs(MAPS_DIR, exist_ok=True)
            obj.read().image.crop(box).save(out, "WEBP", quality=82, method=6)
            return pic
    return None


def raid_index():
    """(user id, boss unit id, damage dealt) -> the raid attack's API entry (+ its season), from the guild raid API data."""
    out = {}
    for path in sorted(glob.glob(os.path.join(RAID_DIR, "season-*.json"))):
        season = int(re.search(r"season-(\d+)", path).group(1))
        for e in json.load(open(path, encoding="utf-8")).get("entries", []):
            if e.get("damageType") == "Battle" and e.get("unitId") and e.get("remainingHp") is not None:
                out.setdefault((e["userId"], e["unitId"], e["damageDealt"]), dict(e, season=season))
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    folder = DEFAULT_DIR
    if "--dir" in sys.argv:
        folder = sys.argv[sys.argv.index("--dir") + 1]
        args = [a for a in args if a != folder]
    files = args or sorted(glob.glob(os.path.join(folder, "*.replay.txt")))
    os.makedirs(OUT_DIR, exist_ok=True)
    index = json.load(open(INDEX, encoding="utf-8")) if os.path.exists(INDEX) else {}
    raid = raid_index()
    for f in files:
        rp = load(f)
        md = rp["MetaData"]
        if md.get("Mode") != "GuildBoss":  # raids only for now (guild wars next)
            print("skip", os.path.basename(f), md.get("Mode"))
            continue
        boss = rp["BattleConfiguration"]["BossUnit"]
        rid = hashlib.sha256(open(f, "rb").read()).hexdigest()[:12]
        data = convert(rp, rid)
        pic = extract_map(data["map"], data["w"], data["h"])
        if pic:
            data["pic"] = pic
        boss_entities = {k for k, u in data["units"].items() if u["b"]}
        data["dmg"] = sum(ev[3] for s in data["steps"] for ev in s["ev"] if ev[0] == "dmg" and str(ev[1]) in boss_entities)  # damage dealt to the boss in the battle
        hit = raid.get((md["UserId"], boss["UnitId"], data["dmg"]))
        at = hit and hit.get("completedOn")
        if hit:  # what the raid API knows about the attack: the boss's key (records / metas pages), the level, the season, when
            data.update({"key": medals_mod._medal_key(hit), "lvl": medals_mod.level_label(hit), "season": hit["season"], "at": at})
        with open(os.path.join(OUT_DIR, rid + ".json"), "w", encoding="utf-8") as out:
            json.dump(data, out, ensure_ascii=False, separators=(",", ":"))
        if at:
            index[f"{md['UserId']}|{at}"] = rid
        print(os.path.basename(f), "->", rid, f"{os.path.getsize(os.path.join(OUT_DIR, rid + '.json')) // 1024} Ko", "relié à l'attaque" if at else "(attaque non retrouvée)")
    with open(INDEX, "w", encoding="utf-8") as out:
        json.dump(dict(sorted(index.items())), out, indent=0)


if __name__ == "__main__":
    main()
