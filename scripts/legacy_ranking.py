"""
Compute an approximate v4 ranking for a war that predates the mitmproxy
capture setup, from a hand-transcribed aggregate summary (no activityLogs
JSON exists for these). See data/wars/*.legacy.json for the input shape.

The aggregate columns don't carry enough information to reproduce the v4
formula exactly, so this applies the reconciliation rules validated with
the user for the "Bloody Rose: Palatines" (season 27, war 1) migration:
  - perfect  -> count of 1600-tier wins (10 pts each)
  - win - perfect -> remaining wins assumed 1200-tier "dans le doute" (7 pts each)
  - finish   -> tier unknown, assumed lowest "650-" bucket (5 pts each) to
                avoid overestimating
  - fail     -> 0 pts, as in the normal formula
  - ms       -> raw MS count was ambiguous between 1 and 2 buffs per battle,
                so multiplied by 1.5 before scoring at 2 pts each
  - buffs    -> aggregate non-MS buff count (AP/AA/AR/FP/LP can't be told
                apart), scored at 0.5 pt each like any other buff, and
                surfaced in the AP column for visibility
  - map/zone bonus -> unrecoverable, omitted entirely
"""
import json

from ranking import TOKENS_PER_WAR


def load_legacy(json_path):
    with open(json_path, encoding="utf-8") as f:
        return json.load(f)


def compute_legacy_ranking(json_path):
    data = load_legacy(json_path)
    opponent = data["opponent"]

    players = {}
    guilds = {0: {"name": "Les Joyeux Psychopathes !", "teamIndex": 0},
               1: {"name": opponent, "teamIndex": 1}}

    player_stats = {}
    for name, row in data["players"].items():
        uid = row["userId"]
        players[uid] = {"userId": uid, "displayName": name}

        win = row.get("win", 0)
        finish = row.get("finish", 0)
        fail = row.get("fail", 0)
        perfect = row.get("perfect", 0)
        ms = row.get("ms", 0)
        buffs = row.get("buffs", 0)

        other_wins = max(0, win - perfect)
        ms_effective = ms * 1.5

        pts = perfect * 10 + other_wins * 7 + finish * 5
        pts += ms_effective * 2
        pts += buffs * 0.5

        player_stats[uid] = {
            "pts": pts, "kills": 0, "win": win, "fail": fail, "finish": finish,
            "played": win + finish + fail,
            "miss": max(0, TOKENS_PER_WAR - (win + finish + fail)),
            "MS": ms_effective, "AP": buffs, "AA": 0, "AR": 0, "FP": 0, "LP": 0,
            "1600": perfect, "1400": 0, "1200_1050": other_wins, "1100_850": 0, "650-": finish,
            "team": 0,
        }

    return {
        "players": players,
        "guilds": guilds,
        "player_stats": player_stats,
        "hard_cols": [],
        "easy_cols": [],
        "war_start": 0,
    }
