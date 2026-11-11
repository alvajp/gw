"""
Medals shown on the player pages (Onslaught badge art) and the raid ranking:
  * best all-time relative damage per raid boss and sub-boss (every season and difficulty, the % above the guild average, no bombs,
    finishes or one-shots) -> top 3 members (orange / teal / gold = Onslaught mythic / legendary / epic frames), from the raid
    history in data/raid/ (fetch_raid.py, guild key, seasons 82 to the latest);
  * median guild-war battle score >= 1600 (1600 is the score cap, so "above 1600" can never happen) and
  * guild-war reliability > 90 % ((wins + finishes) / all tokens), both with the Onslaught "challenge" frame.
Every medal is shown on every page; the ones a player did not earn are greyed out.
"""
import glob
import json
import os
import statistics
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAID_DIR = os.path.join(ROOT, "data", "raid")

# raid boss (API type, display name, [(sub-boss unitId, our unit id or art name, display name)]); the order is the order of the
# medals: each boss followed by its sub-bosses. Sub-boss art = the unit portrait (docs/assets/units) or docs/assets/bosses/<name>.
BOSSES = [
    ("Magnus", "Magnus", [("GuildBoss9MiniBoss1ThousSorcerer", "thousSorcerer", "Thaumachus"), ("GuildBoss9MiniBoss2ThousInfernalMaster", "thousInfernalMaster", "Abraxas")]),
    ("Lion", "Lion El'Jonson", [("GuildBoss12MiniBoss1DarkaTerminator", "darkaTerminator", "Baraqiel"), ("GuildBoss12MiniBoss2DarkaCompanion", "darkaCompanion", "Forcas")]),
    ("SilentKing", "Silent King", [("GuildBoss3Minion3NecroMenhir", "bosses:Menhir", "Menhir")]),
    ("Mortarion", "Mortarion", [("GuildBoss5MiniBoss1DeathRotbone", "deathRotbone", "Nauseous"), ("GuildBoss5MiniBoss2DeathBlightbringer", "deathBlightbringer", "Corrodius")]),
    ("Ghazghkull", "Ghazghkull", [("GuildBoss4MiniBoss1OrksBigMek", "orksBigMek", "Gibbascrapz"), ("GuildBoss4MiniBoss2OrksNob", "orksNob", "Tanksmasha")]),
    ("BelisariusRW", "Belisarius Cawl", [("GuildBoss10MiniBoss1AdmecMarshall", "admecMarshall", "Tan Gi'da"), ("GuildBoss10MiniBoss2AdmecManipulus", "admecManipulus", "Actus")]),
    ("Riptide", "Riptide", [("GuildBoss11MiniBoss1TauMarksman", "tauMarksman", "Sho'syl"), ("GuildBoss11MiniBoss2TauCrisis", "tauCrisis", "Re'vas")]),
    ("ScreamerKiller", "Screamer-Killer", [("GuildBoss6MiniBoss1TyranNeurothrope", "tyranNeurothrope", "Neurothrope"), ("GuildBoss6MiniBoss2TyranWingedPrime", "tyranWingedPrime", "Winged Prime")]),
    ("AvatarOfKhaine", "Avatar de Khaine", [("GuildBoss8MiniBoss1EldarAutarch", "eldarAutarch", "Aethana"), ("GuildBoss8MiniBoss2EldarFarseer", "eldarFarseer", "Eldryon")]),
    ("RogalDorn", "Rogal Dorn", [("GuildBoss7MiniBoss1AstraPrimarisPsy", "astraPrimarisPsy", "Sibyll"), ("GuildBoss7MiniBoss2AstraOrdnance", "astraOrdnance", "Thaddeus")]),
    # the very first raid bosses (seasons before ~100): three variants of each, merged into one medal
    ("Tervigon", "Tervigon", [("TyranPrimus", "bosses:TyranPrimus", "Tyranide Primus")]),
    ("HiveTyrant", "Tyran des Ruches", []),
]

# API boss types / sub-boss units that share one medal
BOSS_ALIAS = {
    "TervigonLeviathan": "Tervigon", "TervigonKronos": "Tervigon", "TervigonGorgon": "Tervigon",
    "HiveTyrantLeviathan": "HiveTyrant", "HiveTyrantKronos": "HiveTyrant", "HiveTyrantGorgon": "HiveTyrant",
    "Belisarius": "BelisariusRW",  # the first Belisarius raid, same boss as the later one
}


def slots():
    """The medals in display order: [{key, name, art}]; key = boss type (main boss) or sub-boss unitId."""
    out = []
    for btype, name, subs in BOSSES:
        out.append({"key": btype, "name": name, "art": f"bosses/{btype}.webp"})
        for unit_id, art, sub_name in subs:
            path = f"bosses/{art.split(':', 1)[1]}.webp" if art.startswith("bosses:") else f"units/{art}.webp"
            out.append({"key": unit_id, "name": f"{sub_name} ({name})", "art": path})
    return out


MEDIAN_THRESHOLD = 1600
RELIABILITY_THRESHOLD = 0.90


def load_raid_entries():
    entries = []
    for path in sorted(glob.glob(os.path.join(RAID_DIR, "season-*.json"))):
        with open(path, encoding="utf-8") as f:
            entries.extend(json.load(f).get("entries", []))
    return entries


def _medal_key(e):
    """Main boss encounters are keyed by boss type, sub-boss encounters by the sub-boss unit."""
    if e.get("encounterType") == "Boss":
        return BOSS_ALIAS.get(e["type"], e["type"])
    if e.get("encounterType") == "SideBoss":
        unit = e.get("unitId") or ""
        return "TyranPrimus" if unit.startswith("GuildBoss1MiniBoss") else unit
    return None


