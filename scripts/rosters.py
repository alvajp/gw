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


def _h(uid, ab, stars, rank=A2):
    """Hero requirement; the level needed is the cap of the rank (A2 -> 60, Diamond 3 -> 50)."""
    return (uid, {"ab": ab, "stars": stars, "rank": rank, "level": 60 if rank >= A2 else 50})


# Machines of war: the mythic ability level follows the machine's stars (level 1-3 = 1-3 blue stars, level 4 = skulled).
MYTHIC_ABILITY_STARS = {1: 11, 2: 12, 3: 13, 4: 14}


def _m(uid, ab):
    """ab = [ability 1, ability 2, mythic ability level] -> abilities + the stars that mythic ability level corresponds to."""
    return (uid, {"ab": ab[:2], "stars": MYTHIC_ABILITY_STARS[ab[2]], "mow": True})


RAID_METAS = [
    ("Lavistodes", {
        "Core": [_h("emperExultant", [60, 36], W), _h("custoBladeChampion", [60, 60], W), _h("custoTrajann", [50, 60], 13),
                 _h("orksWarboss", [60, 60], 13), _h("custoVexilusPraetor", [60, 50], 13), _h("custoAtlacoya", [60, 36], 11)],
        "Flex": [_h("bloodDante", [50, 60], 11), _h("worldKharn", [60, 60], 13), _h("admecDominus", [50, 60], 13),
                 _h("worldExecutions", [60, 60], 13), _h("adeptCanoness", [50, 60], 11)],
        "Machines": [_m("tyranBiovore", [60, 60, 4]), _m("deathCrawler", [1, 36, 4])]}),
    ("Neuro", {
        "Core": [_h("tyranNeurothrope", [36, 60], 11), _h("thousAhriman", [50, 60], 11), _h("thousInfernalMaster", [60, 60], 11),
                 _h("blackPossession", [50, 50], 11), _h("blackAbaddon", [60, 60], 11)],
        "Flex": [_h("thousTzaangor", [35, 35], 11), _h("bloodMephiston", [36, 60], 11)],
        "Machines": [_m("thousDaemonPrince", [60, 35, 4])]}),
    ("Battlesuit", {
        "Core": [_h("tauCrisis", [50, 60], W), _h("tauFarsight", [60, 60], 11), _h("eldarLhykhis", [35, 60], 11),
                 _h("admecManipulus", [50, 60], 11), _h("tauDarkstrider", [35, 60], 11)],
        "Machines": [_m("necroReanimator", [50, 60, 4])]}),
    ("Méchas", {
        "Core": [_h("admecRuststalker", [60, 60], W), _h("admecMarshall", [50, 60], 11), _h("necroOverlord", [60, 50], 11),
                 _h("votanMemnyr", [60, 60], 11), _h("admecDominus", [35, 60], 11)],
        "Flex": [_h("custoTrajann", [50, 60], 11, D3), _h("templHelbrecht", [60, 60], 11, D3), _h("tauMarksman", [50, 50], 11, D3),
                 _h("necroSpyder", [50, 50], 11, D3)],
        "Machines": [_m("necroReanimator", [50, 50, 4])]}),
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


def unit_completion(u, req):
    """0..1 completion of one unit against its requirement. Each criterion is measured by the real resources it costs:
    stars = shards + orbs (mythic = 5x), level = XP, rank = energy to farm the rank-up items, abilities = gold + badges
    (mythic = 5x). The player's state is capped at the requirement, the criteria's cost shares are averaged (equal
    weights), then divided by the same average for the requirement itself, so meeting the requirement is exactly 100 %.
    No smoothing: the % is the plain share of resources already spent. Machines of war: stars (which set the mythic ability) + ability levels (gold), no level or rank. Absent unit = 0;
    a unit with no requirement is 1 once owned."""
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
    else:  # hero
        mine = [stars_now, _xp_frac(min(max(u["xpLevel"], 1), req["level"])), _rank_frac(u["id"], min(u["rank"], req["rank"])),
                sum(_ability_frac(min(h, n)) for h, n in zip(have, need)) / len(need)]
        target = [stars_req, _xp_frac(req["level"]), _rank_frac(u["id"], req["rank"]), sum(_ability_frac(n) for n in need) / len(need)]
    return min(1.0, (sum(mine) / len(mine)) / (sum(target) / len(target)))


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


def _mini_unit(uid, owned, names, prefix):
    """Small portrait for the raid-meta block: owned units show frame + stars + rank medal, missing ones are greyed out."""
    name = names.get(uid, uid)
    if owned is None:
        art = (f'<span class="rc-portrait"><img class="rc-img" src="{prefix}assets/units/{uid}.webp" alt="" loading="lazy">'
               f'<img class="rc-frame" src="{prefix}assets/ui/frame_portrait_common.png" alt="" loading="lazy"></span>')
        return f'<div class="mu mu-missing" title="{escape(name)} — non possédé">{art}<span class="mu-name">{escape(name)}</span></div>'
    mow = is_mow(owned)
    rarity, stars = rarity_stars(owned["progressionIndex"])
    title = f'{name} — {RARITIES[rarity]}' + ("" if mow else f', {rank_label(owned["rank"])}') + f', niveau {owned["xpLevel"]}'
    return (f'<div class="mu" title="{escape(title)}">{_portrait(owned, rarity, mow, stars, prefix)}'
            f'<span class="mu-name">{escape(name)}</span></div>')


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


def _req_cells(req, prefix):
    """Requirement-only cells (no player data): abilities, rank, stars."""
    ab = " / ".join(f'<span class="mm-have">{n}</span>' for n in req["ab"])
    if "rank" in req:
        return ab, f'<span class="mm-badge">{rank_badge(req["rank"], prefix)}</span>', f'<span class="mm-badge">{stars_badge(req["stars"], prefix)}</span>'
    if req.get("mow"):
        return ab, "—", f'<span class="mm-badge">{stars_badge(req["stars"], prefix)}</span>'
    return ab, "—", "—"


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
        '<div class="mm-method"><p><b>Chaque unité = la moyenne de 4 critères (25 % chacun)</b> : étoiles (fragments et orbes dépensés), '
        'niveau (XP dépensée), rang (énergie dépensée pour farmer les objets de rang) et capacités (or et jetons dépensés). '
        'Pour chacun, on regarde la part du coût total déjà payée, jusqu\'à l\'exigence de la meta ; atteindre l\'exigence = 100&nbsp;%.</p>'
        '<p>Le % de Core, Flex et MOW est la moyenne de ses unités (une unité absente = 0&nbsp;%). '
        'Machines de guerre : étoiles (elles déterminent la capacité mythique) et capacités seulement.</p>'
        f'<table class="mm-ex"><thead><tr><th>Exemple (exigence Adamantine 2 · 60/60 · skulled)</th><th>%</th></tr></thead><tbody>{rows}</tbody></table></div>'
    )


