"""
"Joueurs" section: one page per guild member showing their roster, built from
the official-API payloads in data/rosters/ (see fetch_rosters.py). Returns HTML
body strings only; generate_site.py wraps them in the shared page template.

Units are laid out like the Tacticus Planner's "Who You Own" view: grouped by
faction, one card per character with its portrait (ring = rarity), stars, rank,
level, ability levels and equipment. Rarity / stars / rank are decoded from the
API's progressionIndex and rank exactly as the planner does.
"""
import glob
import json
import math
import os
from datetime import datetime
from html import escape

import medals as medals_mod

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROSTERS_DIR = os.path.join(ROOT, "data", "rosters")
UNITS_DIR = os.path.join(ROOT, "docs", "assets", "units")

RARITIES = ["Commun", "Peu commun", "Rare", "Épique", "Légendaire", "Mythique"]
RARITY_KEYS = ["common", "uncommon", "rare", "epic", "legendary", "mythic"]
# progressionIndex -> rarity: first index of each rarity (Common .. Mythic)
RARITY_START = [0, 3, 6, 9, 12, 16]
RANK_TIERS = ["Stone", "Iron", "Bronze", "Silver", "Gold", "Diamond", "Adamantine"]
ROMAN = ["I", "II", "III"]

# faction id -> (display name, alliance rank); Imperial first like the planner
ALLIANCES = ["Imperial", "Xenos", "Chaos"]
FACTIONS = {
    "AdeptusAstartes": "Adeptus Astartes", "AdeptusMechanicus": "Adeptus Mechanicus", "AstraMilitarum": "Astra Militarum",
    "BlackTemplars": "Black Templars", "BloodAngels": "Blood Angels", "Custodes": "Adeptus Custodes",
    "DarkAngels": "Dark Angels", "Sisterhood": "Adepta Sororitas", "SpaceWolves": "Space Wolves", "Ultramarines": "Ultramarines",
    "Aeldari": "Aeldari", "Genestealers": "Genestealer Cults", "LeaguesOfVotann": "Leagues of Votann", "Necrons": "Necrons",
    "Orks": "Orks", "Tau": "T'au Empire", "Tyranids": "Tyranids",
    "BlackLegion": "Black Legion", "DeathGuard": "Death Guard", "EmperorsChildren": "Emperor's Children",
    "ThousandSons": "Thousand Sons", "WorldEaters": "World Eaters", "TheLostAndTheDamned": "The Lost and the Damned",
}
MOW_KEY = "mow"
MOW_LABEL = "Machines de guerre"


def rarity_stars(progression_index):
    """(rarity 0..5, stars 0..14) like the planner: stars = index - rarity;
    1-5 gold, 6-10 red (1-5), 11-13 blue (1-3), 14 = mythic wings."""
    idx = min(max(progression_index, 0), 19)
    rarity = max(i for i, start in enumerate(RARITY_START) if idx >= start)
    return rarity, idx - rarity


def stars_html(stars, prefix="../"):
    """The game's star icons (assets/ui/star_*.png): 1-5 gold, 6-10 red (1-5), 11-13 blue winged star
    (1-3 copies), 14 = the mythic winged skull. Same icons and thresholds as tacticusdb's star slider."""
    if stars <= 0:
        return ""
    ui = f"{prefix}assets/ui/"
    if stars >= 14:
        return f'<img class="st-img st-wings" src="{ui}star_mythic.png" alt="" title="Ailes">'
    if stars <= 10:
        icon, count = ("star_gold", stars) if stars <= 5 else ("star_red", stars - 5)
        return "".join(f'<img class="st-img" src="{ui}{icon}.png" alt="">' for _ in range(count))
    return "".join(f'<img class="st-img st-blue" src="{ui}star_blue.png" alt="">' for _ in range(stars - 10))


