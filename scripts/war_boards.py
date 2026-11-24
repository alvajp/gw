#!/usr/bin/env python3
"""The guild war boards of the game -> docs/data/war-boards.json + docs/assets/war-boards/<board>.webp (what the Simulation board page draws).

For every board of data/maps.json: the picture of the board (same crop and lattice as the replay viewer, see replays.extract_map), its cells [column, row, tile, elevation, kind, rotation]
and the spawn sets (the start hexes of the attackers and of the defenders) from the board's logical configuration in the game's bundle. Needs UnityPy + Pillow and the game's
files on this Mac (use the UnityPy venv python); the results are committed:

    python3 scripts/war_boards.py
"""
import glob
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "scripts"))
import replays  # noqa: E402

DOCS = os.path.join(ROOT, "docs")
WAR_GEO = replays.WAR_GEO  # the lattice of the war boards' pictures (see replays.py)


def logical_board(name):
    import UnityPy
    for f in glob.glob(os.path.join(replays.BUNDLES, name + "_*.resource")):
        if "_texture_" in f:
            continue
        for obj in UnityPy.load(f).objects:
            if obj.type.name == "MonoBehaviour":
                try:
                    t = obj.read_typetree()
                except Exception:
                    continue
                if "SpawnPointSets" in t:
                    return t
    return None


def main():
    import UnityPy
    UnityPy.config.FALLBACK_UNITY_VERSION = "6000.3.13f1"
    maps = json.load(open(os.path.join(ROOT, "data", "maps.json"), encoding="utf-8"))["maps"]
    replays.MAPS_DIR = os.path.join(DOCS, "assets", "war-boards")
    slots = json.load(open(os.path.join(ROOT, "data", "war_board_slots.json"), encoding="utf-8"))
    out = {}
    for board in maps:
        t = logical_board(board.lower())
        if t is None:
            print("no board", board)
            continue
        cols, rows = t["Width"], t["Height"]
        pic = replays.extract_map(board, cols, rows, WAR_GEO)
        if pic is None:
            print("no picture", board)
            continue
        pic["src"] = "war-boards/" + board.lower() + ".webp"
        cells = []
        for c, column in enumerate(t["Tiles"]):
            for r, tile in enumerate(column["Tile"]):
                kind = 1 if tile["TileId"] in ("Block", "Water") else 0
                if tile["ForceUnplayable"]:
                    kind = 2
                cells.append([c, r, tile["TileId"], tile["Elevation"], kind, tile["Rotation"]])
        sets = []
        for s in t["SpawnPointSets"]:
            sets.append([{"team": g["TeamWithPlayerIndex"], "mow": g["MachineOfWarPosition"], "pts": [[p["Column"], p["Row"]] for p in g["SpawnPoints"]]} for g in s["SpawnPointGroups"]])
        start = slots.get(board, {})
        out[board] = {"name": maps[board]["name"], "w": cols, "h": rows, "pic": pic, "cells": cells, "sets": sets, "start": {"o": start.get("o", []), "e": start.get("e", []), "set": start.get("set")}}
        print(board, cols, rows, len(sets), "sets")
    with open(os.path.join(DOCS, "data", "war-boards.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))


if __name__ == "__main__":
    main()