def _meta_modal(idx, team, roles, owned, names, prefix, who=None):
    """Per-meta dialog. With `owned` (a player's units by id): every unit's requirement next to what this player has,
    plus its completion. With owned=None (the players list): the requirements alone."""
    generic = owned is None
    body = ""
    for role in ROLES:
        entries = roles.get(role)
        if not entries:
            continue
        label = ROLE_SHORT[role] if role == "Machines" else role
        if generic:
            body += f'<tr class="mm-role"><th>{label}</th><th></th><th></th><th></th><th></th></tr>'
        else:
            pct = round(100 * sum(unit_completion(owned.get(uid), req) for uid, req in entries) / len(entries))
            body += f'<tr class="mm-role"><th>{label}</th><th></th><th></th><th></th><th class="mm-pct">{pct}%</th></tr>'
        for uid, req in entries:
            name = escape(names.get(uid, uid))
            if generic:
                ab, rank, stars = _req_cells(req, prefix)
                body += f'<tr><td class="mm-unit">{name}</td><td>{ab}</td><td>{rank}</td><td>{stars}</td><td></td></tr>'
                continue
            u = owned.get(uid)
            if u is None:
                cells = '<td colspan="3" class="mm-undef">Non possédé</td>'
            else:
                need = req["ab"]
                have = _levels(u, len(need))
                ab = " / ".join(f'<span class="mm-have {"ok" if h >= n else "ko"}">{h}</span><small>{n}</small>' for h, n in zip(have, need))
                if "rank" in req:
                    rank = _pair(rank_badge(u["rank"], prefix), rank_badge(req["rank"], prefix), u["rank"] >= req["rank"])
                    st = rarity_stars(u["progressionIndex"])[1]
                    stars = _pair(stars_badge(st, prefix), stars_badge(req["stars"], prefix), st >= req["stars"])
                elif req.get("mow"):  # machine: no rank, the stars show its mythic ability
                    rank = "—"
                    st = rarity_stars(u["progressionIndex"])[1]
                    stars = _pair(stars_badge(st, prefix), stars_badge(req["stars"], prefix), st >= req["stars"])
                else:
                    rank = stars = "—"
                cells = f"<td>{ab}</td><td>{rank}</td><td>{stars}</td>"
            pc = round(100 * unit_completion(u, req))
            body += f'<tr><td class="mm-unit">{name}</td>{cells}<td class="mm-pct">{pc}%</td></tr>'
    return (
        f'<dialog class="meta-modal" id="meta-{idx}"><button type="button" class="mm-close" aria-label="Fermer">×</button>'
        f'<h3>{_meta_icon(team, prefix)}{escape(team)}{f" <small class=mm-who>{escape(who)}</small>" if who else ""}</h3>'
        +
        '<div class="mm-scroll"><table class="mm-table"><thead><tr><th>Unité</th><th>Capacités</th>'
        f'<th>Rang</th><th>Étoiles</th><th>{"" if generic else "% "}{METHOD_BTN}</th></tr></thead><tbody>{body}</tbody></table></div></dialog>'
    )


