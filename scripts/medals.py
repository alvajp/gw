"""
Medals shown on the player pages (Onslaught badge art) and the raid ranking:
  * biggest single hit (one-shots count, finishing blows do not) per raid boss -> top 3 players (orange / teal / gold = Onslaught mythic / legendary / epic frames),
    from the raid history in data/raid/ (fetch_raid.py, guild key, seasons 82 to the latest), bombs excluded, current members only;
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


def boss_podiums(entries, members=None):
    """medal key -> [(uid, best single hit, rank)] for ranks 1-3. Equal hits share a rank (many sub-boss hits stop at the
    boss's remaining HP, so ties at the cap are common): everyone tied inside the top three keeps the medal.
    Main boss and sub-boss encounters only, bombs excluded, and only the current members (`members`, set of uids) compete,
    so a former member never takes a place."""
    best = _best_hits(entries, members)
    out = {}
    for key, hits in best.items():
        values = sorted(hits.values(), reverse=True)
        ranked = [(u, d, 1 + sum(1 for v in values if v > d)) for u, d in sorted(hits.items(), key=lambda kv: -kv[1])]
        out[key] = [x for x in ranked if x[2] <= 3]
    return out


def _medal_key(e):
    """Main boss encounters are keyed by boss type, sub-boss encounters by the sub-boss unit."""
    if e.get("encounterType") == "Boss":
        return BOSS_ALIAS.get(e["type"], e["type"])
    if e.get("encounterType") == "SideBoss":
        unit = e.get("unitId") or ""
        return "TyranPrimus" if unit.startswith("GuildBoss1MiniBoss") else unit
    return None


def _is_one_shot(e):
    """A kill from full HP in a single attack."""
    return e.get("remainingHp", 1) == 0 and e.get("damageDealt", 0) >= e.get("maxHp", 1 << 60)


def _valid(e, keep_one_shots=False):
    """A regular attack (no bomb) that did not end the fight. A finishing blow leaves 0 HP and its damage is only what was
    left of the boss, so it understates the hit and is left out; a one-shot (kill from full HP) is a real hit and is kept for
    the "biggest hit" medals (keep_one_shots) but left out of the raid ranking."""
    if _medal_key(e) is None or e.get("damageType") == "Bomb":
        return False
    return e.get("remainingHp", 1) > 0 or (keep_one_shots and _is_one_shot(e))


def _best_hits(entries, members=None):
    """medal key -> {uid: best single hit}; bombs and finishing blows excluded, one-shots kept."""
    best = defaultdict(dict)
    for e in entries:
        key = _medal_key(e)
        if not _valid(e, keep_one_shots=True):
            continue
        if members is not None and e["userId"] not in members:
            continue
        cur = best[key].get(e["userId"], 0)
        best[key][e["userId"]] = max(cur, e.get("damageDealt", 0))
    return best


def compute(scores, win_rate, members=None):
    """uid -> {"bosses": {medal key: {"rank": 1-3 | None, "damage": best hit | None, "position": rank among the members, "of": field}}, "median", "reliability"}; `scores` = uid ->
    battle scores, `win_rate` = uid -> reliability (0-1). Podiums only count the current members; every member's own best hit
    is kept (all uids, even outside the podium)."""
    entries = load_raid_entries()
    podiums = boss_podiums(entries, members)
    best_all = _best_hits(entries)  # everybody, to show a player's own figure
    field_hits = _best_hits(entries, members)  # the current members only: position and field size, shown even outside the podium
    out = {}
    uids = set(scores) | set(win_rate) | {u for b in best_all.values() for u in b}
    for uid in uids:
        bosses = {}
        for slot in slots():
            key = slot["key"]
            rank = next((r for u, _, r in podiums.get(key, []) if u == uid), None)
            field = field_hits.get(key, {})
            mine = field.get(uid)
            bosses[key] = {"rank": rank, "damage": best_all.get(key, {}).get(uid),
                           "position": 1 + sum(1 for v in field.values() if v > mine) if mine is not None else None, "of": len(field)}
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


def raid_ranking(members):
    """uid -> {rank, of, avg_season_rank, seasons, avg_rel} for the current members.
    Per season: every regular attack (no bomb, no finish, no one-shot) is compared with the guild's average hit on the same
    boss / sub-boss and difficulty tier that season (relative damage per token, as a % above the guild average); a player's
    season score is the mean of their attacks, and everybody who played the season (at least MIN_ATTACKS attacks, former members
    included, so the season rank is the real guild ranking of that season) is ranked on it. The overall ranking orders the members by their average season rank (needs MIN_SEASONS seasons), ties by the
    average relative damage."""
    per_player = defaultdict(list)  # uid -> [(season rank, season score)]
    for season, entries in season_files().items():
        hits = [e for e in entries if _valid(e)]
        groups, coarse = defaultdict(list), defaultdict(list)
        for e in hits:
            groups[(_medal_key(e), e.get("tier"))].append(e["damageDealt"])
            coarse[_medal_key(e)].append(e["damageDealt"])
        mean = lambda v: sum(v) / len(v)
        rel = defaultdict(list)
        for e in hits:
            g = groups[(_medal_key(e), e.get("tier"))]
            base = mean(g) if len(g) >= 5 else mean(coarse[_medal_key(e)])
            if base > 0:
                rel[e["userId"]].append(e["damageDealt"] / base - 1)
        scored = sorted(((mean(v), u) for u, v in rel.items() if len(v) >= MIN_ATTACKS), reverse=True)  # everybody who played the season
        for rank, (score, uid) in enumerate(scored, 1):
            if uid in members:
                per_player[uid].append((rank, score))
    rows = [(uid, mean_rank, avg_rel, len(v)) for uid, v in per_player.items() if len(v) >= MIN_SEASONS
            for mean_rank, avg_rel in [(sum(r for r, _ in v) / len(v), sum(s for _, s in v) / len(v))]]
    rows.sort(key=lambda r: (r[1], -r[2]))
    return {uid: {"rank": i, "of": len(rows), "avg_season_rank": round(m, 1), "seasons": n, "avg_rel": round(100 * rel_, 1)}
            for i, (uid, m, rel_, n) in enumerate(rows, 1)}