def rank_label(rank):
    """API rank 0 = Stone I ... 20 = Adamantine III."""
    tier = min(rank // 3, len(RANK_TIERS) - 1)
    return f"{RANK_TIERS[tier]} {ROMAN[rank % 3]}"


def is_mow(u):
    return len(u.get("abilities", [])) == 3


def load_rosters():
    """Every data/rosters/*.json as {uid, name, power, updated (datetime|None), units}, strongest first."""
    out = []
    for path in glob.glob(os.path.join(ROSTERS_DIR, "*.json")):
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        p = d["player"]
        ts = (d.get("metaData") or {}).get("lastUpdatedOn")
        out.append({
            "uid": d["userId"], "name": p["details"]["name"], "power": p["details"].get("powerLevel") or 0,
            "updated": datetime.fromtimestamp(ts) if ts else None, "units": p["units"], "inventory": p.get("inventory") or {},
        })
    out.sort(key=lambda r: (-r["power"], r["name"].lower()))
    return out


def player_slug(uid):
    """Stable page name: names change, ids don't."""
    return uid.split("-")[0]


def counts(units):
    heroes = [u for u in units if not is_mow(u)]
    rar = [rarity_stars(u["progressionIndex"])[0] for u in heroes]
    return {
        "units": len(heroes), "mow": len(units) - len(heroes),
        "mythic": rar.count(5), "legendary": rar.count(4), "epic": rar.count(3),
    }


def _portrait(u, rarity, mow, stars, prefix):
    """Unit art inside the game's rarity frame (assets/ui/frame_portrait_<rarity>.png)."""
    if os.path.exists(os.path.join(UNITS_DIR, u["id"] + ".webp")):
        art = f'<img class="rc-img" src="{prefix}assets/units/{u["id"]}.webp" alt="" loading="lazy">'
    else:
        art = '<span class="rc-img rc-missing">?</span>'
    lvl = "" if mow else f'<span class="rc-lvl">{u["xpLevel"]}</span>'  # machines are always level 1
    frame = f'<img class="rc-frame" src="{prefix}assets/ui/frame_portrait_{RARITY_KEYS[rarity]}.png" alt="" loading="lazy">'
    return f'<span class="rc-portrait">{art}{frame}<span class="rc-stars">{stars_html(stars, prefix)}</span>{_badges(u, mow, prefix)}{lvl}</span>'


def _badges(u, mow, prefix):
    """Rank medal (assets/ui/rank_1..21.png = API rank 0..20, rank_mow.png for machines)."""
    medal = "rank_mow" if mow else f'rank_{min(max(u["rank"], 0), 20) + 1}'
    return f'<img class="rc-rank-badge" src="{prefix}assets/ui/{medal}.png" alt="" loading="lazy">'


def _faction_badge(u, mow, prefix):
    """Faction crest in the card's top-right corner (not for machines)."""
    if mow or not os.path.exists(os.path.join(ROOT, "docs", "assets", "ui", f'trait_faction_{u["faction"]}.png')):
        return ""
    return f'<img class="rc-faction" src="{prefix}assets/ui/trait_faction_{u["faction"]}.png" alt="" loading="lazy">'


ITEM_FRAME = {"Common": "C", "Uncommon": "U", "Rare": "R", "Epic": "E", "Legendary": "L", "Mythic": "M"}


def _item_html(it, prefix):
    """Equipment slot: the item's art (assets/items/<id>.webp) inside the game's hexagonal rarity frame, level in the corner.
    Items without art (e.g. relics) fall back to a plain rarity-coloured square with the level."""
    title = escape(f'{it["name"]} ({it["rarity"]}, niv. {it["level"]})')
    if os.path.exists(os.path.join(ROOT, "docs", "assets", "items", it["id"] + ".webp")):
        frame = ITEM_FRAME.get(it["rarity"], "C")
        return (
            f'<i class="it it-art" title="{title}"><img class="it-img" src="{prefix}assets/items/{it["id"]}.webp" alt="" loading="lazy">'
            f'<img class="it-frame" src="{prefix}assets/ui/frame_items_{frame}.png" alt="" loading="lazy"><b class="it-lvl">{it["level"]}</b></i>'
        )
    return f'<i class="it it-{it["rarity"].lower()}" title="{title}">{it["level"]}</i>'


def unit_card(u, order, prefix):
    mow = is_mow(u)
    rarity, stars = rarity_stars(u["progressionIndex"])
    abilities = "".join(
        f'<span title="Niveau de compétence">{a["level"]}</span>' for a in (u["abilities"][:2] if mow else u["abilities"])  # machines: 3rd ability not interesting
    )
    items = ""
    if not mow:
        slots = {it["slotId"]: it for it in u.get("items", [])}
        for slot in ("Slot1", "Slot2", "Slot3"):
            it = slots.get(slot)
            if it:
                items += _item_html(it, prefix)
            else:
                items += '<i class="it it-empty"></i>'
        items = f'<div class="rc-items">{items}</div>'
    title = f'{u["name"]} — {RARITIES[rarity]}' + ("" if mow else f', {rank_label(u["rank"])}') + f', niveau {u["xpLevel"]}'
    return (
        f'<div class="rc rar-{RARITY_KEYS[rarity]}" data-i="{order}" data-name="{escape(u["name"].lower())}" '
        f'data-rar="{rarity}" data-stars="{stars}" data-rank="{0 if mow else u["rank"] + 1}" data-level="{u["xpLevel"]}" '
        f'data-mow="{1 if mow else 0}" data-home="{MOW_KEY if mow else u["faction"]}" title="{escape(title)}">'
        f'{_portrait(u, rarity, mow, stars, prefix)}{_faction_badge(u, mow, prefix)}'
        f'<div class="rc-name">{escape(u["name"])}</div>'
        f'<div class="rc-abil">{abilities}</div>{items}</div>'
    )


def _sort_key(u):
    return (-u["progressionIndex"], -u["rank"], -u["xpLevel"], u["name"].lower())


def _faction_order(units):
    """Faction ids present, Imperial / Xenos / Chaos then alphabetical; machines last."""
    alliance = {}
    for u in units:
        alliance.setdefault(u["faction"], u.get("grandAlliance") or "")
    key = lambda f: (ALLIANCES.index(alliance[f]) if alliance[f] in ALLIANCES else 9, FACTIONS.get(f, f).lower())
    return sorted(alliance, key=key), alliance


def _faction_icon(faction, prefix):
    if os.path.exists(os.path.join(ROOT, "docs", "assets", "ui", f"trait_faction_{faction}.png")):
        return f'<img class="rs-icon" src="{prefix}assets/ui/trait_faction_{faction}.png" alt="">'
    return '<span class="rs-dot"></span>'


ALLIANCE_FR = {"Imperial": "impériaux", "Xenos": "xénos", "Chaos": "chaos"}


def _res_chip(icon, amount, label, prefix, glow=None):
    art = f'<img class="res-ico" src="{prefix}assets/res/{icon}.webp" alt="">'
    if glow:  # orbs: alliance coin on top of the rarity glow
        art = f'<span class="res-orb"><img class="res-glow" src="{prefix}assets/res/{glow}.webp" alt="">{art}</span>'
    return f'<span class="res" title="{escape(label)}">{art}<b>{amount:,}</b></span>'.replace(",", "\u202f")


def render_resources(inv, prefix="../"):
    """Resource strip: Legendary + Mythic orbs, one group per alliance, Legendary + Mythic XP books, requisition orders."""
    def orb_amount(alliance, rarity):
        return next((o["amount"] for o in (inv.get("orbs") or {}).get(alliance, []) if o["rarity"] == rarity), 0)

    def book_amount(rarity):
        return next((b["amount"] for b in inv.get("xpBooks") or [] if b["rarity"] == rarity), 0)

    groups = []
    for a in ALLIANCES:  # one group per alliance: its Legendary then Mythic orbs
        chips = "".join(
            _res_chip(f"orb_{a.lower()}", orb_amount(a, rarity), f"Orbes {label} {ALLIANCE_FR[a]}", prefix, glow)
            for rarity, glow, label in (("Legendary", "orb_legendary", "légendaires"), ("Mythic", "orb_mythic", "mythiques"))
        )
        groups.append((f"Orbes {ALLIANCE_FR[a]}", chips))
    groups.append(("Tomes d'XP", "".join(
        _res_chip(f"xp_{k}", book_amount(k.capitalize()), f"Tome d'XP {label}", prefix)
        for k, label in (("legendary", "légendaire"), ("mythic", "mythique"))
    )))
    req = inv.get("requisitionOrders") or {}
    groups.append(("Réquisitions", _res_chip("req_regular", req.get("regular", 0), "Ordres de réquisition", prefix)
                   + _res_chip("req_blessed", req.get("blessed", 0), "Ordres de réquisition bénis", prefix)))
    return '<div class="rres">' + "".join(
        f'<div class="rres-group"><span class="rres-title">{t}</span><div class="rres-items">{c}</div></div>' for t, c in groups
    ) + "</div>"


# Raid meta teams shown at the top of each player page. Each unit is (id, requirement):
#   hero      -> {"ab": [ability levels needed], "stars": needed star count, "rank": needed API rank}
#   machine   -> {"ab": [two abilities + the hidden third]}
#   None      -> requirement not defined yet: owning the unit counts as 100 %.
# Stars use the game's scale: 11 = 1 blue, 13 = 3 blue, 14 = orange wings. A2 = Adamantine II = API rank 19.
A2, W = 19, 14


D3 = 17  # Diamond III (level cap 50)


# Relics (equipped item "R_..."): id -> name; each requirement can ask for one at a minimum level (relic levels are per unit).
RELIC_NAMES = {
    "R_Crit_HeadwoppasKillchoppa": "Headwoppa's Killchoppa", "R_Booster_Block_NornCrown": "Norn Crown",
    "R_Booster_Crit_BookOfFate": "Book of Fate", "R_Crit_TalonOfHorus": "Talon of Horus", "R_Crit_Vitarus": "Vitarus",
    "R_Defensive_Thrydderghyre": "Thrydderghyre", "R_Booster_Crit_KardiocoreGalvanus": "Kardiocore Galvanus",
    "R_Booster_Crit_PhasalSubjugator": "Phasal Subjugator", "R_Booster_Crit_NetherRealmCasket": "Nether-Realm Casket",
    "R_Crit_Dw02AdvancedBurstCannon": "DW-02 Advanced Burst Cannon", "R_Crit_DawnBlade": "Dawn Blade",
}
KILLCHOPPA, NORN_CROWN, BOOK_OF_FATE = "R_Crit_HeadwoppasKillchoppa", "R_Booster_Block_NornCrown", "R_Booster_Crit_BookOfFate"
TALON_OF_HORUS, VITARUS, THRYDDERGHYRE = "R_Crit_TalonOfHorus", "R_Crit_Vitarus", "R_Defensive_Thrydderghyre"
KARDIOCORE, PHASAL, NETHER_CASKET = "R_Booster_Crit_KardiocoreGalvanus", "R_Booster_Crit_PhasalSubjugator", "R_Booster_Crit_NetherRealmCasket"
DW02, DAWN_BLADE = "R_Crit_Dw02AdvancedBurstCannon", "R_Crit_DawnBlade"


def _h(uid, ab, stars, rank=A2, relic=None):
    """Hero requirement; the level needed is the cap of the rank (A2 -> 60, Diamond 3 -> 50). relic = (relic id, minimum level)."""
    req = {"ab": ab, "stars": stars, "rank": rank, "level": 60 if rank >= A2 else 50}
    if relic:
        req["relic"] = relic
    return (uid, req)


# Machines of war: the mythic ability level follows the machine's stars (level 1-3 = 1-3 blue stars, level 4 = skulled).
MYTHIC_ABILITY_STARS = {1: 11, 2: 12, 3: 13, 4: 14}


def _m(uid, ab):
    """ab = [ability 1, ability 2, mythic ability level] -> abilities + the stars that mythic ability level corresponds to."""
    return (uid, {"ab": ab[:2], "stars": MYTHIC_ABILITY_STARS[ab[2]], "mow": True})


RAID_METAS = [
    ("Lavistodes", {
        "Core": [_h("emperExultant", [60, 36], W), _h("custoBladeChampion", [60, 60], W), _h("custoTrajann", [50, 60], 13),
                 _h("orksWarboss", [60, 60], 13, relic=(KILLCHOPPA, 1)), _h("custoVexilusPraetor", [60, 50], 13), _h("custoAtlacoya", [60, 36], 11)],
        "Flex": [_h("bloodDante", [36, 60], 11), _h("worldKharn", [60, 60], 13), _h("admecDominus", [50, 60], 13),
                 _h("worldExecutions", [60, 60], 13), _h("adeptCanoness", [50, 60], 11)],
        "Machines": [_m("tyranBiovore", [60, 60, 4]), _m("deathCrawler", [1, 36, 4])]}),
    ("Neuro", {
        "Core": [_h("tyranNeurothrope", [36, 60], 11, relic=(NORN_CROWN, 10)), _h("thousAhriman", [50, 60], 11), _h("thousInfernalMaster", [60, 60], 11, relic=(BOOK_OF_FATE, 10)),
                 _h("blackPossession", [60, 35], 11, relic=(BOOK_OF_FATE, 10)), _h("blackAbaddon", [60, 60], 11, relic=(TALON_OF_HORUS, 1))],
        "Flex": [_h("thousTzaangor", [35, 35], 11, relic=(THRYDDERGHYRE, 1)), _h("bloodMephiston", [36, 60], 11, relic=(VITARUS, 1))],
        "Machines": [_m("thousDaemonPrince", [60, 35, 4])]}),
    ("Battlesuit", {
        "Core": [_h("tauCrisis", [50, 60], W, relic=(DW02, 10)), _h("tauFarsight", [60, 60], 11, relic=(DAWN_BLADE, 10)), _h("eldarLhykhis", [35, 60], 12),
                 _h("admecManipulus", [50, 50], 11), _h("tauDarkstrider", [35, 60], 12)],
        "Machines": [_m("necroReanimator", [50, 60, 4]), _m("deathCrawler", [1, 36, 4])]}),
    ("Méchas", {
        "Core": [_h("admecRuststalker", [60, 60], W, relic=(KARDIOCORE, 10)), _h("admecMarshall", [50, 60], 11, relic=(KARDIOCORE, 1)), _h("necroOverlord", [60, 50], 11, relic=(PHASAL, 10)),
                 _h("votanMemnyr", [60, 60], 11), _h("admecDominus", [35, 60], 11)],
        "Flex": [_h("custoTrajann", [36, 60], 11, D3), _h("templHelbrecht", [60, 60], 11, D3), _h("tauMarksman", [50, 60], 11),
                 _h("necroSpyder", [50, 50], 11, D3, relic=(NETHER_CASKET, 1)), _h("admecManipulus", [50, 50], 11, D3)],
        "Machines": [_m("necroReanimator", [50, 60, 4]), _m("tyranBiovore", [60, 60, 4])]}),
]
ROLES = ["Core", "Flex", "Machines"]
# Unit whose portrait symbolises each meta
META_ICON = {"Lavistodes": "custoBladeChampion", "Neuro": "tyranNeurothrope", "Battlesuit": "tauCrisis", "Méchas": "admecRuststalker"}
ROLE_SHORT = {"Core": "Core", "Flex": "Flex", "Machines": "MOW"}


def _unit_names():
    try:
        with open(os.path.join(ROOT, "data", "units.json"), encoding="utf-8") as f:
            return {k: v["name"] for k, v in json.load(f).items()}
    except OSError:
        return {}


def _levels(u, n):
    lv = [a["level"] for a in (u or {}).get("abilities", [])]
    return (lv + [0] * n)[:n]


_COSTS = None


def _costs():
    """Cumulative game costs from data/progression_costs.json (see fetch_progression_costs.py)."""
    global _COSTS
    if _COSTS is None:
        with open(os.path.join(ROOT, "data", "progression_costs.json"), encoding="utf-8") as f:
            _COSTS = json.load(f)
    return _COSTS


def _frac(cum, i):
    """Share of the total cost already paid at cumulative index i (clamped)."""
    return cum[min(max(i, 0), len(cum) - 1)] / cum[-1]


def _xp_frac(level):
    return _frac(_costs()["xp_cum"][:60], level - 1)  # up to level 60


def _ability_frac(level, mow=False):
    """Heroes: half gold, half badges; machines of war: gold only."""
    c = _costs()
    if mow:
        return _frac(c["mow_ability_gold_cum"], level - 1)
    return 0.5 * _frac(c["ability_gold_cum"], level - 1) + 0.5 * _frac(c["ability_token_cum"], level - 1)


def _star_frac(idx):
    return _frac(_costs()["star_cum"], idx + 1)


def _rank_frac(unit_id, rank):
    """Share of the energy needed to farm the rank-up items, up to API rank `rank` (A2 = 19 = the current cap)."""
    table = _costs()["rank_energy_cum"]
    cum = table.get(unit_id) or next(iter(table.values()))
    return min(cum[min(max(rank, 0), 19)] / cum[19], 1.0)


def _star_index(stars):
    """Lowest progression index showing at least `stars` stars."""
    return next(i for i in range(20) if rarity_stars(i)[1] >= stars)


RELIC_WEIGHT = 0.10  # share of a unit's completion given to its relic when the requirement has one


def has_relic(u, relic_id):
    """True when the relic is equipped on this unit."""
    return any(it["id"] == relic_id for it in (u or {}).get("items", []))


def relic_level(u, relic_id):
    """Level of the relic equipped on this unit (0 when it is not equipped)."""
    return next((it["level"] for it in (u or {}).get("items", []) if it["id"] == relic_id), 0)


HERO_WEIGHTS = [1 / 3, 1 / 6, 1 / 6, 1 / 3]  # stars, XP level, rank, abilities: stars / level+rank / abilities = a third each


def _finish(u, req, mine, target):
    """Ratio of what the unit has to what the requirement needs; a required relic takes 10 % of the total (no cost data
    for relic levels: linear in its level), the rest 90 %."""
    base = min(1.0, mine / target)
    if req.get("relic"):
        rid, need_lvl = req["relic"]
        return (1 - RELIC_WEIGHT) * base + RELIC_WEIGHT * min(relic_level(u, rid) / need_lvl, 1)
    return base


def unit_completion(u, req):
    """0..1 completion of one unit against its requirement. Each criterion is measured by the real resources it costs:
    stars = shards + orbs (mythic = 5x), level = XP, rank = energy to farm the rank-up items, abilities = gold + badges
    (mythic = 5x). The player's state is capped at the requirement. Heroes: stars, level + rank (half each) and abilities
    weigh a third each; machines of war: stars (which set the mythic ability) and ability levels, half each. The weighted
    cost share is divided by the same value for the requirement itself, so meeting the requirement is exactly 100 %;
    no smoothing. A required relic takes 10 % (see _finish). Absent unit = 0; a unit with no requirement is 1 once owned."""
    if u is None:
        return 0.0
    if req is None:
        return 1.0
    need = req["ab"]
    have = _levels(u, len(need))
    ri = _star_index(req["stars"])
    stars_now, stars_req = _star_frac(min(u["progressionIndex"], ri)), _star_frac(ri)
    if req.get("mow"):  # machine of war: stars (they set the mythic ability) + ability levels, no level / rank
        mine = [stars_now, sum(_ability_frac(min(h, n), True) for h, n in zip(have, need)) / len(need)]
        target = [stars_req, sum(_ability_frac(n, True) for n in need) / len(need)]
    else:  # hero: stars, level + rank (one block: XP and rank-up energy, half each), abilities -> one third each
        mine = [stars_now, _xp_frac(min(max(u["xpLevel"], 1), req["level"])), _rank_frac(u["id"], min(u["rank"], req["rank"])),
                sum(_ability_frac(min(h, n)) for h, n in zip(have, need)) / len(need)]
        target = [stars_req, _xp_frac(req["level"]), _rank_frac(u["id"], req["rank"]), sum(_ability_frac(n) for n in need) / len(need)]
        w = HERO_WEIGHTS
        return _finish(u, req, sum(a * b for a, b in zip(w, mine)), sum(a * b for a, b in zip(w, target)))
    return _finish(u, req, sum(mine) / len(mine), sum(target) / len(target))


def stars_label(stars):
    if stars >= 14:
        return "skulled"
    if stars >= 11:
        n = stars - 10
        return f"{n} bleue{'s' if n > 1 else ''}"
    if stars >= 6:
        n = stars - 5
        return f"{n} rouge{'s' if n > 1 else ''}"
    if stars >= 1:
        return f"{stars} dorée{'s' if stars > 1 else ''}"
    return "aucune"


def _mini_relic(req, owned, prefix):
    """Under a unit of the meta table: its required relic (small icon) and player level / required level."""
    relic = req.get("relic") if req else None
    if not relic:
        return ""
    rid, need = relic
    if not has_relic(owned, rid):  # not carried by the unit: nothing shown
        return ""
    have = relic_level(owned, rid)
    return (f'<span class="mu-relic" title="{escape(RELIC_NAMES.get(rid, rid))} : niveau {have} sur {need}">{relic_icon(rid, prefix)}'
            f'<span class="mu-relic-lvl">{have}</span></span>')


def _mini_unit(uid, owned, names, prefix, req=None):
    """Small portrait for the raid-meta block: owned units show frame + stars + rank medal, missing ones are greyed out.
    When the meta requires a relic on this unit, its icon and level / required level sit under the name."""
    name = names.get(uid, uid)
    relic = _mini_relic(req, owned, prefix)
    if owned is None:
        art = (f'<span class="rc-portrait"><img class="rc-img" src="{prefix}assets/units/{uid}.webp" alt="" loading="lazy">'
               f'<img class="rc-frame" src="{prefix}assets/ui/frame_portrait_common.png" alt="" loading="lazy"></span>')
        return f'<div class="mu mu-missing" title="{escape(name)} — non possédé">{art}<span class="mu-name">{escape(name)}</span>{relic}</div>'
    mow = is_mow(owned)
    rarity, stars = rarity_stars(owned["progressionIndex"])
    title = f'{name} — {RARITIES[rarity]}' + ("" if mow else f', {rank_label(owned["rank"])}') + f', niveau {owned["xpLevel"]}'
    return (f'<div class="mu" title="{escape(title)}">{_portrait(owned, rarity, mow, stars, prefix)}'
            f'<span class="mu-name">{escape(name)}</span>{relic}</div>')


def _meta_icon(team, prefix):
    uid = META_ICON.get(team)
    if uid and os.path.exists(os.path.join(UNITS_DIR, uid + ".webp")):
        return f'<img class="meta-ico" src="{prefix}assets/units/{uid}.webp" alt="" loading="lazy">'
    return ""


def rank_badge(rank, prefix):
    """The game's rank medal (assets/ui/rank_1..21.png = API rank 0..20) with its name as tooltip."""
    return f'<img class="mm-rank" src="{prefix}assets/ui/rank_{min(max(rank, 0), 20) + 1}.png" alt="{rank_label(rank)}" title="{rank_label(rank)}">'


def stars_badge(stars, prefix):
    """The game's star icons for a star count (or "aucune")."""
    if stars <= 0:
        return '<span class="mm-none">aucune</span>'
    return f'<span class="mm-stars" title="{stars_label(stars)}">{stars_html(stars, prefix)}</span>'


def _pair(have_html, need_html, ok):
    """Player value (coloured underline: green when the requirement is met) followed by the required value, smaller."""
    return f'<span class="mm-badge {"ok" if ok else "ko"}">{have_html}</span><span class="mm-req">{need_html}</span>'


def relic_icon(rid, prefix):
    """A relic's art in the hexagonal Mythic frame (same look as the roster cards), name as tooltip."""
    name = RELIC_NAMES.get(rid, rid)
    if not os.path.exists(os.path.join(ROOT, "docs", "assets", "items", rid + ".webp")):
        return f'<span class="mm-relic mm-relic-missing" title="{escape(name)}">?</span>'
    return (f'<span class="mm-relic" title="{escape(name)}"><img class="it-img" src="{prefix}assets/items/{rid}.webp" alt="" loading="lazy">'
            f'<img class="it-frame" src="{prefix}assets/ui/frame_items_M.png" alt="" loading="lazy"></span>')


def _relic_cell(req, u, prefix):
    """Relic requirement of a unit the player owns: its icon, then their level / the required level (green when met); — when none is required."""
    relic = req.get("relic") if req else None
    if not relic:
        return "—"
    rid, need = relic
    if not has_relic(u, rid):  # not carried: just the icon, no "level / required"
        return relic_icon(rid, prefix)
    have = relic_level(u, rid)
    return f'{relic_icon(rid, prefix)}<span class="mm-have {"ok" if have >= need else "ko"}">{have}</span><small class="mm-relic-need">{need}</small>'


# Worked examples for the method block: (label, progression index, level, API rank, ability levels), judged against the maximum requirement.
METHOD_EXAMPLES = [
    ("Adamantine 2 · 60/60 · skulled", 19, 60, 19, [60, 60]),
    ("Adamantine 2 · 60/60 · 3 étoiles bleues", 18, 60, 19, [60, 60]),
    ("Adamantine 2 · 36/36 · skulled", 19, 60, 19, [36, 36]),
    ("Diamant 3 · 50/50 · 1 étoile bleue", 15, 50, 17, [50, 50]),
    ("Gold 1 · 35/35 · 3 étoiles rouges", 11, 35, 12, [35, 35]),
]


METHOD_BTN = '<button type="button" class="mm-method-btn" data-meta="method-modal">Méthodologie</button>'


def method_modal():
    """One shared dialog per page holding the method text (opened from the "Méthodologie" button of any meta dialog)."""
    return ('<dialog class="meta-modal method-modal" id="method-modal"><button type="button" class="mm-close" aria-label="Fermer">×</button>'
            f'<h3>Méthodologie</h3>{method_html()}</dialog>')


def method_html():
    """Short explanation of the completion % plus a table of worked examples (computed with unit_completion itself)."""
    full = {"ab": [60, 60], "stars": 14, "rank": A2, "level": 60}
    rows = ""
    for label, idx, lvl, rank, ab in METHOD_EXAMPLES:
        u = {"id": "custoBladeChampion", "progressionIndex": idx, "xpLevel": lvl, "rank": rank, "abilities": [{"level": a} for a in ab]}
        rows += f'<tr><td>{escape(label)}</td><td class="mm-pct">{round(100 * unit_completion(u, full))}%</td></tr>'
    return (
        '<div class="mm-method"><p><b>Chaque unité = la moyenne de 3 blocs (un tiers chacun)</b> : étoiles (fragments et orbes dépensés), '
        'niveau (XP dépensée et énergie dépensée pour farmer les objets de rang, moitié chacun) et capacités (or et jetons dépensés). '
        'Pour chacun, on regarde la part du coût total déjà payée, jusqu\'à l\'exigence de la meta ; atteindre l\'exigence = 100&nbsp;%.</p>'
        '<p>Si une relique est requise, elle compte pour <b>10&nbsp;%</b> (niveau actuel / niveau requis) et les trois blocs pour 30&nbsp;% chacun.</p>'
        '<p>Le % de Core, Flex et MOW est la moyenne de ses unités (une unité absente = 0&nbsp;%). '
        'Machines de guerre : étoiles (elles déterminent la capacité mythique) et capacités seulement.</p>'
        f'<table class="mm-ex"><thead><tr><th>Exemple (exigence Adamantine 2 · 60/60 · skulled)</th><th>%</th></tr></thead><tbody>{rows}</tbody></table></div>'
    )


def _meta_modal(idx, team, roles, owned, names, prefix, who=None, href=None):
    """Per-meta dialog for one player (`owned` = their units by id): every unit's requirement next to what they have, the
    relic, and the unit's completion; `who` (the player's name) goes next to the meta's name, with a "Voir le roster" button
    to their page (`href`) when given (players list)."""
    body = ""
    for role in ROLES:
        entries = roles.get(role)
        if not entries:
            continue
        label = ROLE_SHORT[role] if role == "Machines" else role
        body += f'<tr class="mm-role"><th>{label}</th><th></th><th></th><th></th><th></th><th></th></tr>'
        for uid, req in entries:
            name = escape(names.get(uid, uid))
            u = owned.get(uid)
            if u is None:
                cells = '<td colspan="4" class="mm-undef">Non possédé</td>'
            else:
                need = req["ab"]
                have = _levels(u, len(need))
                ab = " / ".join(f'<span class="mm-have {"ok" if h >= n else "ko"}">{h}</span><small>{n}</small>' for h, n in zip(have, need))
                st = rarity_stars(u["progressionIndex"])[1]
                stars = _pair(stars_badge(st, prefix), stars_badge(req["stars"], prefix), st >= req["stars"])
                if "rank" in req:
                    rank = _pair(rank_badge(u["rank"], prefix), rank_badge(req["rank"], prefix), u["rank"] >= req["rank"])
                else:  # machine of war: no rank, the stars show its mythic ability
                    rank = "—"
                cells = f"<td>{ab}</td><td>{rank}</td><td>{stars}</td><td>{_relic_cell(req, u, prefix)}</td>"
            pc = round(100 * unit_completion(u, req))
            body += f'<tr><td class="mm-unit">{name}</td>{cells}<td class="mm-pct">{pc}%</td></tr>'
    return (
        f'<dialog class="meta-modal" id="meta-{idx}"><button type="button" class="mm-close" aria-label="Fermer">×</button>'
        f'<h3>{_meta_icon(team, prefix)}<span class="mm-title">{escape(team)}'
        + (f'<small class="mm-who">{escape(who)}</small>' if who else "")
        + (f'<a class="mm-roster-btn" href="{href}">Voir le roster</a>' if href else "")
        + '</span></h3>'
        '<div class="mm-scroll"><table class="mm-table"><thead><tr><th>Unité</th><th>Capacités</th>'
        f'<th>Rang</th><th>Étoiles</th><th>Relique</th><th>% {METHOD_BTN}</th></tr></thead><tbody>{body}</tbody></table></div></dialog>'
    )


def meta_pcts(owned, roles):
    """[(role, completion %)] for the roles this meta has."""
    return [(role, round(100 * sum(unit_completion(owned.get(uid), req) for uid, req in roles[role]) / len(roles[role])))
            for role in ROLES if roles.get(role)]


def _pct_html(pcts):
    return "".join(f'<span class="mpct"><small>{ROLE_SHORT[r]}</small><b>{v}%</b></span>' for r, v in pcts)


def render_raid_metas(units, prefix="../"):
    """Raid metas: a table (one row per meta with its icon, columns Core / Flex / Machines, each with its completion % above
    the units this player owns; click a row = methodology dialog). On phones the table is hidden and the completion badges
    (icon + % for Core / Flex / MOW per meta) take its place."""
    owned = {u["id"]: u for u in units}
    names = _unit_names()
    badges, rows, modals = "", "", ""
    for idx, (team, roles) in enumerate(RAID_METAS):
        pcts = _pct_html(meta_pcts(owned, roles))
        badges += (f'<div class="mbadge" role="button" tabindex="0" data-meta="meta-{idx}" title="Voir la méthodologie">{_meta_icon(team, prefix)}'
                   f'<div class="mbadge-body"><span class="mbadge-name">{escape(team)}</span><div class="mpcts">{pcts}</div></div></div>')
        got = dict(meta_pcts(owned, roles))
        cells = ""
        for role in ROLES:
            inner = "".join(_mini_unit(i, owned.get(i), names, prefix, req) for i, req in roles.get(role, [])) or '<span class="mnone">—</span>'
            pct = f'<span class="mrole-pct {_pct_class(got[role])}">{got[role]}%</span>' if role in got else ""
            cells += f'<td data-label="{role}">{pct}<div class="munits">{inner}</div></td>'
        rows += (f'<tr role="button" tabindex="0" data-meta="meta-{idx}" title="Voir le détail de {escape(team)}">'
                 f'<th scope="row" class="mteam-name"><span>{escape(team)}</span></th>{cells}</tr>')
        modals += _meta_modal(idx, team, roles, owned, names, prefix)
    head = "".join(f"<th>{role}</th>" for role in ROLES)
    return (f'<div class="rmetas"><div class="mbadges">{badges}</div>'
            f'<table class="mtable"><thead><tr><th>Meta</th>{head}</tr></thead><tbody>{rows}</tbody></table>{modals}{method_modal()}</div>')


def _insignia(kind, label, info, prefix):
    """One insignia. War: `info` = {rank, of, avg, wars}; raid: {rank, of, avg_season_rank, seasons, avg_rel} (None = not ranked).
    Everybody ranked gets the game's August 2026 avatar frame (the plate says WAR or RAID) around a disc with their rank:
    orange 1st (mythic), teal 2nd (legendary), gold 3rd (epic), the Onslaught badge colours; 4th to 20th silver grey, 21st and
    below bronze."""
    if not info:
        why = "Pas encore classé"
        return (f'<div class="insignia"><span class="ins-medal tier-none">–</span>'
                f'<span class="ins-text"><b>{label}</b><small>{why}</small></span></div>')
    rank = info["rank"]
    tier = rank if rank <= 3 else "silver" if rank <= 20 else "bronze"  # 1-3 Onslaught colours, 4-20 silver grey, 21+ bronze
    medal = (f'<span class="ins-frame tier-{tier}"><span class="ins-core"><b>{rank}</b></span>'
             f'<img class="ins-frame-img" src="{prefix}assets/ui/avatar_frame_{kind}.png" alt=""></span>')
    if kind == "raid":
        plural = "s" if info["seasons"] > 1 else ""
        lines = f'<small class="ins-rank">Rang {rank} sur {info["of"]}</small><small>{info["seasons"]} saison{plural}</small>'
        tip = ("Classement de raid : dégâts par attaque relativement à la moyenne de la guilde sur la saison (sans finishs ni one shots), "
               "classés par saison puis moyennés")
    else:
        plural = "s" if info["seasons"] > 1 else ""
        lines = f'<small class="ins-rank">Rang {rank} sur {info["of"]}</small><small>{info["seasons"]} saison{plural}</small>'
        tip = "Classement général de guerre, parmi les membres actuels"
    return f'<div class="insignia" title="{tip}">{medal}<span class="ins-text"><b>{label}</b>{lines}</span></div>'


def render_insignias(war, prefix="../", raid=None, extra="", raid_known=False):
    """Insignias at the top of a player page: the player's rank in the guild's general war ranking (overall average points
    per war among the current members) and in the raid ranking (average of the per-season rankings; a placeholder X while
    there is no raid data)."""
    raid_html = (_insignia("raid", "Raid", raid, prefix) if raid_known else
                 '<div class="insignia" title="Classement de raid : bientôt"><span class="ins-medal tier-none">X</span>'
                 '<span class="ins-text"><b>Raid</b><small>À venir</small></span></div>')
    return f'<div class="insignias">{_insignia("war", "War", war, prefix)}{raid_html}{extra}</div>'


def _fmt_damage(n):
    return f"{n / 1_000_000:.2f}".replace(".", ",") + " M"


def _medal(kind, caption, sub, earned, tier, prefix, art=None, text=None, href=None):
    """One medal: Onslaught frame (mythic / legendary / epic by rank, "challenge" for the thresholds), the boss portrait or a
    text inside, greyed out when not earned. Its name and figure appear in a tooltip when the mouse rests on it; a boss medal links to that boss's page."""
    frame = "challenge" if kind == "challenge" else {1: "mythic", 2: "legendary", 3: "epic"}.get(tier, "mythic")
    art_html = f'<img class="medal-art" src="{prefix}assets/{art}" alt="" loading="lazy">' if art else ""
    text_html = f'<b class="medal-txt">{text}</b>' if text else ""
    tag, attrs = ("a", f' href="{href}"') if href else ("div", ' tabindex="0"')
    return (f'<{tag} class="medal-item {"earned" if earned else "grey"}"{attrs}>'
            f'<span class="medal medal-{kind}">{art_html}<img class="medal-frame" src="{prefix}assets/ui/onslaught_{frame}.png" alt="" loading="lazy">{text_html}</span>'
            f'<span class="medal-tip"><b>{escape(caption)}</b><small>{escape(sub)}</small></span></{tag}>')


def render_medals(m, prefix="../"):
    """Medals band to the right of the insignias, in two lines: the main raid bosses, then the primes (sub-bosses). All are
    shown; the ones the player did not earn are greyed out."""
    m = m or {}
    items, primes = [], []
    for slot in medals_mod.slots():
        b = (m.get("bosses") or {}).get(slot["key"]) or {}
        rank = b.get("rank")
        pos = b.get("position")
        if pos and b.get("rel") is not None:
            rel = f"{100 * b['rel']:+.1f} %".replace(".", ",")
            sub = f"{'1er' if pos == 1 else f'{pos}e'} sur {b['of']} · {rel} ({b['n']} attaque{'s' if b['n'] > 1 else ''})"
        else:
            sub = "pas d'attaque"
        (primes if " (" in slot["name"] else items).append(
            _medal("boss", f"{slot['name']} · relatif", sub, bool(rank), rank or 0, prefix, art=slot["art"],
                   href=f"{prefix}boss/{slot['key']}.html"))
    return ('<div class="medals"><div class="medals-row">' + "".join(items) + '</div>'
            '<div class="medals-row">' + "".join(primes) + "</div></div>")


def render_player_body(r, prefix="../", war=None, medals=None, raid=None, raid_known=False):
    units = r["units"]
    heroes = [u for u in units if not is_mow(u)]
    machines = sorted((u for u in units if is_mow(u)), key=_sort_key)
    factions, alliance = _faction_order(heroes)
    c = counts(units)
    updated = f'Données du {r["updated"]:%d/%m/%Y}' if r["updated"] else ""

    order = 0
    sections = []
    for f in factions:
        cards = ""
        for u in sorted((u for u in heroes if u["faction"] == f), key=_sort_key):
            cards += unit_card(u, order, prefix)
            order += 1
        n = sum(1 for u in heroes if u["faction"] == f)
        sections.append(
            f'<section class="rs" data-home="{f}"><h2 class="rs-title all-{alliance[f].lower()}">'
            f'{_faction_icon(f, prefix)}{escape(FACTIONS.get(f, f))}<small>{n}</small></h2>'
            f'<div class="rs-grid">{cards}</div></section>'
        )
    if machines:
        cards = ""
        for u in machines:
            cards += unit_card(u, order, prefix)
            order += 1
        sections.append(
            f'<section class="rs" data-home="{MOW_KEY}"><h2 class="rs-title"><span class="rs-dot"></span>{MOW_LABEL}'
            f'<small>{len(machines)}</small></h2><div class="rs-grid">{cards}</div></section>'
        )

    def stat(value, label):
        return f'<div class="rstat"><b>{value}</b><span>{label}</span></div>'

    summary = (
        '<div class="rsummary">'
        + stat(r["power"], "Puissance") + stat(c["units"], "Personnages") + stat(c["mythic"], "Mythiques")
        + stat(c["legendary"], "Légendaires") + stat(c["epic"], "Épiques")
        + (f'<span class="rupdated">{updated}</span>' if updated else "") + "</div>"
    )
    chips = "".join(
        f'<button type="button" class="chip{" active" if key == "all" else ""}" data-filter="{key}">{label}</button>'
        for key, label in (("all", "Tous"), ("5", "Mythiques"), ("4", "Légendaires"), ("3", "Épiques"), ("mow", "Machines"))
    )
    controls = (
        '<div class="rcontrols">'
        '<input type="search" id="roster-q" class="rq" placeholder="Filtrer par nom" autocomplete="off" aria-label="Filtrer par nom">'
        '<label class="rorder">Tri <select id="roster-order">'
        '<option value="level" selected>Niveau</option><option value="faction">Faction</option>'
        '<option value="rarity">Rareté</option><option value="name">Nom</option></select></label>'
        f'<div class="chips">{chips}</div></div>'
    )
    return (
        render_insignias(war, prefix, raid=raid, raid_known=raid_known, extra=render_medals(medals, prefix)) + render_raid_metas(units, prefix) + summary + render_resources(r["inventory"], prefix)
        + controls + '<div class="roster-zone">'
        + '<div id="roster" class="roster">' + "".join(sections)
        + '<section class="rs rs-flat" hidden><div class="rs-grid"></div></section></div>'
        + '<p id="roster-empty" class="roster-empty" hidden>Aucun personnage ne correspond.</p></div>'
    )


def _pct_class(v):
    return "v-hi" if v >= 90 else "v-mid" if v >= 70 else "v-lo"


def _pct_slots(owned, roles):
    """Three fixed Core / Flex / MOW slots (so columns line up across metas); a missing role shows a dash."""
    got = dict(meta_pcts(owned, roles))
    return "".join(
        f'<span class="pg-v {_pct_class(got[r])}" data-r="{ROLE_SHORT[r]}">{got[r]}%</span>' if r in got
        else f'<span class="pg-v v-none" data-r="{ROLE_SHORT[r]}">—</span>'
        for r in ROLES
    )


def render_players_index_body(rosters):
    """Players list as a grid (not a real table, so each name stays a primary button): one row per member, in alphabetical
    order, with the member's completion for every raid meta in columns (Core / Flex / MOW); clicking a column head sorts the players by that meta; clicking a
    meta's percentages opens that player's dialog."""
    names = _unit_names()
    labels = "".join(f'<span>{ROLE_SHORT[r]}</span>' for r in ROLES)
    metas = list(enumerate(RAID_METAS))
    head = '<div class="pg-head"><span></span>' + "".join(
        f'<div class="pg-meta-col"><div class="mbadge pg-meta" role="button" tabindex="0" data-sort="{i}" title="Trier par {escape(team)}">'
        f'{_meta_icon(team, "")}<span class="mbadge-name">{escape(team)}</span><span class="pg-arrow" aria-hidden="true">▼</span></div>'
        f'<div class="pg-sub">{labels}</div></div>'
        for i, (team, _) in metas
    ) + "</div>"
    rows, player_modals = "", ""
    for pi, r in enumerate(sorted(rosters, key=lambda r: (r["name"].casefold(), r["name"]))):
        owned = {u["id"]: u for u in r["units"]}
        cells = "".join(
            f'<div class="pg-cell" role="button" tabindex="0" data-col="{i}" data-meta="meta-{pi}-{i}" data-label="{escape(team)}" '
            f'title="Voir le détail de {escape(r["name"])} pour {escape(team)}">{_pct_slots(owned, roles)}</div>'
            for i, (team, roles) in metas
        )
        avgs = "".join(
            f' data-m{i}="{sum(v for _, v in meta_pcts(owned, roles)) / len(meta_pcts(owned, roles)):.2f}"' for i, (team, roles) in metas
        )  # sort key per meta: mean of its Core / Flex / MOW %
        rows += (f'<div class="pg-row" data-i="{pi}"{avgs}><a class="chip player-btn" href="joueurs/{player_slug(r["uid"])}.html">{escape(r["name"])}</a>'
                 f'{cells}</div>')
        # this player's own dialog for every meta (their values next to the requirements)
        player_modals += "".join(_meta_modal(f"{pi}-{i}", team, roles, owned, names, "", who=r["name"], href=f'joueurs/{player_slug(r["uid"])}.html') for i, (team, roles) in metas)
    return f'<div class="pgrid">{head}<div class="pg-rows">{rows}</div></div>{player_modals}{method_modal()}'