def meta_pcts(owned, roles):
    """[(role, completion %)] for the roles this meta has."""
    return [(role, round(100 * sum(unit_completion(owned.get(uid), req) for uid, req in roles[role]) / len(roles[role])))
            for role in ROLES if roles.get(role)]


def _pct_html(pcts):
    return "".join(f'<span class="mpct"><small>{ROLE_SHORT[r]}</small><b>{v}%</b></span>' for r, v in pcts)


def render_raid_metas(units, prefix="../"):
    """Raid metas: completion badges (icon + % for Core / Flex / MOW per meta, click = methodology dialog), then a
    table (one row per meta, columns Core / Flex / Machines) with what this player owns; on phones the CSS stacks
    each table row into a labelled card."""
    owned = {u["id"]: u for u in units}
    names = _unit_names()
    badges, rows, modals = "", "", ""
    for idx, (team, roles) in enumerate(RAID_METAS):
        pcts = _pct_html(meta_pcts(owned, roles))
        badges += (f'<div class="mbadge" role="button" tabindex="0" data-meta="meta-{idx}" title="Voir la méthodologie">{_meta_icon(team, prefix)}'
                   f'<div class="mbadge-body"><span class="mbadge-name">{escape(team)}</span><div class="mpcts">{pcts}</div></div></div>')
        cells = ""
        for role in ROLES:
            ids = [uid for uid, _ in roles.get(role, [])]
            inner = "".join(_mini_unit(i, owned.get(i), names, prefix) for i in ids) or '<span class="mnone">—</span>'
            cells += f'<td data-label="{role}"><div class="munits">{inner}</div></td>'
        rows += (f'<tr role="button" tabindex="0" data-meta="meta-{idx}" title="Voir le détail de {escape(team)}">'
                 f'<th scope="row" class="mteam-name">{escape(team)}</th>{cells}</tr>')
        modals += _meta_modal(idx, team, roles, owned, names, prefix)
    head = "".join(f"<th>{role}</th>" for role in ROLES)
    return (f'<div class="rmetas"><div class="mbadges">{badges}</div>'
            f'<table class="mtable"><thead><tr><th>Meta</th>{head}</tr></thead><tbody>{rows}</tbody></table>{modals}{method_modal()}</div>')


def render_player_body(r, prefix="../"):
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
        render_raid_metas(units, prefix) + summary + render_resources(r["inventory"], prefix) + controls
        + '<div id="roster" class="roster">' + "".join(sections)
        + '<section class="rs rs-flat" hidden><div class="rs-grid"></div></section></div>'
        + '<p id="roster-empty" class="roster-empty" hidden>Aucun personnage ne correspond.</p>'
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
    """Players list as a grid (not a real table, so each name stays a primary button): one row per member, highest level
    first, with the member's completion for every raid meta in columns (Core / Flex / MOW); clicking a column head sorts the players by that meta; clicking a
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
    for pi, r in enumerate(sorted(rosters, key=lambda r: (-r["power"], r["name"].lower()))):
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
        player_modals += "".join(_meta_modal(f"{pi}-{i}", team, roles, owned, names, "", who=r["name"]) for i, (team, roles) in metas)
    return f'<div class="pgrid">{head}{rows}</div>{player_modals}{method_modal()}'
