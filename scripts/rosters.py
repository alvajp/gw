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
            "updated": datetime.fromtimestamp(ts) if ts else None, "units": p["units"],
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
        summary + controls
        + '<div id="roster" class="roster">' + "".join(sections)
        + '<section class="rs rs-flat" hidden><div class="rs-grid"></div></section></div>'
        + '<p id="roster-empty" class="roster-empty" hidden>Aucun personnage ne correspond.</p>'
    )


def render_players_index_body(rosters):
    """One plain button per member (highest level first), each linking to that player's roster page."""
    buttons = "".join(
        f'<a class="chip player-btn" href="joueurs/{player_slug(r["uid"])}.html">{escape(r["name"])}</a>'
        for r in sorted(rosters, key=lambda r: (-r["power"], r["name"].lower()))
    )
    return f'<div class="chips player-chips">{buttons}</div>'
