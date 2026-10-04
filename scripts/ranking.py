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
        # Raw per-battle "adj" score (see below) for every battle played --
        # not derivable from the bucketed tier counts above, and needed for
        # the site's per-player score-variance box plot. Only populated here
        # (from real activityLogs); legacy_ranking.py has no per-battle data
        # at all, so its player_stats simply omit this key.
        "scores": [],
    }


EXTRA_TIER_SCORE = {"win": 1200, "perfect": 1600, "finish": 850, "fail": None}
EXTRA_BUFF_IDS = {
    "MS": "EnvDefenderHealthBuff2", "AP": "EnvArtillerySupport", "AA": "EnvFlakFire",
    "AR": "EnvArmourSupplies", "FP": "EnvFortified", "LP": "EnvAngelsOfDeath",
}


def synthetic_battle_events(extra, players, start_ts):
    """Turn a hand-reported supplement (see <slug>.extra.json) into fake
    battleFinished events appended after the real capture, for a war whose
    capture stopped before the war did (the live data is overwritten by the
    next war, so the missing battles can only be reconstructed from what
    the user reports). Each fake event is shaped like a real one so the
    normal per-battle scoring below treats it identically -- win=1200 and
    perfect=1600 (both win tier; "win" counts include the perfects, see below), finish=850, fail=no score key -- and
    flagged "synthetic" so the timeline/milestone data (which would
    otherwise plot made-up timestamps) skips it."""
    by_name = {p["displayName"].lower(): uid for uid, p in players.items()}
    for alias, real in extra.get("aliases", {}).items():
        by_name[alias.lower()] = by_name[real.lower()]
    team = extra["team"]
    events = []
    n = 0
    for zone in extra["zones"]:
        buffs = [{"abilityId": EXTRA_BUFF_IDS[acr]} for acr, cnt in zone.get("buffs", {}).items() for _ in range(cnt)]
        # In the reported lists "win" is EVERY win a player got on the zone and
        # "perfect" is the subset of those that scored 1600 -- so only
        # win-minus-perfect of them are 1200s (counting them as two
        # separate tiers over-counted tokens, e.g. 18 for a player who has 10).
        tiers = dict(zone["players"])
        perfects = tiers.get("perfect", {})
        tiers["win"] = {name: cnt - perfects.get(name, 0) for name, cnt in tiers.get("win", {}).items()}
        for tier, entries in tiers.items():
            for name, count in entries.items():
                uid = by_name[name.lower()]
                for _ in range(count):
                    n += 1
                    e = {
                        "type": "battleFinished", "id": f"synthetic-{n}", "userId": uid, "teamIndex": team,
                        "createdOn": start_ts + n * 1000, "synthetic": True, "buffs": buffs,
                        "zone": {"id": f"synthetic-{zone['zone_type']}", "type": zone["zone_type"]},
                    }
                    if EXTRA_TIER_SCORE[tier] is not None:
                        e["score"] = EXTRA_TIER_SCORE[tier]
                    events.append(e)
    return events


def compute_ranking(json_path, maps, extra=None):
    """maps = {"hard": {zone_type: map_name, ...}, "easy": {zone_type: map_name, ...}}
    (each dict has up to 3 entries, per the game's 6-tracked-zones convention).
    extra = optional hand-reported supplement for a war whose capture stopped
    early, see synthetic_battle_events."""
    logs, players, guilds = load_war(json_path)
    war_start = logs[0]["createdOn"] if logs else 0
    war_end = logs[-1]["createdOn"] if logs else 0
    if extra:
        logs = logs + synthetic_battle_events(extra, players, war_end)

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
    # Per-battle (uid, team, timestamp, adjusted score) for the war-page
    # timeline chart (see render_timeline_svg in generate_site.py) -- kept
    # separate from ps["scores"] since that's a flat per-player list with no
    # timestamp, useless for plotting a battle against its real time-of-day.
    battle_events = []
    # Zone falls and full-guild wipeouts, for the war-page timeline's
    # milestone markers (see compute_ms_milestones in generate_site.py) --
    # `team` on both is the ATTACKING side that delivered the blow, same
    # convention as the win/fail/finish classification above, NOT the side
    # that got destroyed/wiped (see reference_tacticus_data_structure.md).
    zone_destroyed = []
    wipeouts = []
    # Running per-team fail tally, snapshotted onto every zone_destroyed and
    # wipeout the instant it fires below -- `totalAttempts` on those raw
    # events counts EVERY attempt (wins/finishes included, confirmed against
    # real data: a zone's totalAttempts can be >10x its actual fail count,
    # since a single zone often needs several separate win/finish hits to
    # fully clear its defenders, not just fails-then-one-final-blow), which
    # reads as a wildly inflated figure to the user -- they want a single
    # cumulative fail count they can read consistently across all three
    # milestones (R1:postmed / R2 / R2:postmed), each one further along the
    # same running total, not a per-zone count that resets. Never resets,
    # for any zone -- matches how wipeout.totalAttempts itself already
    # behaves (confirmed equal to the team's full battleFinished count up to
    # that moment, i.e. cumulative since war start, not since the previous
    # wipeout).
    team_fails = defaultdict(int)

    for e in logs:
        if e["type"] == "zoneDestroyed":
            zone_destroyed.append({
                "zone_type": e["zone"]["type"],
                "zone_id": e["zone"]["id"],
                "team": e["teamIndex"],
                "createdOn": e["createdOn"],
                "totalAttempts": e.get("totalAttempts"),
                "fails": team_fails[e["teamIndex"]],
            })
            continue
        if e["type"] == "wipeout":
            wipeouts.append({
                "team": e["teamIndex"],
                "createdOn": e["createdOn"],
                "totalAttempts": e.get("totalAttempts"),
                "fails": team_fails[e["teamIndex"]],
            })
            continue
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
        ps["scores"].append(adj)

        # Synthetic (hand-reported, see synthetic_battle_events) battles have
        # no real timestamp, so they count toward player stats but stay out
        # of the timeline data and the cumulative-fails milestones below.
        if not e.get("synthetic"):
            if tier == "fail":
                team_fails[team] += 1
            # Snapshotted after the increment above so a battle that was
            # itself a fail already counts toward its own fails_so_far --
            # lets the war-page "Fin" milestone (see render_war_page) read
            # the team's total fail count straight off the very last
            # battle_events entry, no separate pass needed.
            battle_events.append({
                "uid": uid, "team": team, "createdOn": e["createdOn"], "adj": adj,
                "fails_so_far": team_fails[team],
            })

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

    if extra:
        # A war reconstituted from a hand-reported supplement has a capture
        # that stopped before the war did, so any timing built from it (the
        # Chronologie chart, its milestones, the end date shown next to the
        # result badge, and its share of the season/index aggregates) would
        # be misleadingly truncated -- drop it entirely, same as a legacy
        # war, which has no timing data either.
        battle_events, zone_destroyed, wipeouts = [], [], []

    return {
        "players": players,
        "guilds": guilds,
        "player_stats": player_stats,
        "hard_cols": hard_cols,
        "easy_cols": easy_cols,
        "war_start": war_start,
        "war_end": war_end,
        "battle_events": battle_events,
        "zone_destroyed": zone_destroyed,
        "wipeouts": wipeouts,
    }