def _valid(e):
    """A regular attack that counts: no bomb and no finish or one-shot (both leave the boss at 0 HP, so their damage is only what
    was left of it and understates the hit)."""
    return _medal_key(e) is not None and e.get("damageType") != "Bomb" and e.get("remainingHp", 1) > 0


def boss_relative(members=None):
    """medal key -> {uid: (mean relative damage, attacks)} over every season and every difficulty tier ("all time, all rarity"):
    each regular attack is compared with the guild's average hit on the same boss / sub-boss and tier that season (see
    raid_seasons), and a player's figure on a boss is the mean over all their attacks on it. Only the current members (`members`)
    compete, so a former member never takes a place."""
    acc = defaultdict(lambda: defaultdict(lambda: [0.0, 0]))
    for data in raid_seasons().values():
        for uid, p in data["players"].items():
            if members is not None and uid not in members:
                continue
            for key, (m, n) in p["by_key"].items():
                a = acc[key][uid]
                a[0] += m * n
                a[1] += n
    return {key: {uid: (tot / n, n) for uid, (tot, n) in d.items() if n} for key, d in acc.items()}


def compute(scores, win_rate, members=None):
    """uid -> {"bosses": {medal key: {"rank": 1-3 | None, "rel": mean relative damage, "n": attacks, "position", "of"}}, "median",
    "reliability"}; `scores` = uid -> battle scores, `win_rate` = uid -> reliability (0-1). A boss medal goes to the three members
    with the best all-time relative damage on that boss (equal figures share a rank); position / field are kept for everybody."""
    relative = boss_relative(members)
    out = {}
    uids = set(scores) | set(win_rate) | {u for f in relative.values() for u in f}
    for uid in uids:
        bosses = {}
        for slot in slots():
            key = slot["key"]
            field = relative.get(key, {})
            mine = field.get(uid)
            position = 1 + sum(1 for v in field.values() if v[0] > mine[0]) if mine else None
            bosses[key] = {"rank": position if position and position <= 3 else None, "rel": mine[0] if mine else None,
                           "n": mine[1] if mine else 0, "position": position, "of": len(field)}
        out[uid] = {
            "bosses": bosses,
            "median": statistics.median(scores[uid]) if scores.get(uid) else None,
            "reliability": win_rate.get(uid),
        }
    return out


MIN_ATTACKS = 1   # no threshold: any player with a counted attack in a season is ranked for it
MIN_SEASONS = 1   # ... and any player with a ranked season is ranked overall


def season_files():
    out = {}
    for path in sorted(glob.glob(os.path.join(RAID_DIR, "season-*.json"))):
        n = int(os.path.basename(path).split("-")[1].split(".")[0])
        with open(path, encoding="utf-8") as f:
            out[n] = json.load(f).get("entries", [])
    return out


def raid_seasons():
    """season -> {"players": {uid: {score, n, rank, by_key: {medal key: (mean relative damage, attacks)}}}, "keys": [medal keys
    played that season, in medal order], "field": players ranked}.
    Relative damage = a regular attack (no bomb, no finish, no one-shot) compared with the guild's average hit on the same boss /
    sub-boss and difficulty tier over the whole season; a player's score is the mean over their attacks. Everybody who played the
    season (former members included) is ranked on it."""
    order = [slot["key"] for slot in slots()]
    mean = lambda v: sum(v) / len(v)
    out = {}
    for season, entries in season_files().items():
        hits = [e for e in entries if _valid(e)]
        groups, coarse = defaultdict(list), defaultdict(list)
        for e in hits:
            groups[(_medal_key(e), e.get("tier"))].append(e["damageDealt"])
            coarse[_medal_key(e)].append(e["damageDealt"])
        rel_all, rel_key = defaultdict(list), defaultdict(lambda: defaultdict(list))
        for e in hits:
            g = groups[(_medal_key(e), e.get("tier"))]
            base = mean(g) if len(g) >= 5 else mean(coarse[_medal_key(e)])
            if base > 0:
                r = e["damageDealt"] / base - 1
                rel_all[e["userId"]].append(r)
                rel_key[e["userId"]][_medal_key(e)].append(r)
        scored = sorted(((mean(v), u) for u, v in rel_all.items() if len(v) >= MIN_ATTACKS), reverse=True)
        players = {
            uid: {"score": score, "n": len(rel_all[uid]), "rank": rank,
                  "by_key": {k: (mean(v), len(v)) for k, v in rel_key[uid].items()}}
            for rank, (score, uid) in enumerate(scored, 1)
        }
        keys = [k for k in order if any(k in p["by_key"] for p in players.values())]
        out[season] = {"players": players, "keys": keys, "field": len(scored)}
    return out


def raid_ranking(members):
    """uid -> {rank, of, avg_season_rank, seasons, avg_rel} for the current members: the members ordered by their average
    season rank (see raid_seasons), ties by the average relative damage. The guild average is taken over the whole season."""
    per_player = defaultdict(list)  # uid -> [(season rank, season score)]
    for season, data in raid_seasons().items():
        for uid, p in data["players"].items():
            if uid in members:
                per_player[uid].append((p["rank"], p["score"]))
    rows = [(uid, sum(r for r, _ in v) / len(v), sum(sc for _, sc in v) / len(v), len(v)) for uid, v in per_player.items() if len(v) >= MIN_SEASONS]
    rows.sort(key=lambda r: (r[1], -r[2]))
    return {uid: {"rank": i, "of": len(rows), "avg_season_rank": round(m, 1), "seasons": n, "avg_rel": round(100 * rel_, 1)}
            for i, (uid, m, rel_, n) in enumerate(rows, 1)}
