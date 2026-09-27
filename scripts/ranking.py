"""
Compute the v4 per-player guild-war ranking from a captured game-event/game3
activity log, parameterized by a per-war map-difficulty file.

See reference_tacticus_ranking_formula.md (Claude memory) for the formula
history and reference_tacticus_data_structure.md for the JSON shape.
"""
import json
from collections import defaultdict

WIN_VALUES = {1100, 1200, 1400, 1600}
FAIL_VALUES = {0, 200, 400, 600, 800, 1000}
FINISH_VALUES = {250, 450, 650, 850, 1050}
FAIL_SHIFTED_VALUES = {v + 25 for v in FAIL_VALUES}
TOLERANCE = 5

TIER_POINTS = {1600: 10, 1400: 8, 1200: 7, 1100: 6, 1050: 7, 850: 6, 650: 5, 450: 5, 250: 5}
TIER_BUCKET = {
    1600: "1600", 1400: "1400", 1200: "1200_1050", 1050: "1200_1050",
    1100: "1100_850", 850: "1100_850", 650: "650-", 450: "650-", 250: "650-",
}

BUFF_ACRONYM = {
    "EnvDefenderHealthBuff2": "MS",
    "EnvArtillerySupport": "AP",
    "EnvFlakFire": "AA",
    "EnvArmourSupplies": "AR",
    "EnvFortified": "FP",
    "EnvAngelsOfDeath": "LP",
}

TOKENS_PER_WAR = 10


def zone_clear_bonus(zone_type):
    if zone_type == "HQ":
        return 40000
    if zone_type == "SupplyDepot":
        return 30000
    if zone_type.startswith("Trenches"):
        return 10000
    return 16000


def _closest(value, options):
    return min(abs(value - v) for v in options)


def _closest_key(value, options):
    return min(options, key=lambda v: abs(value - v))


def load_war(json_path):
    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)

    logs, players, guilds = [], {}, {}
    for er in data.get("eventResults", []):
        erd = er.get("eventResponseData", {})
        if "activityLogs" in erd:
            logs.extend(erd["activityLogs"])
        for p in erd.get("playerData", []):
            players[p["userId"]] = p
        for g in erd.get("guildData", []):
            guilds[g["teamIndex"]] = g

    logs.sort(key=lambda e: e.get("createdOn", 0))
    return logs, players, guilds


def classify(e, adj):
    if e.get("abandoned"):
        return "abandoned"
    if "score" not in e:
        return "fail"
    if _closest(adj, WIN_VALUES) <= TOLERANCE:
        return "win"
    elif _closest(adj, FAIL_VALUES) <= TOLERANCE:
        return "fail"
    elif _closest(adj, FINISH_VALUES) <= TOLERANCE:
        return "finish"
    elif _closest(adj, FAIL_SHIFTED_VALUES) <= TOLERANCE:
        return "finish"
    else:
        return "unknown"


def blank_stats():
    return {
        "pts": 0.0, "kills": 0, "win": 0, "fail": 0, "finish": 0, "played": 0,
        "MS": 0, "AP": 0, "AA": 0, "AR": 0, "FP": 0, "LP": 0,
        "1600": 0, "1400": 0, "1200_1050": 0, "1100_850": 0, "650-": 0,
        "hard1": 0, "hard2": 0, "hard3": 0, "easy1": 0, "easy2": 0, "easy3": 0,
        "team": None,
    }


def compute_ranking(json_path, maps):
    """maps = {"hard": {zone_type: map_name, ...}, "easy": {zone_type: map_name, ...}}
    (each dict has up to 3 entries, per the game's 6-tracked-zones convention)"""
    logs, players, guilds = load_war(json_path)

    hard_zones = maps.get("hard", {}) if maps else {}
    easy_zones = maps.get("easy", {}) if maps else {}
    hard_cols = list(hard_zones.items())  # [(zone_type, map_name), ...]
    easy_cols = list(easy_zones.items())

    last_battle_per_zone = {}
    finisher_ids = set()
    for e in logs:
        zone = e.get("zone")
        if not zone:
            continue
        zid = zone["id"]
        if e["type"] == "battleFinished":
            last_battle_per_zone[zid] = e["id"]
        elif e["type"] == "zoneDestroyed" and zid in last_battle_per_zone:
            finisher_ids.add(last_battle_per_zone[zid])

    player_stats = defaultdict(blank_stats)

    for e in logs:
        if e["type"] != "battleFinished" or e.get("abandoned"):
            continue
        uid = e["userId"]
        team = e["teamIndex"]
        zt = e["zone"]["type"]
        is_destroyer = e["id"] in finisher_ids
        raw = e.get("score", 0)
        adj = raw - zone_clear_bonus(zt) if is_destroyer else raw
        tier = classify(e, adj)

        ps = player_stats[uid]
        ps["team"] = team
        ps["played"] += 1

        if tier == "win":
            k = 5
        elif tier == "fail":
            k = round(adj / 200)
        elif tier == "finish":
            if _closest(adj, FINISH_VALUES) <= TOLERANCE:
                k = round((adj - 50) / 200)
            else:
                k = round((adj - 25) / 200)
        else:
            k = 0
        k = max(0, min(5, k))
        ps["kills"] += k

        if tier == "win":
            ps["win"] += 1
        elif tier == "fail":
            ps["fail"] += 1
        elif tier == "finish":
            ps["finish"] += 1

        if tier in ("win", "finish"):
            closest_v = _closest_key(adj, list(TIER_POINTS.keys()))
            ps["pts"] += TIER_POINTS[closest_v]
            ps[TIER_BUCKET[closest_v]] += 1

        buff_counts = defaultdict(int)
        for b in e.get("buffs", []):
            acr = BUFF_ACRONYM.get(b.get("abilityId"))
            if acr:
                buff_counts[acr] += 1
        for acr, cnt in buff_counts.items():
            ps[acr] += cnt
        if buff_counts.get("MS"):
            ps["pts"] += buff_counts["MS"] * 2
        for acr in ("AR", "FP", "AP", "AA", "LP"):
            ps["pts"] += buff_counts.get(acr, 0) * 0.5

        if tier in ("win", "finish"):
            for i, (zone_type, _name) in enumerate(hard_cols, start=1):
                if zt == zone_type:
                    ps[f"hard{i}"] += 1
                    ps["pts"] += 2
            for i, (zone_type, _name) in enumerate(easy_cols, start=1):
                if zt == zone_type:
                    ps[f"easy{i}"] += 1
                    ps["pts"] += 0.5

    for ps in player_stats.values():
        ps["miss"] = max(0, TOKENS_PER_WAR - ps["played"])

    war_start = logs[0]["createdOn"] if logs else 0

    return {
        "players": players,
        "guilds": guilds,
        "player_stats": player_stats,
        "hard_cols": hard_cols,
        "easy_cols": easy_cols,
        "war_start": war_start,
    }
