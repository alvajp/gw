"""
Read every war in data/wars/ (a <slug>.json + <slug>.maps.yaml pair),
compute the ranking for each, and render the static site into docs/.

Usage: python3 scripts/generate_site.py
"""
import datetime
import json
import math
import os
import re
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(__file__))
from ranking import compute_ranking
from maps_yaml import load_maps
from legacy_ranking import compute_legacy_ranking, load_legacy
import rosters as rosters_mod
import medals as medals_mod

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WARS_DIR = os.path.join(ROOT, "data", "wars")
DOCS_DIR = os.path.join(ROOT, "docs")


def _assets_version():
    """Hash of every assets/* file's contents, used as a `?v=` cache-buster on
    <link>/<script> tags so browsers don't keep serving a stale cached CSS/JS
    file after we edit it (this bit us: chart-toggle.js changes weren't
    picked up by an already-open tab until a hard refresh)."""
    import hashlib

    assets_dir = os.path.join(DOCS_DIR, "assets")
    h = hashlib.sha256()
    if os.path.isdir(assets_dir):
        for name in sorted(os.listdir(assets_dir)):
            path = os.path.join(assets_dir, name)
            if os.path.isfile(path):
                with open(path, "rb") as f:
                    h.update(f.read())
    return h.hexdigest()[:10]


ASSETS_VERSION = _assets_version()

OUR_GUILD = "Les Joyeux Psychopathes !"
# Shorter display form for the index page's header label (the in-game name
# above is the exact string used to match team data, kept separate so
# tightening it up cosmetically can't accidentally break that matching).
OUR_GUILD_LABEL = "Les Joyeux Psychos"

COLS = [
    ("pts", "Points"), ("reussites", "Tokens"), ("buffs_pts", "Buffs"), ("map_pts", "Maps"),
    ("win", "Wins"), ("fail", "Fails"), ("miss", "Miss"), ("finish", "Finishes"),
    ("MS", "MS"), ("AP", "AP"), ("AA", "AA"), ("AR", "AR"), ("FP", "FP"), ("LP", "LP"),
    ("1600", "1600"), ("1400", "1400"), ("1200_1050", "1200(1050)"), ("1100_850", "1100(850)"), ("650-", "650-"),
]

TIER_POINTS = {"1600": 10, "1400": 8, "1200_1050": 7, "1100_850": 6, "650-": 5}


def compute_pts_breakdown(ps, hard_cols, easy_cols):
    """Split a player's total "pts" into the three sources that make it up:
    Réussites (tier points from wins/finishes), Buffs (MS + other zone
    buffs), and Map (hard/easy zone-clear bonus). Recomputed from the raw
    counts already stored on ps rather than tracked separately during
    ranking, so it stays in sync with the v4 formula automatically."""
    reussites = sum(TIER_POINTS[bucket] * ps.get(bucket, 0) for bucket in TIER_POINTS)
    buffs_pts = ps.get("MS", 0) * 2 + sum(ps.get(acr, 0) for acr in ("AP", "AA", "AR", "FP", "LP")) * 0.5
    map_pts = (
        sum(ps.get(f"hard{i}", 0) for i in range(1, len(hard_cols) + 1)) * 2
        + sum(ps.get(f"easy{i}", 0) for i in range(1, len(easy_cols) + 1)) * 0.5
    )
    return reussites, buffs_pts, map_pts

def _load_maps_db():
    """data/maps.json: boardId -> English name / image / difficulty for the
    guild war boards (the "maps"). Missing file just means no map images."""
    path = os.path.join(ROOT, "data", "maps.json")
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)["maps"]


MAPS_DB = _load_maps_db()


def _load_units_db():
    """data/units.json (see sync_units.py): unitId -> real name + portrait."""
    path = os.path.join(ROOT, "data", "units.json")
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        return json.load(f)


UNITS_DB = _load_units_db()
MAP_BOARD_BY_NAME = {m["name"]: board for board, m in MAPS_DB.items()}
_HARD = ", ".join(m["name"] for m in MAPS_DB.values() if m.get("difficulty") == "hard")
_EASY = ", ".join(m["name"] for m in MAPS_DB.values() if m.get("difficulty") == "easy")
BAREME_EXPLAIN = (
    '<p class="raid-explain">Points par bataille selon son score : 1600 = 10 pts, 1400 = 8, 1200 / 1050 = 7, 1100 / 850 = 6, '
    '650 / 450 / 250 = 5, échec = 0. S\'y ajoutent, sur les victoires et finishs, +2 pts pour un buff de zone Medicae Station '
    '(+0,5 pt pour les autres buffs : AP, AA, AR, FP, LP) et un bonus de map : +2 pts pour ' + _HARD + ', +0,5 pt pour ' + _EASY + '</p>'
)


def round_pts(x):
    """Round to the nearest integer, rounding .5 up (not Python's banker's
    rounding) since points can land on a half-point from 0.5-pt buff bonuses."""
    return int(math.floor(x + 0.5))


def round_breakdown(total, parts):
    """Round a list of floats that exactly sum to `total` into integers that
    sum to exactly round_pts(total), using the largest-remainder method.
    Rounding each part independently (round_pts applied separately) can be
    off by +/-1 vs the displayed total, since round(a)+round(b) != round(a+b)
    in general -- this keeps the displayed breakdown columns (e.g. Tokens +
    Buffs + Maps) always adding up to the displayed Points column."""
    target = round_pts(total)
    floors = [math.floor(p) for p in parts]
    remainder = max(0, min(len(parts), target - sum(floors)))
    order = sorted(range(len(parts)), key=lambda i: parts[i] - floors[i], reverse=True)
    result = floors[:]
    for i in order[:remainder]:
        result[i] += 1
    return result


def value_to_bg(val, lo, hi):
    """Heat-map background for a table cell: ONE hue (the theme's --heat-rgb, the
    guild gold) whose opacity grows from `lo` to `hi` -- calm and readable in both
    themes, instead of the old blue->green->purple rainbow. Returns "" (no
    styling) when every row shares the same value, since there is nothing to
    gradient."""
    if hi <= lo:
        return ""
    t = max(0.0, min(1.0, (val - lo) / (hi - lo)))
    return f' style="background-color: rgba(var(--heat-rgb), {0.05 + 0.33 * t:.2f})"'


def slugify(name):
    s = name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-") or "guilde"


def find_team_idx(guilds, name):
    for idx, g in guilds.items():
        if g["name"] == name:
            return idx
    return None


def opponent_names(result, our_idx):
    return [g["name"] for idx, g in sorted(result["guilds"].items()) if idx != our_idx]


def discover_wars():
    wars = []
    for fname in sorted(os.listdir(WARS_DIR)):
        if not fname.endswith(".json") or fname.endswith((".legacy.json", ".extra.json")):
            continue
        slug = fname[:-len(".json")]
        json_path = os.path.join(WARS_DIR, fname)
        maps_path = os.path.join(WARS_DIR, slug + ".maps.yaml")
        maps = load_maps(maps_path) if os.path.exists(maps_path) else {"hard": {}, "easy": {}}
        extra_path = os.path.join(WARS_DIR, slug + ".extra.json")
        extra = json.load(open(extra_path, encoding="utf-8")) if os.path.exists(extra_path) else None
        wars.append((slug, json_path, maps, extra))
    return wars


def discover_legacy_wars():
    wars = []
    for fname in sorted(os.listdir(WARS_DIR)):
        if not fname.endswith(".legacy.json"):
            continue
        slug = fname[:-len(".legacy.json")]
        wars.append((slug, os.path.join(WARS_DIR, fname)))
    return wars


def html_escape(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


GRADIENT_COLS = ("pts", "reussites", "buffs_pts", "map_pts")


PLAYER_SLUGS = {}  # uid -> roster page slug of every current member (filled in main); only members have a page to open


def player_row_attrs(uid, prefix):
    """Attributes that make a table row open the player's page (row-link.js): the same whole-row click as the Joueurs list.
    Rows of players without a page (adversaries, former members) stay plain."""
    slug = PLAYER_SLUGS.get(uid)
    return f' data-href="{prefix}joueurs/{slug}.html" tabindex="0"' if slug else ""


def name_cell(uid, name, prefix):
    """The player's name in a table: the same pill as the Joueurs list (fill and rounded corners, no visible border) leading to
    their page; plain text for people without a page (adversaries, former members)."""
    slug = PLAYER_SLUGS.get(uid)
    if not slug:
        return f"<td>{html_escape(name)}</td>"
    return f'<td><a class="chip player-btn" href="{prefix}joueurs/{slug}.html">{html_escape(name)}</a></td>'


def render_table(rows, hard_cols, easy_cols):
    headers = ["Joueur"] + [label for _, label in COLS]
    headers += [name for _, name in hard_cols] + [name for _, name in easy_cols]
    thead = '<th class="rk">#</th>' + "".join(f"<th>{html_escape(h)}</th>" for h in headers)

    # First pass: compute the rounded pts/réussites/buffs/map values for every
    # row so the gradient's low/high bounds are known before rendering cells.
    computed = []
    for pname, ps, uid in rows:
        reussites, buffs_pts, map_pts = compute_pts_breakdown(ps, hard_cols, easy_cols)
        reussites_i, buffs_pts_i, map_pts_i = round_breakdown(ps["pts"], [reussites, buffs_pts, map_pts])
        breakdown = {
            "pts": round_pts(ps["pts"]),
            "reussites": reussites_i,
            "buffs_pts": buffs_pts_i,
            "map_pts": map_pts_i,
        }
        computed.append((pname, ps, breakdown, uid))

    bounds = {
        key: (min(b[key] for _, _, b, _ in computed), max(b[key] for _, _, b, _ in computed))
        for key in GRADIENT_COLS
    } if computed else {}

    body_rows = []
    for rank, (pname, ps, breakdown, uid) in enumerate(computed, 1):
        cells = [f'<td class="rk">{rank}</td>', name_cell(uid, pname, "../")]
        for key, _label in COLS:
            if key in breakdown:
                val = breakdown[key]
                lo, hi = bounds[key]
                cells.append(f"<td{value_to_bg(val, lo, hi)}>{val}</td>")
            else:
                cells.append(f"<td>{ps[key]}</td>")
        for i in range(1, len(hard_cols) + 1):
            cells.append(f"<td>{ps.get(f'hard{i}', 0)}</td>")
        for i in range(1, len(easy_cols) + 1):
            cells.append(f"<td>{ps.get(f'easy{i}', 0)}</td>")
        body_rows.append(f"<tr{player_row_attrs(uid, '../')}>" + "".join(cells) + "</tr>")

    return f"""<div class="table-scroll"><table class="sortable">
  <thead><tr>{thead}</tr></thead>
  <tbody>{''.join(body_rows)}</tbody>
</table></div>"""


def render_frise(items):
    """items: list of (label, href, outcome, above). outcome is "win"/"loss"/
    None and colors the dot green/red accordingly (None keeps the neutral
    color — used for items that aren't a single war, e.g. the per-season
    items on the homepage). above is an optional short string (e.g. the war
    number within its season) rendered above the dot; pass None to omit it.
    """
    lis = []
    for label, href, outcome, above in items:
        if outcome == "win":
            dot_class = "frise-dot frise-dot-win"
        elif outcome == "loss":
            dot_class = "frise-dot frise-dot-loss"
        else:
            dot_class = "frise-dot"
        above_html = f'<span class="frise-above">{html_escape(above)}</span>' if above else ""
        lis.append(
            f'<a class="frise-item" href="{href}">{above_html}<span class="{dot_class}"></span>'
            f'<span class="frise-label">{html_escape(label)}</span></a>'
        )
    return (
        '<div class="frise-wrap"><div class="frise-scroll"><div class="frise" id="frise">'
        + "".join(lis)
        + "</div></div></div>"
    )


def render_result_badge(outcome, date_str=None):
    if outcome not in ("win", "loss"):
        return ""
    cls = "result-badge is-win" if outcome == "win" else "result-badge is-loss"
    label = "Victoire" if outcome == "win" else "D&eacute;faite"
    date_html = f'<span class="result-badge-date">{html_escape(date_str)}</span>' if date_str else ""
    return f'<p class="{cls}">{label}{date_html}</p>'


def render_history_table(wars_subset):
    """wars_subset: list of war dicts (with 'slug' and 'result'), already in
    chronological order. Renders a Joueur x war-columns table plus a
    Moyenne column, restricted to players who were on OUR_GUILD's team in
    that war. Rows stay sorted by total points even though that column
    itself isn't shown (a fairer ranking than sorting by Moyenne alone,
    which would let a single lucky war outrank a long, consistent record)."""
    history = defaultdict(dict)  # uid -> {slug: pts}
    display_names = {}
    header_labels = {}
    for w in wars_subset:
        result = w["result"]
        our_idx = find_team_idx(result["guilds"], OUR_GUILD)
        header_labels[w["slug"]] = ", ".join(opponent_names(result, our_idx)) or w["slug"]
        for uid, ps in result["player_stats"].items():
            if ps["team"] != our_idx:
                continue
            history[uid][w["slug"]] = ps["pts"]
            display_names[uid] = result["players"].get(uid, {}).get("displayName", uid)

    thead_cells = ['<th class="rk">#</th>', "<th>Joueur</th>"]
    for w in wars_subset:
        thead_cells.append(f'<th data-href="../wars/{w["slug"]}.html">{html_escape(header_labels[w["slug"]])}</th>')  # a click in the column opens the war
    thead_cells.append("<th>Moyenne</th>")
    thead = "".join(thead_cells)

    totals = {uid: sum(per_war.values()) for uid, per_war in history.items()}
    averages = {uid: totals[uid] / len(history[uid]) for uid in history}
    rounded_avg = {uid: round_pts(v) for uid, v in averages.items()}
    avg_lo, avg_hi = (min(rounded_avg.values()), max(rounded_avg.values())) if rounded_avg else (0, 0)

    # Each war column gets its own gradient bounds, same idea as the index
    # season-average table's per-column gradient (see render_season_average_table)
    # rather than one shared scale -- a player's score in one war doesn't
    # live on the same range as another war entirely.
    war_values = {}
    war_bounds = {}
    for w in wars_subset:
        vals = {uid: round_pts(per_war[w["slug"]]) for uid, per_war in history.items() if w["slug"] in per_war}
        war_values[w["slug"]] = vals
        war_bounds[w["slug"]] = (min(vals.values()), max(vals.values())) if vals else (0, 0)

    body_rows = []
    for rank, uid in enumerate(sorted(history, key=lambda u: -totals[u]), 1):
        cells = [f'<td class="rk">{rank}</td>', name_cell(uid, display_names[uid], "../")]
        for w in wars_subset:
            val = war_values[w["slug"]].get(uid)
            if val is None:
                cells.append("<td>-</td>")
            else:
                lo, hi = war_bounds[w["slug"]]
                cells.append(f"<td{value_to_bg(val, lo, hi)}>{val}</td>")
        cells.append(f"<td{value_to_bg(rounded_avg[uid], avg_lo, avg_hi)}>{rounded_avg[uid]}</td>")
        body_rows.append(f"<tr{player_row_attrs(uid, '../')}>" + "".join(cells) + "</tr>")

    return f"""<div class="table-scroll"><table class="sortable">
  <thead><tr>{thead}</tr></thead>
  <tbody>{''.join(body_rows)}</tbody>
</table></div>"""


def compute_wars_averages(wars_subset):
    """uid -> average points across wars_subset (OUR_GUILD's team only), plus
    display names, a "win_rate" ((wins + finishes) / all 10 tokens per war,
    i.e. (win+finish) / (win+finish+fail+miss) -- a literal "chance of
    getting a positive outcome (win or finish) out of every token available",
    counting an unused token (miss) as a negative outcome just like a fail;
    see compute_season_averages for why this replaced the old fails-vs-wins
    "efficience" ratio), and the Tokens/Buffs/Maps point averages (column-wise
    sums of the same breakdown shown in the per-war tables, divided by the
    number of wars where that player's score was counted -- same denominator
    as the points average for Tokens/Buffs, but a separate denominator for
    Maps: legacy wars (see legacy_ranking.py) have no hard_cols/easy_cols at
    all -- the map bonus is unrecoverable from their hand-transcribed source,
    not legitimately zero -- so counting them here would understate the
    average instead of just excluding wars where the metric genuinely
    couldn't be scored."""
    history = defaultdict(list)
    win_fail_finish_miss = defaultdict(lambda: [0, 0, 0, 0])
    tokens, buffs, maps_ = defaultdict(float), defaultdict(float), defaultdict(float)
    maps_counts = defaultdict(int)
    display_names = {}
    for w in wars_subset:
        result = w["result"]
        our_idx = find_team_idx(result["guilds"], OUR_GUILD)
        hard_cols, easy_cols = result["hard_cols"], result["easy_cols"]
        maps_scored = bool(hard_cols or easy_cols)
        for uid, ps in result["player_stats"].items():
            if ps["team"] != our_idx:
                continue
            history[uid].append(ps["pts"])
            wffm = win_fail_finish_miss[uid]
            wffm[0] += ps["win"]
            wffm[1] += ps["fail"]
            wffm[2] += ps["finish"]
            wffm[3] += ps["miss"]
            reussites, buffs_pts, map_pts = compute_pts_breakdown(ps, hard_cols, easy_cols)
            tokens[uid] += reussites
            buffs[uid] += buffs_pts
            if maps_scored:
                maps_[uid] += map_pts
                maps_counts[uid] += 1
            display_names[uid] = result["players"].get(uid, {}).get("displayName", uid)
    averages = {uid: sum(pts) / len(pts) for uid, pts in history.items()}
    tokens = {uid: v / len(history[uid]) for uid, v in tokens.items()}
    buffs = {uid: v / len(history[uid]) for uid, v in buffs.items()}
    maps_ = {uid: v / maps_counts[uid] for uid, v in maps_.items() if maps_counts[uid]}
    win_rate = {
        uid: ((win + finish) / (win + fail + finish + miss) if (win + fail + finish + miss) > 0 else 0.0)
        for uid, (win, fail, finish, miss) in win_fail_finish_miss.items()
    }
    return display_names, averages, win_rate, tokens, buffs, maps_


PAGE_TEMPLATE = """<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%230d1014'/%3E%3Cpath d='M16 6l8 10-8 10-8-10z' fill='%23f2b134'/%3E%3C/svg%3E">
<link rel="stylesheet" href="{asset_prefix}assets/style.css?v={v}">
</head>
<body data-page="{page}" data-bg="{bg}">
{topbar}
<header><div class="breadcrumb" id="breadcrumb">{back_link}</div><div id="title-row">{title_icon}<h1 id="page-title" class="{title_class}">{title}</h1><div id="header-action">{header_action}</div></div><div id="header-extra">{header_extra}</div></header>
<main>
{body}
</main>
<script src="{asset_prefix}assets/sort-table.js?v={v}"></script>
<script src="{asset_prefix}assets/chart-toggle.js?v={v}"></script>
<script src="{asset_prefix}assets/topnav.js?v={v}"></script>
<script src="{asset_prefix}assets/timeline-filter.js?v={v}"></script>
<script src="{asset_prefix}assets/defense-filter.js?v={v}"></script>
<script src="{asset_prefix}assets/attacks-table.js?v={v}"></script>
<script src="{asset_prefix}assets/roster.js?v={v}"></script>
<script src="{asset_prefix}assets/placement.js?v={v}"></script>
<script src="{asset_prefix}assets/metas.js?v={v}"></script>
<script src="{asset_prefix}assets/opp-filter.js?v={v}"></script>
<script src="{asset_prefix}assets/chip-scroll.js?v={v}"></script>
<script src="{asset_prefix}assets/row-link.js?v={v}"></script>
</body>
</html>"""


NAV_SEASONS = {"raid": [], "war": []}  # season numbers (latest first) shown in the second menu row; filled in main()
NAV_SECTION = {"home": None, "ranking": "war", "strategy": "war", "defenses": "war", "raid": "raid", "boss": "raid", "players": "players"}


def render_topbar(prefix, active, sub=None):
    """Sticky top bar shared by every page. First row: Raid / War / Joueurs. Second row (Raid and War pages only): that section's
    own pages -- Boss resp. Stratégie, then its seasons latest first. `active` is the page kind (see NAV_SECTION), `sub` the
    season item to highlight ("raid-113", "war-28"); both rows scroll sideways when they do not fit.
    """
    section = NAV_SECTION.get(active, "war")

    def link(href, label, on):
        attr = ' class="active"' if on else ""
        return f'<a{attr} href="{prefix}{href}">{label}</a>'

    top = "".join(link(href, label, key == section) for key, href, label in
                  (("raid", "raid.html", "Raid"), ("war", "war.html", "War"), ("players", "joueurs.html", "Joueurs")))
    sub_html = ""
    if section == "raid":
        first = [("boss", "boss.html", "Boss")]
        seasons = [(f"raid-{n}", f"raid/{n}.html", f"S{n}") for n in NAV_SEASONS["raid"]]
    elif section == "war":
        first = [("strategy", "strategie.html", "Stratégie"), ("defenses", "defenses.html", "Défenses")]
        seasons = [(f"war-{n}", f"seasons/{n}.html", f"S{n}") for n in NAV_SEASONS["war"]]
    else:
        first = seasons = []
    if first:
        cur = active if active in ("boss", "strategy", "defenses") else sub
        items = "".join(link(href, label, key == cur) for key, href, label in first)
        if seasons:
            items += '<span class="topsub-sep" aria-hidden="true"></span>'
            items += "".join(link(href, label, key == cur) for key, href, label in seasons)
        sub_html = f'<div class="topsub"><div class="topsub-inner">{items}</div></div>'
    return (
        '<nav class="topbar"><div class="topbar-inner">'
        f'<a class="brand" href="{prefix}index.html"><span class="brand-mark"></span>'
        f'<span class="brand-name">{html_escape(OUR_GUILD_LABEL)}</span></a>'
        f'<div class="topnav">{top}</div>'
        f'</div>{sub_html}</nav>'
    )


def render_page(nav_active="ranking", **kw):
    """PAGE_TEMPLATE.format with the top bar (needs asset_prefix) filled in."""
    kw["topbar"] = render_topbar(kw["asset_prefix"], nav_active, kw.get("nav_sub"))
    kw["page"] = kw.pop("page_kind", nav_active)  # data-page of <body> (CSS hooks); defaults to the menu entry
    kw.setdefault("title_icon", "")  # optional icon left of the title (boss pages)
    kw.setdefault("bg", "")  # Joueurs pages: which event banner (0-3) sits behind the page, see style.css
    return PAGE_TEMPLATE.format(**kw)


ARROW_LEFT = (
    '<svg class="arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" '
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>'
)
ARROW_RIGHT = (
    '<svg class="arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" '
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>'
)


def strategy_button(href):
    """The prominent "Stratégie" button next to the H1 (see #header-action in style.css)."""
    return f'<a class="strategy-btn" href="{href}">Stratégie{ARROW_RIGHT}</a>'


def guild_crumb():
    """The guild's name above the title of the section's landing pages (War, Raid, Joueurs): same look as a breadcrumb, not a link."""
    return f'<span class="breadcrumb-label">{html_escape(OUR_GUILD_LABEL)}</span>'


def back_link_html(href, label):
    if not href:
        return ""
    return f'<a href="{href}">{ARROW_LEFT}{html_escape(label)}</a>'


def guild_rows(result, team_idx):
    players = result["players"]
    player_stats = result["player_stats"]
    rows = [
        (players.get(uid, {}).get("displayName", uid), ps, uid)
        for uid, ps in player_stats.items() if ps["team"] == team_idx
    ]
    rows.sort(key=lambda x: -x[1]["pts"])
    return rows


def compute_ms_milestones(result, our_idx):
    """Timeline markers for the war-page Chronologie chart (see
    render_timeline_svg): when OUR attacks fully removed the enemy's
    MedicaeStation healing buff for the first time ("R1:postmed" -- the
    later of the two enemy MS zones' first zoneDestroyed credited to us),
    when we finished clearing all 15 of the enemy's zones for the first
    time ("R2" -- our own `wipeout` event, the literal in-game signal that a
    full pass just completed), and the same postmed moment for the second
    pass ("R2:postmed"). Zones respawn individually (confirmed against real
    war data: a given zone's 2nd fall can land before some other zone has
    even had its 1st), so there is no single war-wide "round" timestamp in
    the raw log -- R1/R2 only make sense per-zone here, tracked via each MS
    zone's own fall order, attack-only (whose zones WE destroyed, not the
    other way around, per the user's scoping).

    Returns a list of 0-3 {"key", "label", "sublabel", "createdOn"} dicts,
    one per milestone actually reached before the war ended -- e.g. a war
    where we re-destroy only one of the two enemy MS zones a second time
    before the war ends correctly omits "R2:postmed" entirely."""
    ms_falls = defaultdict(list)
    for zd in result["zone_destroyed"]:
        if zd["team"] == our_idx and zd["zone_type"] in ("MedicaeStation1", "MedicaeStation2"):
            ms_falls[zd["zone_type"]].append(zd)
    for falls in ms_falls.values():
        falls.sort(key=lambda z: z["createdOn"])

    def postmed_milestone(key, label, fall_index):
        entries = []
        for zt in ("MedicaeStation1", "MedicaeStation2"):
            falls = ms_falls.get(zt, [])
            if len(falls) <= fall_index:
                return None
            entries.append(falls[fall_index])
        # `fails` on each zone_destroyed entry is our team's CUMULATIVE fail
        # count since war start (see ranking.py), the same running total
        # `wipeout.fails` below reads from -- so the later of the two MS
        # falls already carries the up-to-date total; no summing across the
        # two zones (that would double-count everything before the earlier
        # of the two falls).
        later = max(entries, key=lambda e: e["createdOn"])
        return {
            "key": key, "label": label, "sublabel": f"{later['fails']} fails",
            "createdOn": later["createdOn"], "fails": later["fails"],
        }

    milestones = []

    r1 = postmed_milestone("r1_postmed", "R1:postmed", 0)
    if r1:
        milestones.append(r1)

    our_wipeouts = sorted(
        (w for w in result["wipeouts"] if w["team"] == our_idx), key=lambda w: w["createdOn"]
    )
    r2 = None
    if our_wipeouts:
        w = our_wipeouts[0]
        r2 = {"key": "r2", "label": "R2", "sublabel": f"{w['fails']} fails", "createdOn": w["createdOn"], "fails": w["fails"]}
    else:
        # Fallback for a war that ends before our own `wipeout` fires: the
        # 15th zone we've destroyed ourselves (any zone type, not just MS)
        # already carries the cumulative fail count up to that exact moment,
        # same running total as above -- no summing needed here either.
        ours = sorted(
            (zd for zd in result["zone_destroyed"] if zd["team"] == our_idx), key=lambda z: z["createdOn"]
        )
        if len(ours) >= 15:
            fifteenth = ours[14]
            r2 = {
                "key": "r2", "label": "R2", "sublabel": f"{fifteenth['fails']} fails",
                "createdOn": fifteenth["createdOn"], "fails": fifteenth["fails"],
            }
    if r2:
        milestones.append(r2)

    r2_postmed = postmed_milestone("r2_postmed", "R2:postmed", 1)
    if r2_postmed:
        milestones.append(r2_postmed)

    return milestones


TIMELINE_PX_PER_HOUR = 30  # fits a typical laptop screen width without horizontal scrolling
TIMELINE_LEFT_PAD = 12
TIMELINE_CHART_H = 220
TIMELINE_MILESTONE_ZONE_H = 40  # reserved space above the curve for milestone label+time+sublabel, see render_activity_curve_svg
TIMELINE_BOTTOM_PAD = 40
MS_PER_HOUR = 3600 * 1000


def _timeline_domain(battle_events, milestones):
    """(sorted events, t_min, t_max) for the Chronologie chart -- the domain
    is just our own first-to-last battle timestamp (plus any milestone
    outside that span), NOT the full war_start/war_end log span: that
    includes the pre-battle prep phase (zone claims, target marks), which on
    a real war left a many-hour dead zone before the first plotted point."""
    events = sorted(battle_events, key=lambda e: e["createdOn"])
    t_min = events[0]["createdOn"]
    t_max = events[-1]["createdOn"]
    for m in milestones:
        t_min = min(t_min, m["createdOn"])
        t_max = max(t_max, m["createdOn"])
    if t_max <= t_min:
        t_max = t_min + 1
    return events, t_min, t_max


def _gaussian_smooth(values, sigma):
    """Simple discrete gaussian-kernel smoothing, pure Python (no numpy
    dependency in this project) -- turns a jagged per-hour attack count into
    a curve with gentle bump-shaped rises/falls instead of a staircase."""
    radius = max(1, round(sigma * 3))
    kernel = [math.exp(-0.5 * (i / sigma) ** 2) for i in range(-radius, radius + 1)]
    ksum = sum(kernel)
    kernel = [k / ksum for k in kernel]
    n = len(values)
    out = []
    for i in range(n):
        total = 0.0
        for j, k in enumerate(kernel):
            idx = i + j - radius
            if 0 <= idx < n:
                total += values[idx] * k
        out.append(total)
    return out


def aggregate_relative_battle_events(wars):
    """Merge OUR battle_events across multiple wars (see render_season_page/
    render_index) onto one shared X axis: hours since THAT war's own first
    battle, rather than real calendar time -- meaningless once wars from
    different days/seasons are combined. Only non-legacy wars contribute
    (legacy has no battle_events at all, see legacy_ranking.py). Returns
    (events, display_names); events' "createdOn" is relative ms from 0."""
    events = []
    display_names = {}
    for w in wars:
        result = w["result"]
        our_idx = find_team_idx(result["guilds"], OUR_GUILD)
        our_events = [e for e in result["battle_events"] if e["team"] == our_idx]
        if not our_events:
            continue
        t0 = min(e["createdOn"] for e in our_events)
        for e in our_events:
            events.append({"uid": e["uid"], "createdOn": e["createdOn"] - t0, "fail": bool(e.get("fail"))})
        for uid, p in result["players"].items():
            display_names.setdefault(uid, p.get("displayName", uid))
    return events, display_names


def _n_event_wars(wars):
    """How many of these wars have battles of ours (the divisor of the aggregated Chronologie curve)."""
    n = 0
    for w in wars:
        result = w["result"]
        our_idx = find_team_idx(result["guilds"], OUR_GUILD)
        if any(e["team"] == our_idx for e in result["battle_events"]):
            n += 1
    return max(1, n)


def aggregate_ms_milestones(wars):
    """Average R1:postmed/R2/R2:postmed/Fin across every war in scope
    (season or global, see render_season_page/render_index) for the
    aggregated relative-time Chronologie chart. Each war's own milestone
    (see compute_ms_milestones, and the "Fin" one built the same way
    render_war_page does from that war's own last battle_events entry) is
    converted to hours-since-that-war's-own-first-battle -- the same basis
    aggregate_relative_battle_events uses -- before averaging, so wars
    starting on different days combine correctly. Only wars that actually
    reached a given milestone contribute to its average; a milestone is
    left out entirely if no war in scope ever reached it (e.g. R2:postmed
    when nobody fully re-cleared the enemy a 2nd time before their war
    ended) -- "Fin" itself is always reached by every war with battles, so
    it's only ever missing if no war in scope has any battle_events at all."""
    by_key = defaultdict(list)  # key -> list of (relative_hours, fails)
    labels = {}
    for w in wars:
        result = w["result"]
        if not result["battle_events"]:
            continue
        our_idx = find_team_idx(result["guilds"], OUR_GUILD)
        our_events = [e for e in result["battle_events"] if e["team"] == our_idx]
        if not our_events:
            continue
        t0 = min(e["createdOn"] for e in our_events)
        for m in compute_ms_milestones(result, our_idx):
            hours = (m["createdOn"] - t0) / MS_PER_HOUR
            by_key[m["key"]].append((hours, m["fails"]))
            labels[m["key"]] = m["label"]

        last_event = max(our_events, key=lambda e: e["createdOn"])
        fin_hours = (last_event["createdOn"] - t0) / MS_PER_HOUR
        by_key["fin"].append((fin_hours, last_event["fails_so_far"]))
        labels["fin"] = "Fin"

    milestones = []
    for key in ("r1_postmed", "r2", "r2_postmed", "fin"):
        entries = by_key.get(key)
        if not entries:
            continue
        avg_hours = sum(h for h, _ in entries) / len(entries)
        avg_fails = round(sum(f for _, f in entries) / len(entries))
        milestones.append({
            "key": key, "label": labels[key], "sublabel": f"{avg_fails} fails (moy.)",
            "createdOn": avg_hours * MS_PER_HOUR,
        })
    return milestones


def render_activity_curve_svg(battle_events, milestones, relative=False, n_wars=1):
    """The "Chronologie" chart (war/season/index pages, see render_war_page/
    render_season_page/render_index): a smoothed density curve of attack
    VOLUME (how many of our battles landed in each 1h slice), gaussian-
    smoothed so the natural ebb and flow of attack activity (evening
    spikes, overnight lulls) reads as a handful of gentle bumps instead of a
    jagged staircase -- an "aperçu", not a precise per-battle count.

    Every battle also gets a thin vertical data-uid line, hidden by default
    (see .timeline-player-mark in style.css), so the player chip row above
    the chart (timeline-filter.js) can reveal exactly when one selected
    player's own tokens were played, overlaid on the aggregate curve.

    relative=False (war pages): X is real clock time; milestones (see
    compute_ms_milestones) are dashed lines labeled with the milestone name,
    its clock time, and its fail count, all drawn in a dedicated label band
    above the curve (TIMELINE_MILESTONE_ZONE_H) so the text never overlaps
    the curve/marks below it.
    relative=True (season/index, aggregating multiple wars onto one axis via
    aggregate_relative_battle_events): X is hours-since-that-war's-own-start;
    milestones are always empty here (per-war-specific, doesn't aggregate
    across wars), so the reserved label band shrinks to a small margin."""
    if not battle_events:
        return ""

    events, t_min, t_max = _timeline_domain(battle_events, milestones)
    hours_span = (t_max - t_min) / MS_PER_HOUR

    # relative (season / War pages): same frame as a war page's chart -- y axis with gridlines, one tick row of failed tokens under the plot
    left_pad = WAR_CHART_LEFT_PAD if relative else TIMELINE_LEFT_PAD
    chart_h, bottom_pad = TIMELINE_CHART_H, (62 if relative else TIMELINE_BOTTOM_PAD)
    top_pad = TIMELINE_MILESTONE_ZONE_H if milestones else 16
    chart_w = max(200.0, TIMELINE_PX_PER_HOUR * hours_span)
    plot_right = left_pad + chart_w
    # Extra blank margin past the last plotted point -- the "Fin" milestone
    # (see render_war_page) always lands exactly at t_max, and its
    # text-anchor:middle label would otherwise clip past the SVG's own
    # right edge since there's nothing beyond that last point to center on.
    width = plot_right + 50
    baseline_y = top_pad + chart_h
    height = baseline_y + bottom_pad

    def x_of(ts):
        return left_pad + (ts - t_min) / (t_max - t_min) * chart_w

    num_buckets = max(1, math.ceil(hours_span))
    counts = [0] * num_buckets
    for e in events:
        idx = min(num_buckets - 1, int((e["createdOn"] - t_min) / MS_PER_HOUR))
        counts[idx] += 1
    smoothed = _gaussian_smooth(counts, sigma=1.2)
    if relative:  # attacks per hour, per war
        smoothed = [v / max(1, n_wars) for v in smoothed]
    max_val = max(smoothed) if smoothed else 0
    y_step = _nice_step(max_val, 4) if relative and max_val > 0 else 0
    y_top = max(y_step, math.ceil(max_val / y_step) * y_step) if y_step else max_val

    def y_of(v):
        return baseline_y if y_top <= 0 else baseline_y - (v / y_top) * chart_h

    points = [
        (x_of(t_min + (i + 0.5) * MS_PER_HOUR), y_of(v))
        for i, v in enumerate(smoothed)
    ]

    axis = [
        f'<line class="timeline-axis-line" x1="{left_pad:.1f}" y1="{baseline_y:.1f}" x2="{plot_right:.1f}" y2="{baseline_y:.1f}"/>'
    ]
    if relative:
        v = 0
        while y_step and v <= y_top + 1e-9:
            gy = y_of(v)
            axis.append(f'<line class="timeline-axis-line" x1="{left_pad:.1f}" y1="{gy:.1f}" x2="{plot_right:.1f}" y2="{gy:.1f}"/>')
            axis.append(f'<text x="{left_pad - 6:.1f}" y="{gy + 3:.1f}" class="chart-axis-label">{v:g}</text>')
            v += y_step
        # No clock to align ticks to -- just every 6h from the shared t_min=0.
        tick_ms = 0
        while tick_ms <= t_max:
            tx = x_of(tick_ms)
            axis.append(
                f'<line class="timeline-axis-line" x1="{tx:.1f}" y1="{top_pad:.1f}" x2="{tx:.1f}" y2="{baseline_y:.1f}"/>'
            )
            axis.append(
                f'<text x="{tx:.1f}" y="{baseline_y + 16:.1f}" class="chart-axis-label timeline-axis-label">'
                f'+{round(tick_ms / MS_PER_HOUR)}h</text>'
            )
            tick_ms += 6 * MS_PER_HOUR
    else:
        # Aligned to round clock hours (00/06/12/18) rather than an arbitrary
        # offset from t_min, so labels read as real times ("27/09 12h").
        first_tick_dt = datetime.datetime.fromtimestamp(t_min / 1000).replace(minute=0, second=0, microsecond=0)
        while first_tick_dt.hour % 6 != 0:
            first_tick_dt += datetime.timedelta(hours=1)
        tick_dt = first_tick_dt
        while tick_dt.timestamp() * 1000 <= t_max:
            tx = x_of(tick_dt.timestamp() * 1000)
            if left_pad <= tx <= width:
                axis.append(
                    f'<line class="timeline-axis-line" x1="{tx:.1f}" y1="{top_pad:.1f}" x2="{tx:.1f}" y2="{baseline_y:.1f}"/>'
                )
                axis.append(
                    # A CSS class, not the text-anchor="middle" presentation attribute
                    # -- presentation attributes lose to any stylesheet rule (0
                    # specificity), and .chart-axis-label already sets text-anchor:end
                    # for the y-axis labels above, which would silently win over an
                    # inline attribute here too.
                    f'<text x="{tx:.1f}" y="{baseline_y + 16:.1f}" class="chart-axis-label timeline-axis-label">'
                    f'{tick_dt.strftime("%d/%m %Hh")}</text>'
                )
            tick_dt += datetime.timedelta(hours=6)

    player_marks = []
    for e in events:
        x = x_of(e["createdOn"])
        player_marks.append(
            f'<line class="timeline-player-mark" data-uid="{e["uid"]}" x1="{x:.1f}" y1="{top_pad:.1f}" '
            f'x2="{x:.1f}" y2="{baseline_y:.1f}"/>'
        )

    milestone_els = []
    for m in milestones:
        mx = x_of(m["createdOn"])
        # In relative mode createdOn is ms-since-start, not a real epoch
        # timestamp (see aggregate_ms_milestones) -- fromtimestamp() on that
        # would print a bogus 1970 date, so show "+Xh" instead, matching the
        # x-axis's own tick format in that mode.
        time_str = (
            f"+{m['createdOn'] / MS_PER_HOUR:.0f}h" if relative
            else datetime.datetime.fromtimestamp(m["createdOn"] / 1000).strftime("%Hh%M")
        )
        # Starts below the label+sublabel text (not at the very top of the
        # reserved label zone) so the dashed line never runs behind/through
        # the text itself.
        milestone_els.append(
            f'<line class="timeline-milestone-line" x1="{mx:.1f}" y1="36" x2="{mx:.1f}" y2="{baseline_y:.1f}"/>'
        )
        milestone_els.append(
            f'<text x="{mx:.1f}" y="18" class="timeline-milestone-label">'
            f'{html_escape(m["label"])} · {time_str}</text>'
        )
        milestone_els.append(
            f'<text x="{mx:.1f}" y="31" class="timeline-milestone-sublabel">{html_escape(m["sublabel"])}</text>'
        )

    line_pts = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
    area_pts = f"{left_pad:.1f},{baseline_y:.1f} {line_pts} {plot_right:.1f},{baseline_y:.1f}"

    fail_row = ""
    if relative:  # every failed token of every war, so the dense stretches read as a darker band (like a war page's "Fails" row)
        fy = baseline_y + 24
        mid = fy + 5
        fail_row = (
            f'<text x="{left_pad - 10:.1f}" y="{mid:.1f}" class="chart-axis-label timeline-axis-label" '
            f'transform="rotate(-90 {left_pad - 10:.1f} {mid:.1f})" dominant-baseline="middle">Fails</text>'
            + "".join(
                f'<line class="war-fail-tick war-us" x1="{x_of(e["createdOn"]):.1f}" y1="{fy:.1f}" x2="{x_of(e["createdOn"]):.1f}" y2="{fy + 10:.1f}" stroke-opacity="0.4"/>'
                for e in events if e.get("fail")
            )
        )
    curve = (f'<polyline class="war-line war-us" points="{line_pts}"/>' if relative else
             f'<polygon class="timeline-activity-area" points="{area_pts}"/>'
             f'<polyline class="timeline-activity-line" points="{line_pts}"/>')

    return (
        f'<svg viewBox="0 0 {width:.1f} {height:.1f}" width="{width:.1f}" height="{height:.1f}" '
        f'xmlns="http://www.w3.org/2000/svg">'
        + "".join(axis)
        + curve
        + "".join(player_marks)
        + "".join(milestone_els)
        + fail_row
        + "</svg>"
    )


def render_chronologie_section(battle_events, milestones, display_names, relative=False, n_wars=1):
    """Shared "Chronologie" section (heading + player filter chips + the
    activity curve) used by render_war_page (single war, real clock time,
    milestones) and render_season_page/render_index (aggregated across
    every war in scope, relative time, no milestones -- see
    aggregate_relative_battle_events). Always wrapped in #chronologie-wrap,
    even when there's nothing to plot (e.g. a season made entirely of
    legacy wars) and the div ends up empty -- index<->season navigate via
    page-transition.js's "rich" client-side transition (both have
    #chart-wrap), which only syncs a fixed list of known ids; without this
    wrapper present on every page a season with no Chronologie kept
    showing whichever page's section was live before the nav, not correct
    per-page content (page-transition.js was fixed to sync this id too, but
    that only works because the id is unconditionally here to find)."""
    if not battle_events:
        return '<div id="chronologie-wrap"></div>'
    activity_svg = render_activity_curve_svg(battle_events, milestones, relative=relative, n_wars=n_wars)

    # Selecting a chip reveals that player's timeline-player-mark lines (see
    # timeline-filter.js) over the aggregate curve, showing exactly when
    # their own tokens were played. Single-select (see timeline-filter.js).
    # Chip label/order: each player's own average "+Xh" (hours from the
    # chart's own start, same t_min the curve itself plots against -- so
    # "+Xh" on a chip lines up with where their marks actually fall on the
    # x-axis), sorted ascending -- players who typically attack early in
    # the war/relative-window show up first.
    _, t_min, _ = _timeline_domain(battle_events, milestones)
    hours_by_uid = defaultdict(list)
    for e in battle_events:
        hours_by_uid[e["uid"]].append((e["createdOn"] - t_min) / MS_PER_HOUR)
    avg_hours = {uid: sum(hs) / len(hs) for uid, hs in hours_by_uid.items()}

    chip_uids = sorted(avg_hours, key=lambda u: avg_hours[u])
    player_chips = "".join(
        f'<button type="button" class="chip" data-uid="{uid}">'
        f'{html_escape(display_names.get(uid, uid))}: +{avg_hours[uid]:.0f}h</button>'
        for uid in chip_uids
    )
    legend = ""
    if relative:  # same legend line as a war page (the curve is our attacks per hour, averaged over the wars in scope)
        legend = (f'<div class="war-legend"><span class="war-legend-item"><span class="war-legend-swatch war-us"></span>'
                  f'{html_escape(OUR_GUILD_LABEL)}</span></div>')
    return (
        '<div id="chronologie-wrap"><h2>Chronologie</h2>'
        f'{legend}<div class="chips timeline-player-chips">{player_chips}</div>'
        f'<div class="timeline-scroll">{activity_svg}</div></div>'
    )


WAR_CHART_LEFT_PAD = 46
WAR_CHART_RIGHT_PAD = 24
WAR_CHART_TOP_PAD = 36  # room for the wipeout labels above the plot
WAR_CHART_H = 200
WAR_CHART_PX_PER_HOUR = 30
TOKENS_PER_PLAYER = 10  # same as ranking.TOKENS_PER_WAR


def _team_classes(our_idx, team_idx):
    return "us" if team_idx == our_idx else "them"


def _nice_step(max_val, max_ticks=6):
    """Smallest 'round' tick step (1/2/5 x 10^n) keeping <= max_ticks ticks."""
    if max_val <= 0:
        return 1
    raw = max_val / max_ticks
    mag = 10 ** math.floor(math.log10(raw))
    for m in (1, 2, 5, 10):
        if raw <= m * mag:
            return m * mag
    return 10 * mag


def _fmt_hm(ms):
    total_min = int(round(ms / 60000))
    return f"+{total_min // 60}h{total_min % 60:02d}"


def render_score_timeline_svg(result, our_idx):
    """War-page "Chronologie": cumulative in-game score of each guild over
    real elapsed time (a point per battle), a dot on each curve where that
    guild destroyed a zone, a dashed vertical line where a guild wiped the
    other's whole battlefield (labelled with its elapsed time), and under
    the plot one row of ticks per guild marking every failed token. X is
    elapsed time from the first battle of either guild.

    Returns (svg, t_min) -- t_min so the player chips can label their own
    average "+Xh" against the very same origin."""
    events = sorted(result["battle_events"], key=lambda e: e["createdOn"])
    teams = sorted(result["guilds"], key=lambda t: (t != our_idx, t))
    t_min = events[0]["createdOn"]
    t_max = events[-1]["createdOn"]
    for z in result["zone_destroyed"]:
        t_max = max(t_max, z["createdOn"])
    for w in result["wipeouts"]:
        t_max = max(t_max, w["createdOn"])
    hours_span = max(1e-6, (t_max - t_min) / MS_PER_HOUR)

    left, right = WAR_CHART_LEFT_PAD, WAR_CHART_RIGHT_PAD
    top, chart_h = WAR_CHART_TOP_PAD, WAR_CHART_H
    chart_w = max(400.0, WAR_CHART_PX_PER_HOUR * hours_span)
    plot_right = left + chart_w
    width = plot_right + right
    baseline = top + chart_h
    height = baseline + 62

    def x_of(ts):
        return left + (ts - t_min) / (t_max - t_min) * chart_w

    # Per-team cumulative score series: [(t, running total)].
    series = {}
    fail_ts = {}
    for t in teams:
        total = 0
        pts = [(t_min, 0)]
        fails = []
        for e in events:
            if e["team"] != t:
                continue
            total += e.get("score", 0)
            pts.append((e["createdOn"], total))
            if e.get("fail"):
                fails.append(e["createdOn"])
        series[t] = pts
        fail_ts[t] = fails

    y_max_raw = max((pts[-1][1] for pts in series.values()), default=0)
    step = _nice_step(y_max_raw)
    y_max = max(step, math.ceil(y_max_raw / step) * step)

    def y_of(v):
        return baseline - (v / y_max) * chart_h

    def cum_at(t, ts):
        total = 0
        for pt_ts, pt_total in series[t]:
            if pt_ts > ts:
                break
            total = pt_total
        return total

    els = []
    v = 0
    while v <= y_max:
        y = y_of(v)
        els.append(f'<line class="timeline-axis-line" x1="{left:.1f}" y1="{y:.1f}" x2="{plot_right:.1f}" y2="{y:.1f}"/>')
        els.append(
            f'<text x="{left - 6:.1f}" y="{y + 3:.1f}" class="chart-axis-label">{int(v // 1000)}k</text>'
        )
        v += step
    h = 0
    while h * MS_PER_HOUR <= t_max - t_min:
        x = x_of(t_min + h * MS_PER_HOUR)
        els.append(f'<line class="timeline-axis-line" x1="{x:.1f}" y1="{top:.1f}" x2="{x:.1f}" y2="{baseline:.1f}"/>')
        els.append(
            f'<text x="{x:.1f}" y="{baseline + 16:.1f}" class="chart-axis-label timeline-axis-label">+{h}h</text>'
        )
        h += 6

    # Selecting a player chip reveals that player's own attack times (see
    # timeline-filter.js) -- ours only, same as before.
    for e in events:
        if e["team"] != our_idx:
            continue
        x = x_of(e["createdOn"])
        els.append(
            f'<line class="timeline-player-mark" data-uid="{e["uid"]}" x1="{x:.1f}" y1="{top:.1f}" '
            f'x2="{x:.1f}" y2="{baseline:.1f}"/>'
        )

    for t in teams:
        cls = _team_classes(our_idx, t)
        pts = " ".join(f"{x_of(ts):.1f},{y_of(v):.1f}" for ts, v in series[t])
        els.append(f'<polyline class="war-line war-{cls}" points="{pts}"/>')

    for z in sorted(result["zone_destroyed"], key=lambda z: z["createdOn"]):
        t = z["team"]
        if t not in series:
            continue
        cls = _team_classes(our_idx, t)
        cx, cy = x_of(z["createdOn"]), y_of(cum_at(t, z["createdOn"]))
        els.append(
            f'<circle class="war-dot war-{cls}" cx="{cx:.1f}" cy="{cy:.1f}" r="4">'
            f'<title>{html_escape(z["zone_type"])} détruite {_fmt_hm(z["createdOn"] - t_min)}</title></circle>'
        )

    for i, w in enumerate(sorted(result["wipeouts"], key=lambda w: w["createdOn"])):
        t = w["team"]
        if t not in series:
            continue
        cls = _team_classes(our_idx, t)
        x = x_of(w["createdOn"])
        label_y = 12 + 13 * (0 if t == our_idx else 1)
        els.append(f'<line class="war-wipeout war-{cls}" x1="{x:.1f}" y1="{label_y + 4:.1f}" x2="{x:.1f}" y2="{baseline:.1f}"/>')
        anchor = "end" if x - left > 170 else "start"
        dx = -5 if anchor == "end" else 5
        els.append(
            f'<text x="{x + dx:.1f}" y="{label_y:.1f}" class="war-wipeout-label war-{cls}" '
            f'text-anchor="{anchor}">R2 {_fmt_hm(w["createdOn"] - t_min)}</text>'
        )

    # One tick row per guild under the axis labels: a lost token each, with a
    # vertical "Fails" label at the far left, centered on the two rows.
    rows_mid_y = baseline + 24 + (len(teams) * 16 - 6) / 2
    els.append(
        f'<text x="{left - 10:.1f}" y="{rows_mid_y:.1f}" class="chart-axis-label timeline-axis-label" '
        f'transform="rotate(-90 {left - 10:.1f} {rows_mid_y:.1f})" dominant-baseline="middle">Fails</text>'
    )
    for row, t in enumerate(teams):
        cls = _team_classes(our_idx, t)
        y1 = baseline + 24 + row * 16
        for ts in fail_ts[t]:
            x = x_of(ts)
            els.append(f'<line class="war-fail-tick war-{cls}" x1="{x:.1f}" y1="{y1:.1f}" x2="{x:.1f}" y2="{y1 + 10:.1f}"/>')

    svg = (
        f'<svg viewBox="0 0 {width:.1f} {height:.1f}" width="{width:.1f}" height="{height:.1f}" '
        f'xmlns="http://www.w3.org/2000/svg">' + "".join(els) + "</svg>"
    )
    return svg, t_min


def render_tokens_chart_svg(result, our_idx):
    """"Jetons théoriquement réussis": for each guild, x = tokens used so far
    (in battle order), y = share of the guild's starting token pool
    (TOKENS_PER_PLAYER x its players) that could still have been a success --
    100% at the start, each failed token takes 1/pool off, and tokens never
    spent don't count against it."""
    events = sorted(result["battle_events"], key=lambda e: e["createdOn"])
    teams = sorted(result["guilds"], key=lambda t: (t != our_idx, t))
    pools = {
        t: TOKENS_PER_PLAYER * sum(1 for ps in result["player_stats"].values() if ps["team"] == t)
        for t in teams
    }
    curves = {}
    for t in teams:
        pool = pools[t]
        if not pool:
            continue
        fails = 0
        pts = [(0, 1.0)]
        n = 0
        for e in events:
            if e["team"] != t:
                continue
            n += 1
            if e.get("fail"):
                fails += 1
            pts.append((n, 1 - fails / pool))
        curves[t] = pts
    if not curves:
        return "", pools

    w, h = 900, 290
    left, right, top, bottom = 46, 20, 14, 30
    plot_w, plot_h = w - left - right, h - top - bottom
    x_max = max(pts[-1][0] for pts in curves.values())
    x_step = _nice_step(x_max, 6)
    x_axis_max = max(x_step, math.ceil(x_max / x_step) * x_step)
    y_min_raw = min(pt[1] for pts in curves.values() for pt in pts)
    y_min = max(0.0, math.floor(y_min_raw * 20) / 20 - 0.05)  # 5% steps, with some headroom

    def x_of(n):
        return left + n / x_axis_max * plot_w

    def y_of(v):
        return top + (1 - v) / (1 - y_min) * plot_h

    els = []
    pct = 1.0
    while pct >= y_min - 1e-9:
        y = y_of(pct)
        els.append(f'<line class="timeline-axis-line" x1="{left}" y1="{y:.1f}" x2="{left + plot_w}" y2="{y:.1f}"/>')
        els.append(f'<text x="{left - 6}" y="{y + 3:.1f}" class="chart-axis-label">{round(pct * 100)}%</text>')
        pct -= 0.05 if (1 - y_min) <= 0.35 else 0.1
    n = 0
    while n <= x_axis_max:
        x = x_of(n)
        els.append(f'<line class="timeline-axis-line" x1="{x:.1f}" y1="{top}" x2="{x:.1f}" y2="{top + plot_h}"/>')
        els.append(f'<text x="{x:.1f}" y="{top + plot_h + 16}" class="chart-axis-label timeline-axis-label">{int(n)}</text>')
        n += x_step
    for t in teams:
        if t not in curves:
            continue
        cls = _team_classes(our_idx, t)
        pts = " ".join(f"{x_of(nn):.1f},{y_of(v):.1f}" for nn, v in curves[t])
        els.append(f'<polyline class="war-line war-{cls}" points="{pts}"/>')
    return (
        f'<svg viewBox="0 0 {w} {h}" xmlns="http://www.w3.org/2000/svg" class="war-tokens-svg">'
        + "".join(els) + "</svg>"
    ), pools


def render_war_chronologie_section(result, our_idx, display_names):
    """"Chronologie" + "Jetons théoriquement réussis" for a war page (see
    render_score_timeline_svg / render_tokens_chart_svg). Wrapped in
    #chronologie-wrap like render_chronologie_section, which the season/index
    pages still use for their aggregate curve."""
    if not any(e["team"] == our_idx for e in result["battle_events"]):
        return '<div id="chronologie-wrap"></div>'
    svg, t_min = render_score_timeline_svg(result, our_idx)

    hours_by_uid = defaultdict(list)
    for e in result["battle_events"]:
        if e["team"] == our_idx:
            hours_by_uid[e["uid"]].append((e["createdOn"] - t_min) / MS_PER_HOUR)
    avg_hours = {uid: sum(hs) / len(hs) for uid, hs in hours_by_uid.items()}
    player_chips = "".join(
        f'<button type="button" class="chip" data-uid="{uid}">'
        f'{html_escape(display_names.get(uid, uid))}: +{avg_hours[uid]:.0f}h</button>'
        for uid in sorted(avg_hours, key=lambda u: avg_hours[u])
    )
    teams = sorted(result["guilds"], key=lambda t: (t != our_idx, t))
    legend = "".join(
        f'<span class="war-legend-item"><span class="war-legend-swatch war-{_team_classes(our_idx, t)}"></span>'
        f'{html_escape(OUR_GUILD_LABEL if t == our_idx else result["guilds"][t]["name"])}</span>'
        for t in teams
    )
    tokens_svg, _ = render_tokens_chart_svg(result, our_idx)
    html = (
        '<div id="chronologie-wrap"><h2>Chronologie</h2>'
        f'<div class="war-legend">{legend}</div>'
        f'<div class="chips timeline-player-chips">{player_chips}</div>'
        f'<div class="timeline-scroll">{svg}</div>'
    )
    if tokens_svg:
        html += (
            '<h2>Jetons réussis</h2>'
            f'<div class="war-legend">{legend}</div>'
            f'<div class="war-tokens-wrap">{tokens_svg}</div>'
        )
    return html + "</div>"


ZONE_LABELS = {
    "MedicaeStation1": "MS1", "MedicaeStation2": "MS2", "HQ": "HQ", "SupplyDepot": "SD", "Armoury": "AR",
    "AntiAirBattery": "AA", "ArtilleryPosition1": "AP1", "ArtilleryPosition2": "AP2",
    "LandingPad1": "LP1", "LandingPad2": "LP2", "Bunker1": "FP1", "Bunker2": "FP2",
    "Trenches1": "FL gauche", "Trenches2": "FL milieu", "Trenches3": "FL droite",
}


def war_boards(maps):
    """zone type -> boardId for a war: the full table when its maps.yaml has a
    boards: block (see read_maps.py), otherwise just the 6 tracked zones,
    recovered from their map names."""
    boards = dict(maps.get("boards") or {})
    for group in ("hard", "easy"):
        for zone, name in (maps.get(group) or {}).items():
            if zone not in boards and name in MAP_BOARD_BY_NAME:
                boards[zone] = MAP_BOARD_BY_NAME[name]
    return boards


def war_layouts(maps):
    """{'ours': [zone x15], 'theirs': [zone x15]} in row-major order (3 per row),
    from the maps.yaml layout_ours / layout_theirs blocks (see read_maps.py);
    a side without a valid 15-distinct-zone layout is left out (callers fall back to
    BATTLEFIELD_ORDER)."""
    out = {}
    for key in ("ours", "theirs"):
        block = maps.get(f"layout_{key}") or {}
        rows = [block[k].split(",") for k in sorted(block, key=lambda k: int(k[1:]))]
        flat = [z.strip() for row in rows for z in row]
        if len(flat) == 15 and len(set(flat)) == 15:
            out[key] = flat
    return out


DEFENSE_VISIBLE_ROWS = 5  # rows shown per guild before the "Afficher" expand


def compute_defense_teams(result, our_idx):
    """One entry per defensive team (a player's 5 characters + machine of war,
    one of the 5 lineups each defender fields): attacks it suffered, mean score
    conceded (zone-clear bonus excluded, `adj`), share of attacks that failed,
    and the mean number of each zone buff on it per attack. Keyed per guild so
    both sides can be listed."""
    acc = {}
    for e in result["battle_events"]:
        if not e.get("defender"):
            continue
        def_team = next(t for t in result["guilds"] if t != e["team"])
        key = (def_team, e["defender"], tuple(e["units"]), e["mow"])
        a = acc.setdefault(key, {"n": 0, "score": 0, "fail": 0, "buffs": defaultdict(int), "zones": defaultdict(int), "attacks": []})
        a["attacks"].append(e)
        a["n"] += 1
        a["score"] += e["adj"]
        a["fail"] += 1 if e["fail"] else 0
        for acr, c in e.get("buffs", {}).items():
            a["buffs"][acr] += c
        a["zones"][e["zone"]] += 1
    rows = []
    for (team, uid, units, mow), a in acc.items():
        rows.append({
            "team": team, "uid": uid, "units": units, "mow": mow, "n": a["n"], "fails": a["fail"],
            "avg": a["score"] / a["n"], "fail_rate": a["fail"] / a["n"],
            "buffs": {acr: c / a["n"] for acr, c in a["buffs"].items()},
            "zone": max(a["zones"], key=a["zones"].get),
            "attacks": sorted(a["attacks"], key=lambda e: e["createdOn"]),
        })
    return rows


def _unit_img(uid, prefix, mow=False):
    u = UNITS_DB.get(uid)
    cls = "unit mow" if mow else "unit"
    if not u:
        return f'<span class="{cls} unit-missing" title="{html_escape(uid)}">?</span>'
    return f'<img class="{cls}" src="{prefix}{u["image"]}" alt="{html_escape(u["name"])}" title="{html_escape(u["name"])}" loading="lazy">'


TIER_CODE = {"win": "w", "finish": "f", "fail": "x"}


def _attacks_attr(events):
    """data-attacks value for a clickable defense row: every attack thrown at
    that defense, as [attacker uid, outcome code, score, lineup, MoW] (read by
    defense-filter.js)."""
    raw = json.dumps(
        [[e["uid"], TIER_CODE.get(e["tier"], "u"), round(e["adj"]), e["att_units"], e["att_mow"]] for e in events],
        separators=(",", ":"), ensure_ascii=False,
    )
    return html_escape(raw).replace(chr(34), "&quot;")


def _defense_modal_html(rows_events, players, prefix):
    """The shared <script id=defense-data> (names + portraits the modal needs,
    once per page) and the empty <dialog> the clicked rows fill in."""
    used_units, used_players = set(), set()
    for events in rows_events:
        for e in events:
            used_units.update(e["att_units"])
            used_units.update(e.get("units") or [])
            used_units.update(u for u in (e["att_mow"], e.get("mow")) if u)
            used_players.add(e["uid"])
            if e.get("defender"):
                used_players.add(e["defender"])
    data = {
        "units": {u: [UNITS_DB[u]["name"], prefix + UNITS_DB[u]["image"]] for u in sorted(used_units) if u in UNITS_DB},
        "players": {uid: players.get(uid, {}).get("displayName", uid) for uid in sorted(used_players)},
    }
    return (
        '<script type="application/json" id="defense-data">'
        + json.dumps(data, separators=(",", ":"), ensure_ascii=False).replace("</", "<\\/")
        + "</script>"
        '<dialog id="defense-modal" class="defense-modal"><div class="dm-head"><div class="dm-title"></div>'
        '<button type="button" class="dm-close" aria-label="Fermer">×</button></div><div class="dm-body"></div></dialog>'
    )


def render_defense_table(rows, players, boards, prefix, top=None):
    """top keeps only the first `top` rows (no expand button)."""
    if not rows:
        return ""
    avgs = [r["avg"] for r in rows]
    lo, hi = min(avgs), max(avgs)
    body = []
    if top:
        rows = sorted(rows, key=lambda r: (-r["n"], r["avg"]))[:top]
    # Most tokens spent against it first (the hardest nut to crack), then the
    # lower mean score.
    for i, r in enumerate(sorted(rows, key=lambda r: (-r["n"], r["avg"]))):
        board = boards.get(r["zone"])
        m = MAPS_DB.get(board) if board else None
        zlabel = ZONE_LABELS.get(r["zone"], r["zone"])
        if m:
            zone_html = (
                f'<img class="map-thumb" src="{prefix}{m["image"]}" alt="{html_escape(m["name"])}" loading="lazy">'
                f'<span class="zone-text"><b>{zlabel}</b><small>{html_escape(m["name"])}</small></span>'
            )
        else:
            zone_html = f'<span class="zone-text"><b>{zlabel}</b></span>'
        comp = "".join(_unit_img(u, prefix) for u in r["units"])
        if r["mow"]:
            comp += _unit_img(r["mow"], prefix, mow=True)
        bg = value_to_bg(hi - (r["avg"] - lo), lo, hi)  # low conceded score = good = green
        hidden = "" if i < DEFENSE_VISIBLE_ROWS else " hidden"
        body.append(
            f'<tr{hidden} tabindex="0" data-attacks="{_attacks_attr(r["attacks"])}">'
            f'<td>{html_escape(players.get(r["uid"], {}).get("displayName", r["uid"]))}</td>'
            f'<td class="zone">{zone_html}</td><td class="comp">{comp}</td>'
            f'<td>{r["n"]}</td><td{bg}>{r["avg"]:.0f}</td>'
            f'<td>{r["fail_rate"] * 100:.0f}&nbsp;%</td><td class="buffs">{_buff_list(r["buffs"])}</td></tr>'
        )
    head = (
        '<tr><th>Joueur</th><th class="zone">Zone</th><th class="comp">Composition</th>'
        '<th>Tokens</th><th>Score moy.</th><th>Échec</th><th class="buffs">Buffs</th></tr>'
    )
    table = f'<div class="table-scroll"><table class="sortable defense-table"><thead>{head}</thead><tbody>{"".join(body)}</tbody></table></div>'
    extra = len(rows) - DEFENSE_VISIBLE_ROWS
    if extra > 0:
        table += (
            f'<button type="button" class="defense-more" aria-expanded="false" aria-label="Afficher les {extra} autres" '
            f'data-extra="{extra}"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">'
            '<polyline points="6 9 12 15 18 9" fill="none" stroke="currentColor" stroke-width="2" '
            'stroke-linecap="round" stroke-linejoin="round"/></svg></button>'
        )
    return table


def render_defense_section(result, our_idx, boards, prefix="../", ours=True):
    """War-page "Meilleures défenses": the DEFENSE_VISIBLE_ROWS defensive teams of one guild that held best -- the attacker
    failed at least once against them -- most tokens spent against it first, with its map image, portraits (real names on
    hover) and how it held (see compute_defense_teams). ours=True: our guild's table under its own heading; ours=False: the
    opponents' tables, no heading (they sit in the "Voir l'adversaire" expand)."""
    rows = [r for r in compute_defense_teams(result, our_idx) if r["fails"] >= 1]
    parts = []
    for team in sorted(result["guilds"], key=lambda t: (t != our_idx, t)):
        if (team == our_idx) != ours:
            continue
        table = render_defense_table([r for r in rows if r["team"] == team], result["players"], boards, prefix, top=DEFENSE_VISIBLE_ROWS)
        if table:
            parts.append(f'<div class="defense-block">{table}</div>')
    if not parts:
        return ""
    return '<div id="defense-wrap"><h2>Meilleures défenses</h2>' + "".join(parts) + "</div>" if ours else "".join(parts)


BUFF_ORDER = ["MS", "AP", "AA", "AR", "FP", "LP"]
BEST_PER_MAP = 5
BEST_MIN_ATTACKS = 3


def compute_defense_by_map(all_wars):
    """boardId -> list of defensive teams (across every captured war whose
    zone->board mapping is known), each with attacks suffered, mean score
    conceded (zone-clear bonus excluded), fail rate and the mean number of
    each zone buff that was on it per attack. A "team" is one defender's
    lineup on one zone in one war."""
    by_board = defaultdict(list)
    for w in all_wars:
        result = w["result"]
        boards = result.get("boards") or {}
        if not result["battle_events"] or not boards:
            continue
        our_idx = find_team_idx(result["guilds"], OUR_GUILD)
        acc = {}
        for e in result["battle_events"]:
            board = boards.get(e.get("zone"))
            if not e.get("defender") or not board:
                continue
            def_team = next(t for t in result["guilds"] if t != e["team"])
            key = (board, def_team, e["defender"], tuple(e["units"]), e["mow"], e["zone"])
            a = acc.setdefault(key, {"n": 0, "score": 0, "fail": 0, "buffs": defaultdict(int), "attacks": []})
            a["attacks"].append(e)
            a["n"] += 1
            a["score"] += e["adj"]
            a["fail"] += 1 if e["fail"] else 0
            for acr, c in e.get("buffs", {}).items():
                a["buffs"][acr] += c
        for (board, team, uid, units, mow, zone), a in acc.items():
            if a["n"] < BEST_MIN_ATTACKS:
                continue
            by_board[board].append({
                "board": board, "war": w, "team": team, "uid": uid, "units": units, "mow": mow, "zone": zone,
                "n": a["n"], "avg": a["score"] / a["n"], "fail_rate": a["fail"] / a["n"],
                "buffs": {acr: c / a["n"] for acr, c in a["buffs"].items()},
                "guild": OUR_GUILD_LABEL if team == our_idx else result["guilds"][team]["name"],
                "player": result["players"].get(uid, {}).get("displayName", uid),
                "attacks": sorted(a["attacks"], key=lambda e: e["createdOn"]),
                "players": result["players"],
            })
    return by_board


def _buff_list(buffs):
    """Bulleted list of the zone buffs that were on a defense: acronym x mean
    count per attack (e.g. "MS x3", "AP x1.5"), or "aucun" if there were none."""
    items = "".join(
        f'<li>{acr}&nbsp;×{buffs[acr]:.1f}</li>'.replace(".0<", "<")
        for acr in BUFF_ORDER if buffs.get(acr, 0) > 0.05
    )
    return f'<ul class="buff-list">{items}</ul>' if items else '<span class="buff-none">aucun</span>'


def render_defense_by_map(all_wars, prefix=""):
    """Index-page section: for every map (board), the best defensive teams
    seen across all captured wars -- lowest mean score conceded first -- with
    the zone buffs each one had on it. Every map is a <details>; the one with
    the most data opens by default. Maps only known for the 6 tracked names in
    older wars (see war_boards) simply have fewer entries."""
    by_board = compute_defense_by_map(all_wars)
    if not by_board:
        return '<div id="defense-map-wrap"></div>', [], {}
    order = sorted(by_board, key=lambda b: -len(by_board[b]))
    blocks = []
    shown_attacks, all_players = [], {}
    for i, board in enumerate(order):
        m = MAPS_DB.get(board)
        if not m:
            continue
        rows = sorted(by_board[board], key=lambda r: (r["avg"], -r["n"]))[:BEST_PER_MAP]
        for r in rows:
            shown_attacks.append(r["attacks"])
            all_players.update(r["players"])
        diff = {"hard": "+2", "easy": "+0,5"}.get(m.get("difficulty"), "")
        badge = f'<span class="map-bonus">{diff}&nbsp;pts</span>' if diff else ""
        trs = []
        for r in rows:
            comp = "".join(_unit_img(u, prefix) for u in r["units"])
            if r["mow"]:
                comp += _unit_img(r["mow"], prefix, mow=True)
            wr = r["war"]
            label = f'S{wr["season"]}&nbsp;G{wr["war_number"]}' if wr.get("war_number") else f'S{wr["season"]}'
            trs.append(
                f'<tr tabindex="0" data-attacks="{_attacks_attr(r["attacks"])}"><td>{html_escape(r["player"])}</td>'
                f'<td class="guild">{html_escape(r["guild"])}<small>{label} · {ZONE_LABELS.get(r["zone"], r["zone"])}</small></td>'
                f'<td class="comp">{comp}</td><td>{r["n"]}</td><td>{r["avg"]:.0f}</td>'
                f'<td>{r["fail_rate"] * 100:.0f}&nbsp;%</td><td class="buffs">{_buff_list(r["buffs"])}</td></tr>'
            )
        head = (
            '<tr><th>Joueur</th><th class="guild">Guilde</th><th class="comp">Composition</th>'
            '<th>Tokens</th><th>Score moy.</th><th>Échec</th><th class="buffs">Buffs</th></tr>'
        )
        blocks.append(
            f'<details class="map-defense"{" open" if i == 0 else ""}><summary>'
            f'<img class="map-thumb" src="{prefix}{m["image"]}" alt="" loading="lazy">'
            f'<span class="map-name">{html_escape(m["name"])}</span>{badge}'
            f'<span class="map-count">{len(by_board[board])} défense{"s" if len(by_board[board]) > 1 else ""}</span></summary>'
            f'<div class="table-scroll"><table class="defense-table"><thead>{head}</thead><tbody>{"".join(trs)}</tbody></table></div>'
            "</details>"
        )
    return (
        '<div id="defense-map-wrap"><h2>Meilleures défenses par map</h2>' + "".join(blocks) + '</div>'
    ), shown_attacks, all_players


BATTLEFIELD_ORDER = [
    "MedicaeStation1", "HQ", "MedicaeStation2", "SupplyDepot", "LandingPad2", "Armoury",
    "ArtilleryPosition1", "AntiAirBattery", "ArtilleryPosition2", "Bunker1", "LandingPad1", "Bunker2",
    "Trenches1", "Trenches2", "Trenches3",
]  # the in-game map grid, row by row (3 per row)


def compute_battlefield(result):
    """team -> zone -> defenders (usually 2 per zone), each with the lineups
    it fielded (numbered in the order the attackers first reached them, i.e.
    line 1..5) and every attack thrown at it."""
    by = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    for e in result["battle_events"]:
        if not e.get("defender"):
            continue
        def_team = next(t for t in result["guilds"] if t != e["team"])
        by[def_team][e["zone"]][e["defender"]].append(e)
    out = {}
    for team, zones in by.items():
        out[team] = {}
        for zone, defenders in zones.items():
            entries = []
            for uid, events in defenders.items():
                events = sorted(events, key=lambda e: e["createdOn"])
                lines, order = {}, []
                for e in events:
                    k = (tuple(e["units"]), e["mow"])
                    if k not in lines:
                        lines[k] = {"units": e["units"], "mow": e["mow"], "n": 0, "fails": 0, "score": 0}
                        order.append(k)
                    ln = lines[k]
                    ln["n"] += 1
                    ln["fails"] += 1 if e["fail"] else 0
                    ln["score"] += e["adj"]
                    e["_line"] = order.index(k) + 1
                entries.append({"uid": uid, "events": events, "lines": [lines[k] for k in order]})
            out[team][zone] = sorted(entries, key=lambda d: -len(d["events"]))
    return out


def _battlefield_chip(entry, zone, board_name, board_img, players):
    """One defender button under a map tile; its data-def feeds the modal
    (lineups on top, every attack below)."""
    name = players.get(entry["uid"], {}).get("displayName", entry["uid"])
    payload = {
        "p": entry["uid"], "z": ZONE_LABELS.get(zone, zone), "m": board_name, "i": board_img,
        "l": [[ln["units"], ln["mow"], ln["n"], ln["fails"], round(ln["score"] / ln["n"])] for ln in entry["lines"]],
        "a": [[e["uid"], TIER_CODE.get(e["tier"], "u"), round(e["adj"]), e["att_units"], e["att_mow"],
               e["_line"]] for e in entry["events"]],
    }
    attr = html_escape(json.dumps(payload, separators=(",", ":"), ensure_ascii=False)).replace(chr(34), "&quot;")
    fails = sum(1 for e in entry["events"] if e["fail"])
    return (
        f'<button type="button" class="map-def" data-def="{attr}">'
        f'<span class="map-def-name">{html_escape(name)}</span>'
        f'<small>{len(entry["events"])} att. · {fails} échec{"s" if fails > 1 else ""}</small></button>'
    )


def render_battlefield_section(result, our_idx, boards, prefix="../", attack_tables=None, attacks_script=""):
    """Bottom of a war page: the full map, one 3x5 grid of tiles per guild
    (ours on the left, theirs on the right). Each tile is the zone's map with
    its defenders underneath; clicking a defender opens the modal. Under each
    grid sits the table of the attacks that landed on it (attack_tables, keyed by
    the ATTACKING team)."""
    field = compute_battlefield(result)
    if not field:
        return ""
    teams = sorted(result["guilds"], key=lambda t: (t != our_idx, t))
    grids = []
    for team in teams:
        name = OUR_GUILD_LABEL if team == our_idx else result["guilds"][team]["name"]
        tiles = []
        # this war's real layout for this guild if known (row 1 at the bottom), else the default order
        order = (result.get("layouts") or {}).get("ours" if team == our_idx else "theirs")
        if order:
            # the save lists the rows from the player's own line (row 1) outwards: row 1 is at the BOTTOM of the map
            order = [z for r in range(4, -1, -1) for z in order[r * 3: r * 3 + 3]]
        else:
            order = BATTLEFIELD_ORDER
        for zone in order:
            m = MAPS_DB.get(boards.get(zone)) if boards.get(zone) else None
            img = f'<img src="{prefix}{m["image"]}" alt="{html_escape(m["name"])}" loading="lazy">' if m else '<div class="map-tile-noimg"></div>'
            chips = "".join(
                _battlefield_chip(d, zone, m["name"] if m else "", (prefix + m["image"]) if m else "", result["players"])
                for d in field.get(team, {}).get(zone, [])
            )
            tiles.append(
                f'<div class="map-tile"><div class="map-tile-head"><b>{ZONE_LABELS.get(zone, zone)}</b>'
                f'<span>{html_escape(m["name"]) if m else ""}</span></div>{img}'
                f'<div class="map-tile-defs">{chips}</div></div>'
            )
        attackers = next((t for t in result["guilds"] if t != team), None)
        under = (attack_tables or {}).get(attackers, "")
        grids.append(
            f'<div class="battlefield-side side-{len(grids)}"><h3>{html_escape(name)}</h3><div class="battlefield-grid">{"".join(tiles)}</div>{under}</div>'
        )
    return '<div id="battlefield-wrap"><div class="battlefield">' + "".join(grids) + "</div>" + attacks_script + "</div>"


COMBINED_OPPONENTS = {"Bloody Rose", "Ti'lath's Changers", "Red Corsairs"}  # + any guild with "Alpha Legion" in its name


GUILD_NUMBERS = {"Bloody Rose": 1, "Alpha Legion": 2, "Ti'lath's Changers": 3, "Red Corsairs": 4}  # the opponents we compare ourselves to


def guild_number(name):
    for guild, n in GUILD_NUMBERS.items():
        if guild in name:
            return n
    return None


def guild_badge(name, prefix=""):
    """The player insignias' laurel frame around the guild's number (1 orange, 2 teal, 3 gold, 4 silver)."""
    n = guild_number(name)
    if not n:
        return ""
    tier = n if n <= 3 else "silver"
    return (f'<span class="ins-frame guild-badge tier-{tier}"><span class="ins-core"><b>{n}</b></span>'
            f'<img class="ins-frame-img" src="{prefix}assets/ui/avatar_frame_war.png" alt=""></span>')


def _is_combined_opponent(name):
    return name in COMBINED_OPPONENTS or "Alpha Legion" in name


def render_opponent_map(all_wars, prefix=""):
    """Top of the index, "Contre les meilleurs": like the bottom of a war page
    but combined over every war against the COMBINED_OPPONENTS -- our
    defenses (and their attacks on them) on the left, their defenses (and our
    attacks on them) on the right, one 15-tile grid per side. Tiles are
    grouped by board, since a map moves between zones from war to war.
    Clicking a defender opens the modal (its lineups + every attack against
    it). Returns (html, events for the modal, players for the modal)."""
    tiles_by_board = {"us": defaultdict(list), "them": defaultdict(list)}
    events_all, players_all, guild_names = [], {}, []
    atk = {"u": {}, "p": {}, "z": {}, "m": {}, "g": {}}  # lookup tables of the attacks data blob (value -> index)
    atk_rows = {"us": [], "them": []}  # attacks that landed on our map (theirs) / on their map (ours)
    atk_guilds = {"us": defaultdict(set), "them": defaultdict(set)}  # attacker uid -> opponent guilds they played against

    def aidx(table, key):
        if key not in atk[table]:
            atk[table][key] = len(atk[table])
        return atk[table][key]

    for w in all_wars:
        result = w["result"]
        boards = result.get("boards") or {}
        our_idx = find_team_idx(result["guilds"], OUR_GUILD)
        opp_idx = next((t for t in result["guilds"] if t != our_idx), None)
        if opp_idx is None or not result["battle_events"] or not boards:
            continue
        opp_name = result["guilds"][opp_idx]["name"]
        if not _is_combined_opponent(opp_name):
            continue
        guild_names.append(opp_name)
        players_all.update(result["players"])
        war_tag = f'S{w["season"]} G{w["war_number"]}' if w.get("war_number") else f'S{w["season"]}'
        field = compute_battlefield(result)
        for e in sorted((e for e in result["battle_events"] if e.get("defender")), key=lambda e: e["createdOn"]):
            board = boards.get(e["zone"])
            if not board or board not in MAPS_DB:
                continue
            side = "them" if e["team"] == our_idx else "us"
            atk_guilds[side][e["uid"]].add(opp_name)
            atk_rows[side].append([
                aidx("p", e["uid"]), TIER_CODE.get(e["tier"], "u"), round(e["adj"]),
                [aidx("u", u) for u in e["att_units"]], aidx("u", e["att_mow"]) if e["att_mow"] else -1,
                [aidx("u", u) for u in e["units"]], aidx("u", e["mow"]) if e["mow"] else -1,
                aidx("z", f'{ZONE_LABELS.get(e["zone"], e["zone"])} · {war_tag}'), aidx("m", board), aidx("g", opp_name),
            ])
        for side, team in (("us", our_idx), ("them", opp_idx)):
            for zone, entries in field.get(team, {}).items():
                board = boards.get(zone)
                if not board:
                    continue
                for d in entries:
                    events_all.append(d["events"])
                    tiles_by_board[side][board].append((opp_name, war_tag, zone, d, result["players"]))

    if not guild_names:
        return '<div id="opp-map-wrap"></div>', [], {}

    uniq = list(dict.fromkeys(guild_names))
    default_guild = "Bloody Rose" if "Bloody Rose" in uniq else uniq[0]

    def chip(side, opp_name, war_tag, zone, d, players, m):
        name = players.get(d["uid"], {}).get("displayName", d["uid"])
        zlabel = ZONE_LABELS.get(zone, zone)
        context = f"vs {opp_name}" if side == "us" else opp_name
        payload = {
            "p": d["uid"], "z": f"{zlabel} · {context} {war_tag}", "m": m["name"], "i": prefix + m["image"],
            "l": [[ln["units"], ln["mow"], ln["n"], ln["fails"], round(ln["score"] / ln["n"])] for ln in d["lines"]],
            "a": [[e["uid"], TIER_CODE.get(e["tier"], "u"), round(e["adj"]), e["att_units"], e["att_mow"],
                   e["_line"]] for e in d["events"]],
        }
        attr = html_escape(json.dumps(payload, separators=(",", ":"), ensure_ascii=False)).replace(chr(34), "&quot;")
        fails = sum(1 for e in d["events"] if e["fail"])
        hidden = "" if opp_name == default_guild else " hidden"
        return (
            f'<button type="button" class="map-def" data-g="{html_escape(opp_name)}"{hidden} data-def="{attr}">'
            f'<span class="map-def-name">{html_escape(name)}</span>'
            f'<small>{html_escape(context)} · {zlabel}</small>'
            f'<small>{len(d["events"])} att. · {fails} échec{"s" if fails > 1 else ""}</small></button>'
        )

    sides = []
    for side, heading in (("us", OUR_GUILD_LABEL), ("them", default_guild)):
        tiles = []
        for board, m in MAPS_DB.items():
            entries = sorted(tiles_by_board[side].get(board, []), key=lambda x: -len(x[3]["events"]))
            chips = "".join(chip(side, *x, m) for x in entries)
            tiles.append(
                f'<div class="map-tile"><div class="map-tile-head"><b>{html_escape(m["name"])}</b></div>'
                f'<img src="{prefix}{m["image"]}" alt="{html_escape(m["name"])}" loading="lazy">'
                f'<div class="map-tile-defs">{chips}</div></div>'
            )
        pills = "".join(
            f'<button type="button" class="chip" data-p="{atk["p"][uid]}" data-gs="{html_escape("|".join(sorted(gs)))}">'
            f'{html_escape(players_all.get(uid, {}).get("displayName", uid))}</button>'
            for uid, gs in sorted(atk_guilds[side].items(), key=lambda kv: players_all.get(kv[0], {}).get("displayName", kv[0]).lower())
        )
        under = (f'<div class="attacks-block" data-team="{len(sides)}" data-filter="g"><div class="chips attacks-chips timeline-player-chips">{pills}</div>'
                 '<div class="attacks-scroll"><table class="attacks-table"><thead><tr><th class="a-comp">Attaque</th><th class="a-def">Contre</th>'
                 '<th class="a-score">Score</th><th class="a-map">Map</th></tr></thead><tbody></tbody></table></div></div>') if pills else ""
        sides.append(
            f'<div class="battlefield-side side-{len(sides)}"><h3{" id=opp-heading" if side == "them" else ""}>{html_escape(heading)}</h3><div class="battlefield-grid">{"".join(tiles)}</div>{under}</div>'
        )
    ordered = sorted(uniq, key=lambda g: (guild_number(g) or 99, uniq.index(g)))
    picker = (
        '<div class="opp-filter"><span class="opp-filter-label">Se comparer à</span><div class="chips">'
        + "".join(
            f'<button type="button" class="chip guild-chip{" active" if g == default_guild else ""}" data-g="{html_escape(g)}">'
            f'{guild_badge(g, prefix)}<span class="gc-name">{html_escape(g)}</span></button>'
            for g in ordered
        )
        + "</div></div>"
    )
    data = {
        "u": list(atk["u"]), "p": list(atk["p"]), "z": list(atk["z"]), "g": list(atk["g"]),
        "m": [[MAPS_DB[b]["name"], prefix + MAPS_DB[b]["image"]] for b in atk["m"]],
        "t": [atk_rows["us"], atk_rows["them"]],
    }
    script = ('<script type="application/json" id="attacks-data">'
              + json.dumps(data, separators=(",", ":"), ensure_ascii=False).replace("</", "<\\/") + "</script>")
    html = f'<div id="opp-map-wrap">{picker}<div class="battlefield">{"".join(sides)}</div>{script}</div>'
    return html, events_all, players_all


def build_attacks(result, our_idx, boards, prefix="../"):
    """Per-guild attack tables for the bottom of a war page. Returns
    ({attacking team: table html}, data <script> html): the tables are placed
    under the map where those attacks landed (see render_battlefield_section) --
    their attacks under our defense map, ours under theirs. One pill per attacking
    player; exactly one player is shown at a time (the first pill is preselected).
    Rows are built client-side (attacks-table.js) from a compact JSON blob that
    indexes into its own unit/player/map lists; names and portraits come from the
    page's shared #defense-data blob."""
    compute_battlefield(result)  # numbers each attack's defense line (e["_line"])
    events = sorted((e for e in result["battle_events"] if e.get("defender")), key=lambda e: e["createdOn"])
    if not events:
        return {}, ""
    units, players, zones, maps = {}, {}, {}, {}

    def idx(table, key):
        if key not in table:
            table[key] = len(table)
        return table[key]

    teams = sorted(result["guilds"], key=lambda t: (t != our_idx, t))
    tables, rows_by_team = {}, []
    for ti, team in enumerate(teams):
        rows, attackers = [], {}
        for e in events:
            if e["team"] != team:
                continue
            board = boards.get(e["zone"])
            m = MAPS_DB.get(board) if board else None
            mi = idx(maps, board) if m else -1
            pi = idx(players, e["uid"])
            attackers[e["uid"]] = pi
            rows.append([
                pi, TIER_CODE.get(e["tier"], "u"), round(e["adj"]),
                [idx(units, u) for u in e["att_units"]], idx(units, e["att_mow"]) if e["att_mow"] else -1,
                [idx(units, u) for u in e["units"]], idx(units, e["mow"]) if e["mow"] else -1,
                idx(zones, ZONE_LABELS.get(e["zone"], e["zone"])), mi,
            ])
        rows_by_team.append(rows)
        if not rows:
            continue
        pills = "".join(
            f'<button type="button" class="chip{" active" if n == 0 else ""}" data-p="{pi}">'
            f'{html_escape(result["players"].get(uid, {}).get("displayName", uid))}</button>'
            for n, (uid, pi) in enumerate(sorted(
                attackers.items(), key=lambda kv: result["players"].get(kv[0], {}).get("displayName", kv[0]).lower()
            ))
        )
        tables[team] = (
            f'<div class="attacks-block" data-team="{ti}"><div class="chips attacks-chips timeline-player-chips">{pills}</div>'
            '<div class="attacks-scroll"><table class="attacks-table"><thead><tr>'
            '<th class="a-comp">Attaque</th><th class="a-def">Contre</th>'
            '<th class="a-score">Score</th><th class="a-map">Map</th>'
            '</tr></thead><tbody></tbody></table></div></div>'
        )
    data = {
        "u": list(units), "p": list(players), "z": list(zones),
        "m": [[MAPS_DB[b]["name"], prefix + MAPS_DB[b]["image"]] for b in maps],
        "t": rows_by_team,
    }
    script = (
        '<script type="application/json" id="attacks-data">'
        + json.dumps(data, separators=(",", ":"), ensure_ascii=False).replace("</", "<\\\\/")
        + "</script>"
    )
    return tables, script


FR_MONTHS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."]


def _fmt_int(n):
    return f"{int(round(n)):,}".replace(",", " ")


def _fmt_pct(x):
    return f"{x * 100:.1f}".replace(".", ",") + " %"


def _fmt_day(ts_ms):
    d = datetime.datetime.fromtimestamp(ts_ms / 1000)
    return f"{d.day} {FR_MONTHS[d.month - 1]}"


def compute_war_recap(result, our_idx):
    """Per-guild totals for the war-page recap card: score (sum of raw battle
    scores, the same series the Chronologie curve plots), attacks used,
    successful attacks (win/finish), dropped tokens (fails), unused tokens
    (pool minus attacks used -- abandoned battles are refunded so they don't
    count as used) and abandoned battles."""
    out = {}
    for t in result["guilds"]:
        stats = [ps for ps in result["player_stats"].values() if ps["team"] == t]
        played = sum(ps["played"] for ps in stats)
        cleared = sum(ps["win"] + ps["finish"] for ps in stats)
        dropped = sum(ps["fail"] for ps in stats)
        pool = TOKENS_PER_PLAYER * len(stats)
        evs = [e for e in result["battle_events"] if e["team"] == t]
        score = sum(e.get("score", 0) for e in evs)
        # Points per token excludes the zone-clear bonus (`adj`, see
        # ranking.py): only what the played tokens themselves earned.
        token_score = sum(e.get("adj", 0) for e in evs)
        out[t] = {
            "name": OUR_GUILD_LABEL if t == our_idx else result["guilds"][t]["name"],
            "score": score, "played": played, "cleared": cleared, "dropped": dropped,
            "remaining": max(0, pool - played),
            "abandoned": result.get("abandoned", {}).get(t, 0),
            "rate": cleared / played if played else 0.0,
            "ppt": token_score / played if played else 0.0,
        }
    return out


def render_war_recap(result, our_idx, outcome, season, war_number):
    """Recap card shown at the top of a war page (replaces the old
    Victoire/Défaite pill for wars with a full capture): header with war
    number and dates, both guilds' total score with a share bar, then a
    head-to-head table of rates/counts (our side amber, theirs red),
    and the result pill."""
    recap = compute_war_recap(result, our_idx)
    them_idx = next(t for t in result["guilds"] if t != our_idx)
    us, them = recap[our_idx], recap[them_idx]

    evs = result["battle_events"]
    first, last = min(e["createdOn"] for e in evs), max(e["createdOn"] for e in evs)
    d1, d2 = _fmt_day(first), _fmt_day(last)
    dates = d1 if d1 == d2 else f"{d1} – {d2}"
    title = f"Guerre {war_number}" if war_number else "Guerre"
    if season:
        title = f"Saison {season} · {title}"

    total = us["score"] + them["score"]
    share_us = us["score"] / total if total else 0.5

    def row(label, a, b, fmt, scale):
        # Fixed per-row scale (value == scale fills the bar); anything above
        # it is capped at a full bar.
        wa = min(a / scale, 1) * 100
        wb = min(b / scale, 1) * 100
        return (
            '<div class="rc-row">'
            f'<div class="rc-bar-wrap rc-left"><span class="rc-bar war-us" style="width:{wa:.1f}%"></span></div>'
            f'<span class="rc-val war-us">{fmt(a)}</span>'
            f'<span class="rc-label">{label}</span>'
            f'<span class="rc-val war-them">{fmt(b)}</span>'
            f'<div class="rc-bar-wrap rc-right"><span class="rc-bar war-them" style="width:{wb:.1f}%"></span></div>'
            '</div>'
        )

    rows = "".join([
        row("Taux de réussite", us["rate"], them["rate"], _fmt_pct, 1.0),
        row("Points par jeton", us["ppt"], them["ppt"], _fmt_int, 1600),
        row("Attaques réussies", us["cleared"], them["cleared"], _fmt_int, 300),
        row("Jetons restants", us["remaining"], them["remaining"], _fmt_int, 10),
        row("Jetons perdus", us["dropped"], them["dropped"], _fmt_int, 60),
        row("Abandons", us["abandoned"], them["abandoned"], _fmt_int, 3),
    ])

    banner = ""
    if outcome in ("win", "loss"):
        text = "Victoire" if outcome == "win" else "Défaite"
        banner = f'<p class="rc-banner {"is-win" if outcome == "win" else "is-loss"}">{text}</p>'

    return (
        '<section class="war-recap">'
        f'<header class="rc-head"><span class="rc-title">{html_escape(title)}</span>'
        f'<span class="rc-dates">{html_escape(dates)}</span></header>'
        '<div class="rc-body">'
        '<div class="rc-teams">'
        f'<div class="rc-team"><span class="rc-name"><i class="rc-dot war-us"></i>{html_escape(us["name"])}</span>'
        f'<span class="rc-score">{_fmt_int(us["score"])}</span></div>'
        '<span class="rc-vs">vs</span>'
        f'<div class="rc-team rc-team-right"><span class="rc-name">{html_escape(them["name"])}<i class="rc-dot war-them"></i></span>'
        f'<span class="rc-score">{_fmt_int(them["score"])}</span></div>'
        '</div>'
        f'<div class="rc-share"><span class="war-us" style="width:{share_us * 100:.1f}%"></span>'
        f'<span class="war-them" style="width:{(1 - share_us) * 100:.1f}%"></span></div>'
        f'<div class="rc-share-labels"><span>{round(share_us * 100)} % des points</span>'
        f'<span>{round((1 - share_us) * 100)} %</span></div>'
        f'<div class="rc-rows">{rows}</div>'
        f'{banner}'
        '</div></section>'
    )


def render_war_page(slug, result, season, outcome=None, active_uids=frozenset(), war_number=None):
    guilds = result["guilds"]
    hard_cols = result["hard_cols"]
    easy_cols = result["easy_cols"]

    our_idx = find_team_idx(guilds, OUR_GUILD)
    our_rows = guild_rows(result, our_idx)
    # War end date next to the result badge -- only for wars with real log
    # timestamps (legacy wars have none, see legacy_ranking.py, where
    # war_end is just a placeholder 0, not an actual date).
    date_str = None
    if result["battle_events"]:
        date_str = datetime.datetime.fromtimestamp(result["war_end"] / 1000).strftime("%d/%m/%Y")
    if any(e["team"] == our_idx for e in result["battle_events"]):
        body = render_war_recap(result, our_idx, outcome, season, war_number)
    else:
        body = render_result_badge(outcome, date_str)

    # Chronologie + Jetons théoriquement réussis -- only possible for wars
    # with raw per-battle data (legacy wars have none, see legacy_ranking.py,
    # and a hand-supplemented war drops its battle_events, see ranking.py),
    # so the section is simply left empty for those.
    display_names = {uid: p.get("displayName", uid) for uid, p in result["players"].items()}
    body += "<h2>Détail</h2>" + render_table(our_rows, hard_cols, easy_cols)
    body += render_war_chronologie_section(result, our_idx, display_names)

    other_tables = []
    for team_idx in sorted(guilds):
        if team_idx == our_idx:
            continue
        rows = guild_rows(result, team_idx)
        other_tables.append(render_table(rows, hard_cols, easy_cols))

    body += render_defense_section(result, our_idx, result.get("boards") or {})
    # the opponent's table and best defences stay folded away, at the bottom
    their_defense = render_defense_section(result, our_idx, result.get("boards") or {}, ours=False)
    if other_tables or their_defense:
        body += ('<details class="adv-expand"><summary>Voir l\'adversaire</summary>'
                 + ("<h2>Adversaires</h2>" + "".join(other_tables) if other_tables else "")
                 + (f'<div class="adv-defense"><h2>Meilleures défenses</h2>{their_defense}</div>' if their_defense else "")
                 + "</details>")
    has_strategy = any(e.get("defender") for e in result["battle_events"])
    if has_strategy:
        # the Défense rows open the shared modal; it needs its names/portraits blob
        body += _defense_modal_html([[e for e in result["battle_events"] if e.get("defender")]], result["players"], "../")
    header_action = strategy_button(slug + "-strategie.html") if has_strategy else ""

    title = ", ".join(opponent_names(result, our_idx)) or slug
    back_link = back_link_html(f"../seasons/{season}.html", f"Saison {season}")
    html = render_page(nav_sub=f"war-{season}", title=title, asset_prefix="../", body=body, back_link=back_link, title_class="", header_extra="", header_action=header_action, v=ASSETS_VERSION)
    out_path = os.path.join(DOCS_DIR, "wars", slug + ".html")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)


def render_war_strategy_page(slug, result, season):
    """"Stratégie" page of a war (button next to the war's H1): both guilds' full
    map with defenders, and under each map the attack table of the guild that hit
    it (see build_attacks / render_battlefield_section)."""
    our_idx = find_team_idx(result["guilds"], OUR_GUILD)
    boards = result.get("boards") or {}
    attack_tables, attacks_script = build_attacks(result, our_idx, boards)
    section = render_battlefield_section(result, our_idx, boards, attack_tables=attack_tables, attacks_script=attacks_script)
    if not section:
        return False
    body = section + _defense_modal_html([[e for e in result["battle_events"] if e.get("defender")]], result["players"], "../")
    opp = ", ".join(opponent_names(result, our_idx)) or slug
    back_link = back_link_html(f"{slug}.html", opp)
    html = render_page(
        nav_sub=f"war-{season}", title=f"Stratégie · {opp}", asset_prefix="../", body=body, back_link=back_link,
        title_class="", header_extra="", header_action="", v=ASSETS_VERSION,
    )
    with open(os.path.join(DOCS_DIR, "wars", slug + "-strategie.html"), "w", encoding="utf-8") as f:
        f.write(html)
    return True


def render_season_page(season, wars_in_season, active_uids=frozenset()):
    wars_in_season = sorted(wars_in_season, key=lambda w: w["result"]["war_start"])

    frise_items = []
    for w in wars_in_season:
        our_idx = find_team_idx(w["result"]["guilds"], OUR_GUILD)
        opp = ", ".join(opponent_names(w["result"], our_idx)) or w["slug"]
        above = str(w["war_number"]) if w.get("war_number") else None
        frise_items.append((opp, f"../wars/{w['slug']}.html", w.get("outcome"), above))

    display_names, averages, win_rate, tokens, buffs, maps_ = compute_wars_averages(wars_in_season)
    score_display_names, score_distributions = compute_score_distributions(wars_in_season)
    agg_events, agg_display_names = aggregate_relative_battle_events(wars_in_season)
    agg_milestones = aggregate_ms_milestones(wars_in_season)

    body = render_frise(frise_items)
    body += f'<div id="table-wrap">{render_history_table(wars_in_season)}</div>' + BAREME_EXPLAIN
    body += '<h2>Scores</h2>'
    body += render_average_chart(display_names, averages, win_rate, tokens, buffs, maps_, score_display_names, score_distributions, active_uids, scope="season")
    body += render_chronologie_section(agg_events, agg_milestones, agg_display_names, relative=True, n_wars=_n_event_wars(wars_in_season))

    header_action = ""
    back_link = back_link_html("../war.html", "War")
    html = render_page(nav_sub=f"war-{season}", title=f"Guerre · saison {season}", asset_prefix="../", body=body, back_link=back_link, title_class="", header_extra="", header_action=header_action, v=ASSETS_VERSION)
    out_dir = os.path.join(DOCS_DIR, "seasons")
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, f"{season}.html"), "w", encoding="utf-8") as f:
        f.write(html)


def compute_season_averages(seasons):
    """uid -> per-season [sum_pts, war_count], plus display names, overall
    totals/war-counts/averages across every war played on OUR_GUILD's team, an
    overall "win_rate" ((wins + finishes) / all 10 tokens per war, i.e.
    (win+finish) / (win+finish+fail+miss) -- a literal "chance of getting a
    positive outcome (win or finish) out of every token available", counting
    an unused token (miss) as a negative outcome just like a fail -- e.g. 6
    wins + 1 finish out of 10 tokens is a straightforward 70%), and the
    Tokens/Buffs/Maps point averages (summed across every war played, then
    divided by war_counts for Tokens/Buffs -- same denominator as the points
    average -- but by a separate maps_counts for Maps: legacy wars (see
    legacy_ranking.py) have no hard_cols/easy_cols at all, so the map bonus is
    unrecoverable there rather than legitimately zero; counting those wars in
    the denominator would understate the average instead of just excluding
    wars where the metric genuinely couldn't be scored).

    win_rate replaced an earlier "efficience" ratio ((fails + misses) /
    (wins + finishes)) shown inverted as "1 - efficience" -- that ratio
    compares fails+misses directly against wins+finishes rather than against
    the total tokens available, so a bad enough war (more fails+misses than
    wins/finishes) pushed it past 100%, showing as a nonsensical negative
    "success rate" (e.g. -22%). win_rate is a true fraction of an
    always-larger-or-equal denominator (win+fail+finish+miss, i.e. every
    token), so it can't leave the 0-100% range."""
    season_stats = defaultdict(dict)  # uid -> season -> [sum_pts, war_count]
    win_fail_finish_miss = defaultdict(lambda: [0, 0, 0, 0])
    tokens, buffs, maps_ = defaultdict(float), defaultdict(float), defaultdict(float)
    maps_counts = defaultdict(int)
    display_names = {}
    for season, wars_in_season in seasons.items():
        for w in wars_in_season:
            result = w["result"]
            our_idx = find_team_idx(result["guilds"], OUR_GUILD)
            hard_cols, easy_cols = result["hard_cols"], result["easy_cols"]
            maps_scored = bool(hard_cols or easy_cols)
            for uid, ps in result["player_stats"].items():
                if ps["team"] != our_idx:
                    continue
                entry = season_stats[uid].setdefault(season, [0.0, 0])
                entry[0] += ps["pts"]
                entry[1] += 1
                wffm = win_fail_finish_miss[uid]
                wffm[0] += ps["win"]
                wffm[1] += ps["fail"]
                wffm[2] += ps["finish"]
                wffm[3] += ps["miss"]
                reussites, buffs_pts, map_pts = compute_pts_breakdown(ps, hard_cols, easy_cols)
                tokens[uid] += reussites
                buffs[uid] += buffs_pts
                if maps_scored:
                    maps_[uid] += map_pts
                    maps_counts[uid] += 1
                display_names[uid] = result["players"].get(uid, {}).get("displayName", uid)

    totals = {uid: sum(s for s, _ in per_season.values()) for uid, per_season in season_stats.items()}
    war_counts = {uid: sum(c for _, c in per_season.values()) for uid, per_season in season_stats.items()}
    averages = {uid: totals[uid] / war_counts[uid] for uid in season_stats}
    tokens = {uid: v / war_counts[uid] for uid, v in tokens.items()}
    buffs = {uid: v / war_counts[uid] for uid, v in buffs.items()}
    maps_ = {uid: v / maps_counts[uid] for uid, v in maps_.items() if maps_counts[uid]}
    win_rate = {
        uid: ((win + finish) / (win + fail + finish + miss) if (win + fail + finish + miss) > 0 else 0.0)
        for uid, (win, fail, finish, miss) in win_fail_finish_miss.items()
    }
    return season_stats, display_names, totals, war_counts, averages, win_rate, tokens, buffs, maps_


def render_season_average_table(season_numbers, season_stats, display_names, averages, active_uids=frozenset()):
    """Joueur x season table for the homepage: each season column shows the
    player's average points per war played that season (not the raw per-war
    results), plus the overall Moyenne across every war played. Rows are
    tagged data-uid/data-active so the "Joueurs actifs seulement" header
    toggle (active-toggle.js) can hide anyone not on the roster in the most
    recently recorded war, without needing a server round-trip."""
    thead_cells = ['<th class="rk">#</th>', "<th>Joueur</th>"]
    for season in season_numbers:
        thead_cells.append(f'<th data-href="seasons/{season}.html">Saison {season}</th>')  # a click in the column opens the season (row-link.js)
    thead_cells.append("<th>Moyenne</th>")
    thead = "".join(thead_cells)

    rounded_avg = {uid: round_pts(averages[uid]) for uid in season_stats}
    avg_lo, avg_hi = (min(rounded_avg.values()), max(rounded_avg.values())) if rounded_avg else (0, 0)

    # Each season column gets its own gradient bounds (like Moyenne already
    # had) rather than sharing one scale across every column -- a player's
    # single-season average and their all-time average don't live on the
    # same scale, so a shared bound would wash most seasons out to one end.
    season_values = {}
    season_bounds = {}
    for season in season_numbers:
        vals = {
            uid: round_pts(entry[0] / entry[1])
            for uid, per_season in season_stats.items()
            if (entry := per_season.get(season))
        }
        season_values[season] = vals
        season_bounds[season] = (min(vals.values()), max(vals.values())) if vals else (0, 0)

    body_rows = []
    for rank, uid in enumerate(sorted(season_stats, key=lambda u: -averages[u]), 1):
        cells = [f'<td class="rk">{rank}</td>', name_cell(uid, display_names[uid], "")]
        for season in season_numbers:
            val = season_values[season].get(uid)
            if val is None:
                cells.append("<td>-</td>")
            else:
                lo, hi = season_bounds[season]
                cells.append(f"<td{value_to_bg(val, lo, hi)}>{val}</td>")
        cells.append(f"<td{value_to_bg(rounded_avg[uid], avg_lo, avg_hi)}>{rounded_avg[uid]}</td>")
        is_active = "true" if uid in active_uids else "false"
        body_rows.append(f'<tr data-uid="{uid}" data-active="{is_active}"{player_row_attrs(uid, "")}>' + "".join(cells) + "</tr>")

    return f"""<div class="table-scroll"><table class="sortable">
  <thead><tr>{thead}</tr></thead>
  <tbody>{''.join(body_rows)}</tbody>
</table></div>"""


def render_metric_svg(metric_key, display_names, values, active_uids, fmt, ascending=False, id_suffix=""):
    """One inline SVG bar chart for a single metric, players sorted with the
    "best" value leftmost (highest first by default, or lowest first when
    `ascending` is set — e.g. for a lower-is-better metric, none currently
    used but kept as an option). Bars for players present in the most recent
    war are highlighted green to show who's currently active. id_suffix
    disambiguates the "active players only" variant rendered alongside the
    full one on index.html (see render_average_chart) so both can coexist
    without a duplicate SVG id."""
    order = sorted(values, key=lambda u: values[u] if ascending else -values[u])
    if not order:
        return ""

    bar_width, gap = 22, 6
    left_pad = 40  # room for the leftmost rotated label so it isn't cropped by the viewBox edge
    chart_h, top_pad, bottom_pad = 220, 20, 130
    max_val = max(values.values())
    width = left_pad + gap + len(order) * (bar_width + gap)
    height = top_pad + chart_h + bottom_pad

    bars = []
    for i, uid in enumerate(order):
        val = values[uid]
        # Values can go negative (e.g. a success rate below 0% for someone who
        # failed more than their total token count); clamp the bar itself to
        # a minimum height of 0 since SVG rejects a negative height, while
        # still showing the real (possibly negative) number in the label.
        h = max(0.0, (val / max_val) * chart_h) if max_val else 0
        x = left_pad + gap + i * (bar_width + gap)
        y = top_pad + (chart_h - h)
        cx = x + bar_width / 2
        fill = "var(--bar-active)" if uid in active_uids else "var(--bar-muted)"
        bars.append(
            f'<rect class="chart-bar" data-uid="{uid}" x="{x:.1f}" y="{y:.1f}" '
            f'width="{bar_width}" height="{h:.1f}" rx="2" fill="{fill}"><title>{html_escape(display_names[uid])} · {fmt(val)}</title></rect>'
        )
        bars.append(f'<text data-uid="{uid}" x="{cx:.1f}" y="{y - 6:.1f}" class="chart-value">{fmt(val)}</text>')
        label_y = top_pad + chart_h + 12
        bars.append(
            f'<text data-uid="{uid}" x="{cx:.1f}" y="{label_y}" class="chart-label" '
            f'transform="rotate(-60 {cx:.1f} {label_y})">{html_escape(display_names[uid])}</text>'
        )

    return (
        f'<svg id="avg-chart-{metric_key}{id_suffix}" viewBox="0 0 {width} {height}" width="{width}" height="{height}" '
        f'xmlns="http://www.w3.org/2000/svg">' + "".join(bars) + "</svg>"
    )


def render_average_chart(
    display_names, averages, win_rate, tokens, buffs, maps_,
    score_display_names, score_distributions,
    active_uids=frozenset(), scope="global",
):
    """Chip-toggled chart section: "Moyenne" (avg points, shown by default),
    "Scores" (per-player score variance -- median + Q1/Q3 box-plot on a fixed
    0-1600 y-axis, sitting right next to "Moyenne" per the user's request even
    though it's a different chart shape (box-plot vs bar) -- the .chips/
    .chart-scroll idiom doesn't care what's inside, it just shows/hides
    whichever div matches the active chip), "Fiabilité" ((wins + finishes) /
    all 10 tokens per war -- a literal chance-of-a-positive-outcome
    percentage, replacing an earlier unbounded "Efficience" ratio that could
    go negative, see compute_season_averages), and the Tokens/Buffs/Maps
    point averages (column-wise sums of the same breakdown shown in the
    per-war tables, divided by the number of wars counted -- same denominator
    as "Moyenne" itself), all rendered up front as static inline SVGs (no JS
    dependency beyond the show/hide toggle).

    The "scores" chart-scroll DIV is always emitted, even when
    score_distributions is empty (e.g. a season made up entirely of legacy
    wars, see legacy_ranking.py) -- same reasoning as the old standalone
    #chart-wrap-scores section it replaced: keeping every page's chart-wrap
    with an identical set of (metric, filter) keys is what lets
    page-transition.js's keyed sync (see transitionChart) always find a
    match regardless of which two pages are involved in a client-side nav.
    Only the "Scores" *chip button* is left out on a page with no per-battle
    data at all -- nothing to toggle to, so no point offering it."""
    if not averages:
        return ""

    moyenne_legend = (
        "Moyenne des scores cumulés sur la saison"
        if scope == "season"
        else "Moyenne des scores cumulés au global"
    )
    scores_legend = "Médiane et quartiles (25%-75%) des scores individuels par bataille"
    legends = {
        "moyenne": moyenne_legend,
        "scores": scores_legend,
        "victoire": "Probabilité de victoire ou finish sur un token",
        "tokens": "Moyenne des points accumulés grâce aux tokens (de 5pts à 10pts)",
        "buffs": "Moyenne des points accumulés en remportant une victoire sur une zone sous buff (MS: 2pts , Autres 0.5pts)",
        "maps": "Moyenne des points accumulés en remportant une victoire sur une map difficile (de 0.5pts à 2pts)",
    }
    # Chip labels, separate from the `legends`/data-metric keys above so the
    # internal "victoire" identifier (already threaded through
    # compute_wars_averages/compute_season_averages) doesn't need renaming
    # just because its user-facing label does.
    labels = {"moyenne": "Moyenne", "scores": "Scores", "victoire": "Fiabilité", "tokens": "Tokens", "buffs": "Buffs", "maps": "Maps"}

    metrics = [
        ("moyenne", averages, lambda v: str(round_pts(v)), False),
        ("victoire", win_rate, lambda v: f"{v * 100:.0f}%", False),
        ("tokens", tokens, lambda v: str(round_pts(v)), False),
        ("buffs", buffs, lambda v: str(round_pts(v)), False),
        ("maps", maps_, lambda v: str(round_pts(v)), False),
    ]

    # "scores" chip sits right after "moyenne" (per the user's request),
    # everything else keeps its existing order -- left out entirely when
    # this page has no per-battle score data to show (its chart-scroll DIV
    # still gets rendered below, just with nothing to switch to it).
    has_scores = any(score_distributions.values())
    chip_keys = ["moyenne", "scores", "victoire", "tokens", "buffs", "maps"] if has_scores else [
        "moyenne", "victoire", "tokens", "buffs", "maps"
    ]
    chips = "".join(
        f'<button type="button" class="chip{" active" if key == "moyenne" else ""}" data-metric="{key}" data-legend="{html_escape(legends[key])}">{html_escape(labels[key])}</button>'
        for key in chip_keys
    )

    charts = []
    for key, values, fmt, ascending in metrics:
        style = "" if key == "moyenne" else ' style="display:none"'
        svg = render_metric_svg(key, display_names, values, active_uids, fmt, ascending=ascending)
        charts.append(f'<div class="chart-scroll" data-metric="{key}"{style}>{svg}</div>')

    scores_svg = render_boxplot_svg(score_display_names, score_distributions, active_uids)
    charts.append(f'<div class="chart-scroll" data-metric="scores" style="display:none">{scores_svg}</div>')

    return (
        f'<div id="chart-wrap" class="chart-wrap"><div class="chips">{chips}</div>'
        f'{"".join(charts)}'
        f'<p class="chart-legend">{html_escape(legends["moyenne"])}</p></div>'
    )


def compute_quartiles(values):
    """(q1, median, q3) via linear interpolation between the two nearest
    ranks (same convention as numpy's/statistics's default "linear" method),
    for a non-empty list of raw values."""
    xs = sorted(values)
    n = len(xs)

    def pct(p):
        if n == 1:
            return xs[0]
        idx = p * (n - 1)
        lo = int(math.floor(idx))
        hi = min(lo + 1, n - 1)
        frac = idx - lo
        return xs[lo] + (xs[hi] - xs[lo]) * frac

    return pct(0.25), pct(0.5), pct(0.75)


def compute_score_distributions(wars_list):
    """uid -> list of individual battle scores (the same "adj" score used to
    classify win/fail/finish tiers in ranking.py, roughly 0-1600) across every
    battle OUR_GUILD's team played in wars_list, plus display names. Legacy
    wars (see legacy_ranking.py) carry no per-battle data at all -- only
    hand-transcribed aggregate counts -- so they simply contribute nothing
    here rather than a fabricated value."""
    display_names = {}
    scores = defaultdict(list)
    for w in wars_list:
        result = w["result"]
        our_idx = find_team_idx(result["guilds"], OUR_GUILD)
        for uid, ps in result["player_stats"].items():
            if ps["team"] != our_idx:
                continue
            battle_scores = ps.get("scores")
            if battle_scores:
                scores[uid].extend(battle_scores)
            display_names[uid] = result["players"].get(uid, {}).get("displayName", uid)
    return display_names, scores


def render_boxplot_svg(display_names, distributions, active_uids, id_suffix=""):
    """One inline SVG "capsule" box-plot chart, sorted by descending median
    like the other metrics' "higher is better" bars. Unlike render_metric_svg,
    the y-axis is a FIXED 0-1600 domain (the raw battle score range, not the
    tier points) rather than auto-scaled to the data -- a fixed domain is what
    lets a "tight" box genuinely read as low variance at a glance, both
    against other players and across page navigations, instead of always
    being stretched to fill the chart. Gridlines/ticks are drawn for the same
    reason: a fixed domain only reads correctly with a reference scale,
    whereas the auto-scaled bar charts don't need one.

    Each player is a <g> "capsule": a thin min-max whisker (with small end
    caps) behind a filled, translucent, rounded Q1-Q3 box, capped with a bold
    solid median tick -- filled/rounded rather than the plain stroked-outline
    rect of a classic box-plot so it reads as a first-class chart idiom next
    to the site's existing pill-shaped chips/badges, not a spreadsheet
    artifact. The whole group gets a CSS hover glow (see .chart-box-group in
    style.css) driven by a per-group --accent custom property, so the glow
    color matches that player's own indigo/green regardless of active-roster
    state without needing a second CSS rule per color."""
    # Sorted by descending median first, then descending Q1, then descending
    # Q3 as tie-breakers (in that order) -- ties on the median alone are
    # common with a small, discrete set of possible battle scores, and
    # without a tie-breaker Python's sort would leave those players in
    # whatever order dict iteration happened to give them, so the chart's
    # ordering would look arbitrary/unstable across regenerations.
    def sort_key(u):
        q1, med, q3 = compute_quartiles(distributions[u])
        return (-med, -q1, -q3)

    order = sorted((uid for uid, vals in distributions.items() if vals), key=sort_key)
    if not order:
        return ""

    bar_width, gap = 22, 6
    left_pad = 40
    # Same chart_h/top_pad/bottom_pad as render_metric_svg -- the "scores"
    # chip lives in the same .chart-wrap as the bar-chart metrics, and
    # nothing constrains .chart-scroll's height, so a differently-sized SVG
    # here would resize the wrap (and push the legend/table below it) every
    # time the user switches chips.
    chart_h, top_pad, bottom_pad = 220, 20, 130
    y_max = 1600
    width = left_pad + gap + len(order) * (bar_width + gap)
    height = top_pad + chart_h + bottom_pad

    def y_of(v):
        return top_pad + chart_h - (max(0.0, min(v, y_max)) / y_max) * chart_h

    axis = []
    for tick in (0, 400, 800, 1200, 1600):
        ty = y_of(tick)
        axis.append(
            f'<line x1="{left_pad:.1f}" y1="{ty:.1f}" x2="{width:.1f}" y2="{ty:.1f}" '
            f'stroke="var(--border)" stroke-width="1"/>'
        )
        axis.append(f'<text x="{left_pad - 6:.1f}" y="{ty + 3:.1f}" class="chart-axis-label">{tick}</text>')

    bars = []
    for i, uid in enumerate(order):
        vals = distributions[uid]
        q1, med, q3 = compute_quartiles(vals)
        lo, hi = min(vals), max(vals)
        x = left_pad + gap + i * (bar_width + gap)
        cx = x + bar_width / 2
        color = "var(--bar-active)" if uid in active_uids else "var(--bar-muted)"
        y_lo, y_hi = y_of(lo), y_of(hi)
        y_q1, y_q3, y_med = y_of(q1), y_of(q3), y_of(med)
        cap_half = bar_width * 0.22

        bars.append(f'<g class="chart-box-group" data-uid="{uid}" style="--accent:{color}">')
        # Whisker first (drawn behind the box): full min-max spread, muted so
        # the eye lands on the box/median first and treats this as context.
        bars.append(
            f'<line class="chart-whisker" x1="{cx:.1f}" y1="{y_lo:.1f}" x2="{cx:.1f}" y2="{y_hi:.1f}" '
            f'stroke="var(--text-muted)" stroke-width="1.5" stroke-linecap="round"/>'
        )
        for cap_y in (y_lo, y_hi):
            bars.append(
                f'<line class="chart-whisker-cap" x1="{cx - cap_half:.1f}" y1="{cap_y:.1f}" '
                f'x2="{cx + cap_half:.1f}" y2="{cap_y:.1f}" stroke="var(--text-muted)" stroke-width="1.5" '
                f'stroke-linecap="round"/>'
            )
        bars.append(
            f'<rect class="chart-box" data-uid="{uid}" x="{x:.1f}" y="{y_q3:.1f}" '
            f'width="{bar_width}" height="{max(1.0, y_q1 - y_q3):.1f}" rx="7" fill="{color}" '
            f'fill-opacity="0.22" stroke="{color}" stroke-width="1.5"/>'
        )
        bars.append(
            f'<line class="chart-median" data-uid="{uid}" x1="{x + 3:.1f}" y1="{y_med:.1f}" '
            f'x2="{x + bar_width - 3:.1f}" y2="{y_med:.1f}" stroke="{color}" stroke-width="3" '
            f'stroke-linecap="round"/>'
        )
        label_y = top_pad + chart_h + 12
        bars.append(
            f'<text data-uid="{uid}" x="{cx:.1f}" y="{label_y}" class="chart-label" '
            f'transform="rotate(-60 {cx:.1f} {label_y})">{html_escape(display_names[uid])}</text>'
        )
        bars.append('</g>')

    return (
        f'<svg id="score-chart{id_suffix}" viewBox="0 0 {width} {height}" width="{width}" height="{height}" '
        f'xmlns="http://www.w3.org/2000/svg">' + "".join(axis) + "".join(bars) + "</svg>"
    )


def render_index(seasons, active_uids=frozenset()):
    season_numbers = sorted(seasons.keys())
    season_stats, display_names, totals, war_counts, averages, win_rate, tokens, buffs, maps_ = compute_season_averages(seasons)
    all_wars_flat = [w for wars_in_season in seasons.values() for w in wars_in_season]
    score_display_names, score_distributions = compute_score_distributions(all_wars_flat)
    agg_events, agg_display_names = aggregate_relative_battle_events(all_wars_flat)
    agg_milestones = aggregate_ms_milestones(all_wars_flat)

    body = f'<div id="table-wrap">{render_season_average_table(season_numbers, season_stats, display_names, averages, active_uids)}</div>' + BAREME_EXPLAIN
    body += '<h2>Scores</h2>'
    body += render_average_chart(display_names, averages, win_rate, tokens, buffs, maps_, score_display_names, score_distributions, active_uids, scope="global")
    body += render_chronologie_section(agg_events, agg_milestones, agg_display_names, relative=True, n_wars=_n_event_wars(all_wars_flat))

    # Guild name sits where the breadcrumb back-link would on other pages --
    # same visual format (color/size), just not a link and with no arrow,
    # since index has nothing to navigate back to.
    guild_label = guild_crumb()

    html = render_page(
        title="War", asset_prefix="", body=body, back_link=guild_label,
        title_class="hero-title", header_extra="", header_action="", v=ASSETS_VERSION,
    )
    with open(os.path.join(DOCS_DIR, "war.html"), "w", encoding="utf-8") as f:
        f.write(html)


def render_home(all_wars, seasons):
    """docs/index.html, the page the logo leads to: the guild's name over a wallpaper and one big card per section."""
    n_members = len(rosters_mod.load_rosters())
    raid_seasons = NAV_SEASONS["raid"]
    cards = [
        ("raid.html", "Raid", f"{len(raid_seasons)} saisons, de S{min(raid_seasons)} à S{max(raid_seasons)}" if raid_seasons else "Dégâts par attaque, bosses et primes",
         "Classement par saison, et les meilleurs sur chaque boss"),
        ("war.html", "War", f"{len(seasons)} saisons, {len(all_wars)} guerres",
         "Classement général, stratégie, défenses et chaque guerre"),
        ("joueurs.html", "Joueurs", f"{n_members} membres", "Rosters, metas du raid, badges et médailles"),
    ]
    body = '<div class="home-cards">' + "".join(
        f'<a class="home-card" href="{href}"><h2>{title}</h2><b>{html_escape(stat)}</b><p>{html_escape(text)}</p>'
        f'<span class="home-go">{ARROW_RIGHT}</span></a>'
        for href, title, stat, text in cards
    ) + "</div>"
    html = render_page(
        nav_active="home", title=OUR_GUILD_LABEL, asset_prefix="", body=body, back_link="", title_class="hero-title",
        header_extra="", header_action="", v=ASSETS_VERSION,
    )
    with open(os.path.join(DOCS_DIR, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)


def render_strategy_index(all_wars):
    """docs/strategie.html: "Contre les meilleurs" -- the combined opponents' map, both sides, with the attacks under each map."""
    opp_html, opp_events, opp_players = render_opponent_map(all_wars)
    body = opp_html + _defense_modal_html(opp_events, opp_players, "")
    html = render_page(
        nav_active="strategy", page_kind="strategy", title="Stratégie", asset_prefix="", body=body, back_link=back_link_html("war.html", "War"),
        title_class="hero-title", header_extra="", header_action="", v=ASSETS_VERSION, bg="deathguard-plague",
    )
    with open(os.path.join(DOCS_DIR, "strategie.html"), "w", encoding="utf-8") as f:
        f.write(html)


def render_defenses_page(all_wars):
    """docs/defenses.html (War > Défenses): for every map, the best defensive teams seen over all captured wars."""
    by_map_html, by_map_events, by_map_players = render_defense_by_map(all_wars)
    body = by_map_html.replace("<h2>Meilleures défenses par map</h2>", "", 1) + _defense_modal_html(by_map_events, by_map_players, "")
    html = render_page(
        nav_active="defenses", page_kind="strategy", title="Défenses", asset_prefix="", body=body,
        back_link=back_link_html("war.html", "War"), title_class="hero-title", header_extra="", header_action="",
        v=ASSETS_VERSION, bg="deathguard-plague",
    )
    with open(os.path.join(DOCS_DIR, "defenses.html"), "w", encoding="utf-8") as f:
        f.write(html)


def player_background(war, raid):
    """Backdrop of a player's page: the podium of the guild war ranking gets the War pages' picture (1st) or the Stratégie /
    Défenses one (2nd, 3rd), the raid podium the Raid pages' picture (1st) or the Boss pages' one (2nd, 3rd); everybody else the
    default Joueurs picture. War takes priority."""
    w, r = (war or {}).get("rank"), (raid or {}).get("rank")
    if w == 1:
        return "war-1"
    if w in (2, 3):
        return "war-podium"
    if r == 1:
        return "raid-1"
    if r in (2, 3):
        return "raid-podium"
    return ""


def compute_medals(seasons):
    """uid -> the data behind the medals (see medals.py): median battle score, reliability and raid boss podiums."""
    all_wars_flat = [w for ws in seasons.values() for w in ws]
    _, scores = compute_score_distributions(all_wars_flat)
    win_rate = compute_season_averages(seasons)[5]
    members = {r["uid"] for r in rosters_mod.load_rosters()}
    return medals_mod.compute(scores, win_rate, members)


def compute_war_rank(seasons, active_uids):
    """uid -> {rank, of, avg, wars} for the current members (players of the latest war), ranked by their overall average
    points per war: the same order as the general ranking table on the index page."""
    _, display_names, _, war_counts, averages, *_ = compute_season_averages(seasons)
    members = sorted((u for u in averages if u in active_uids), key=lambda u: (-averages[u], display_names.get(u, "").lower()))
    played = defaultdict(set)  # uid -> seasons in which they fought for our guild
    for season, ws in seasons.items():
        for w in ws:
            our = find_team_idx(w["result"]["guilds"], OUR_GUILD)
            for uid, ps in w["result"]["player_stats"].items():
                if ps["team"] == our:
                    played[uid].add(season)
    return {u: {"rank": i, "of": len(members), "avg": round_pts(averages[u]), "wars": war_counts.get(u, 0), "seasons": len(played[u])}
            for i, u in enumerate(members, 1)}


def _fmt_rel(x):
    """Relative damage as a signed percentage with a decimal comma: 0.123 -> "+12,3 %"."""
    return f"{100 * x:+.1f} %".replace(".", ",")


def raid_names(all_wars, rosters):
    """uid -> display name: members by their current in-game name, former members by their last name seen in a war."""
    names = {}
    for w in all_wars:
        for uid, p in w["result"].get("players", {}).items():
            if p.get("displayName"):
                names[uid] = p["displayName"]
    for r in rosters:
        names[r["uid"]] = r["name"]
    return names


RAID_EXPLAIN = '<p class="raid-explain">Dégâts par attaque relativement à la moyenne de la guilde sur la saison, sans finishs, à partir de Legendary 4</p>'
BOSS_EXPLAIN = RAID_EXPLAIN  # same line on the Boss landing page; the individual boss pages have no text


def render_raid_pages(all_wars):
    """docs/raid.html (members x seasons, relative damage; column heads link to the seasons) and docs/raid/<season>.html (everybody
    who played the season x bosses, relative damage per boss)."""
    rosters = rosters_mod.load_rosters()
    if not rosters or not medals_mod.season_files():
        return
    members = {r["uid"]: r for r in rosters}
    names = raid_names(all_wars, rosters)
    seasons = medals_mod.raid_seasons()
    ranking = medals_mod.raid_ranking(set(members))
    slots = {slot["key"]: slot for slot in medals_mod.slots()}
    os.makedirs(os.path.join(DOCS_DIR, "raid"), exist_ok=True)

    # --- global page: members ordered by their average season rank, one column per season (latest first) -------------------
    season_order = sorted(seasons, reverse=True)
    bounds = {}
    for n in season_order:
        vals = [p["score"] for u, p in seasons[n]["players"].items() if u in members]
        bounds[n] = (min(vals), max(vals)) if vals else (0, 0)
    head = ["<th>#</th>", "<th>Joueur</th>", "<th>Rang moyen</th>", "<th>Saisons</th>"] + [f'<th data-href="raid/{n}.html">S{n}</th>' for n in season_order]
    rows = []
    for uid, info in sorted(ranking.items(), key=lambda kv: kv[1]["rank"]):
        cells = [f'<td>{info["rank"]}</td>',
                 f'<td><a class="chip player-btn" href="joueurs/{rosters_mod.player_slug(uid)}.html">{html_escape(names[uid])}</a></td>',
                 f'<td data-sort="{info["avg_season_rank"]}">{round(info["avg_season_rank"])}</td>', f'<td>{info["seasons"]}</td>']
        for n in season_order:
            p = seasons[n]["players"].get(uid)
            if p is None:
                cells.append("<td>-</td>")
            else:
                lo, hi = bounds[n]
                cells.append(f'<td{value_to_bg(p["score"], lo, hi)} title="Rang {p["rank"]} sur {seasons[n]["field"]} · {p["n"]} attaques">{_fmt_rel(p["score"])}</td>')
        rows.append(f'<tr{player_row_attrs(uid, "")}>' + "".join(cells) + "</tr>")
    body = (f'<div class="table-scroll"><table class="sortable raid-table"><thead><tr>{"".join(head)}</tr></thead>'
            f'<tbody>{"".join(rows)}</tbody></table></div>' + RAID_EXPLAIN)
    html = render_page(nav_active="raid", title="Raid", asset_prefix="", body=body, back_link=guild_crumb(), title_class="hero-title",
                       header_extra="", header_action="", v=ASSETS_VERSION)
    with open(os.path.join(DOCS_DIR, "raid.html"), "w", encoding="utf-8") as f:
        f.write(html)

    # --- one page per season: everybody who played, one column per boss / sub-boss ---------------------------------------
    for n in season_order:
        data = seasons[n]
        keys = data["keys"]
        bb = {k: (lambda v: (min(v), max(v)) if v else (0, 0))([p["by_key"][k][0] for p in data["players"].values() if k in p["by_key"]]) for k in keys}
        s_lo = min((p["score"] for p in data["players"].values()), default=0)
        s_hi = max((p["score"] for p in data["players"].values()), default=0)
        head = ["<th>#</th>", "<th>Joueur</th>", "<th>Saison</th>"]
        for k in keys:
            slot = slots[k]
            label = slot["name"].split(" (")[0]
            head.append(f'<th data-href="../boss/{k}.html" title="{html_escape(slot["name"])}"><img class="rb-ico" src="../assets/{slot["art"]}" alt=""><span>{html_escape(label)}</span></th>')
        rows = []
        for uid, p in sorted(data["players"].items(), key=lambda kv: kv[1]["rank"]):
            name = html_escape(names.get(uid, "Ancien membre"))
            who = (f'<a class="chip player-btn" href="../joueurs/{rosters_mod.player_slug(uid)}.html">{name}</a>' if uid in members
                   else f'<span class="ex-member" title="Ne fait plus partie de la guilde">{name}</span>')
            cells = [f'<td>{p["rank"]}</td>', f"<td>{who}</td>",
                     f'<td{value_to_bg(p["score"], s_lo, s_hi)} title="{p["n"]} attaques">{_fmt_rel(p["score"])}</td>']
            for k in keys:
                v = p["by_key"].get(k)
                if v is None:
                    cells.append("<td>-</td>")
                else:
                    lo, hi = bb[k]
                    cells.append(f'<td{value_to_bg(v[0], lo, hi)} title="{v[1]} attaque{"s" if v[1] > 1 else ""}">{_fmt_rel(v[0])}</td>')
            rows.append(f'<tr{player_row_attrs(uid, "../")}>' + "".join(cells) + "</tr>")
        body = (f'<div class="table-scroll"><table class="sortable raid-table"><thead><tr>{"".join(head)}</tr></thead>'
                f'<tbody>{"".join(rows)}</tbody></table></div>' + RAID_EXPLAIN)
        html = render_page(nav_active="raid", nav_sub=f"raid-{n}", title=f"Raid · saison {n}", asset_prefix="../", body=body,
                           back_link=back_link_html("../raid.html", "Raid"), title_class="", header_extra="", header_action="", v=ASSETS_VERSION)
        with open(os.path.join(DOCS_DIR, "raid", f"{n}.html"), "w", encoding="utf-8") as f:
            f.write(html)
    print(f"Generated raid.html + {len(season_order)} season page(s)")


def render_boss_pages(all_wars):
    """docs/boss.html (a podium card per boss / sub-boss, each opening that boss's page) and docs/boss/<key>.html (the members
    ranked on their all-time relative damage against that boss, one column per season it was fought)."""
    rosters = rosters_mod.load_rosters()
    if not rosters or not medals_mod.season_files():
        return
    members = {r["uid"]: r for r in rosters}
    names = raid_names(all_wars, rosters)
    seasons = medals_mod.raid_seasons()
    relative = medals_mod.boss_relative(set(members))
    slots = medals_mod.slots()
    os.makedirs(os.path.join(DOCS_DIR, "boss"), exist_ok=True)

    # --- landing: the podium card of every boss (each card opens the boss page) ---------------------------------------------------------------------------
    cards = ""  # one line per boss: the boss, then its primes (sub-bosses) on the same line
    for slot in slots:
        if " (" not in slot["name"]:
            cards += ("</div>" if cards else "") + '<div class="boss-group">'
        field = sorted(relative.get(slot["key"], {}).items(), key=lambda kv: -kv[1][0])[:3]
        rows = "".join(
            f'<li><span class="bp-rank">{i}</span><span class="bp-name">{html_escape(names[u])}</span><span class="bp-val">{_fmt_rel(v[0])}</span></li>'
            for i, (u, v) in enumerate(field, 1)
        ) or '<li class="bp-none">Pas encore d\'attaque</li>'
        cards += (f'<a class="boss-card" href="boss/{slot["key"]}.html"><span class="boss-card-head"><img src="assets/{slot["art"]}" alt="">'
                  f'<b>{html_escape(slot["name"].split(" (")[0])}</b></span><ol>{rows}</ol></a>')  # a prime sits on its boss's line: no need to name the boss
    body = f'<div class="boss-cards">{cards}</div></div>' + BOSS_EXPLAIN
    html = render_page(nav_active="boss", title="Boss", asset_prefix="", body=body, back_link=back_link_html("raid.html", "Raid"), title_class="hero-title",
                       header_extra="", header_action="", v=ASSETS_VERSION)
    with open(os.path.join(DOCS_DIR, "boss.html"), "w", encoding="utf-8") as f:
        f.write(html)

    # --- one page per boss: members ranked all-time, one column per season the boss was fought ---------------------------------
    for slot in slots:
        key = slot["key"]
        played = sorted((n for n, d in seasons.items() if key in d["keys"]), reverse=True)
        field = sorted(relative.get(key, {}).items(), key=lambda kv: -kv[1][0])
        bounds = {}
        for n in played:
            vals = [seasons[n]["players"][u]["by_key"][key][0] for u in members if u in seasons[n]["players"] and key in seasons[n]["players"][u]["by_key"]]
            bounds[n] = (min(vals), max(vals)) if vals else (0, 0)
        head = ["<th>#</th>", "<th>Joueur</th>", "<th>Relatif</th>", "<th>Attaques</th>"] + [f'<th data-href="../raid/{n}.html">S{n}</th>' for n in played]
        values = [v[0] for _, v in field]
        lo, hi = (min(values), max(values)) if values else (0, 0)
        rows = []
        for uid, (rel, n_att) in field:
            rank = 1 + sum(1 for _, v in field if v[0] > rel)
            cells = [f"<td>{rank}</td>",
                     f'<td><a class="chip player-btn" href="../joueurs/{rosters_mod.player_slug(uid)}.html">{html_escape(names[uid])}</a></td>',
                     f'<td{value_to_bg(rel, lo, hi)}>{_fmt_rel(rel)}</td>', f"<td>{n_att}</td>"]
            for n in played:
                v = seasons[n]["players"].get(uid, {}).get("by_key", {}).get(key)
                if v is None:
                    cells.append("<td>-</td>")
                else:
                    blo, bhi = bounds[n]
                    cells.append(f'<td{value_to_bg(v[0], blo, bhi)} title="{v[1]} attaque{"s" if v[1] > 1 else ""}">{_fmt_rel(v[0])}</td>')
            rows.append(f'<tr{player_row_attrs(uid, "../")}>' + "".join(cells) + "</tr>")
        table = (f'<div class="table-scroll"><table class="sortable raid-table"><thead><tr>{"".join(head)}</tr></thead>'
                 f'<tbody>{"".join(rows)}</tbody></table></div>') if rows else '<p class="raid-explain">Aucun membre n\'a encore attaqué ce boss.</p>'
        body = table
        html = render_page(nav_active="boss", title=slot["name"], asset_prefix="../", body=body,
                           back_link=back_link_html("../boss.html", "Boss"), title_class="", header_extra="", header_action="", v=ASSETS_VERSION,
                           title_icon=f'<img class="title-ico" src="../assets/{slot["art"]}" alt="">')
        with open(os.path.join(DOCS_DIR, "boss", f"{key}.html"), "w", encoding="utf-8") as f:
            f.write(html)
    print(f"Generated boss.html + {len(slots)} boss page(s)")


def render_players_pages(war_rank=None, raid_rank=None, medals=None):
    """docs/joueurs.html (member list) + docs/joueurs/<id>.html (one roster each),
    from the API payloads in data/rosters/ (see fetch_rosters.py). Skipped when there are none."""
    rosters = rosters_mod.load_rosters()
    if not rosters:
        return
    os.makedirs(os.path.join(DOCS_DIR, "joueurs"), exist_ok=True)
    roles = medals_mod.guild_roles()
    html = render_page(
        nav_active="players", title="Joueurs", asset_prefix="", body=rosters_mod.render_players_index_body(rosters),
        back_link=guild_crumb(), title_class="hero-title", header_extra="", header_action="", v=ASSETS_VERSION,
    )
    with open(os.path.join(DOCS_DIR, "joueurs.html"), "w", encoding="utf-8") as f:
        f.write(html)
    for r in rosters:
        html = render_page(
            nav_active="players", title=r["name"], asset_prefix="../", body=rosters_mod.render_player_body(r, "../", war=(war_rank or {}).get(r["uid"]), medals=(medals or {}).get(r["uid"]),
                                                raid=(raid_rank or {}).get(r["uid"]), raid_known=bool(raid_rank)),
            back_link=back_link_html("../joueurs.html", "Joueurs"), title_class="", header_extra="",
            header_action=(f'<span class="role-inline">· {roles[r["uid"]]}</span>' if r["uid"] in roles else ""), v=ASSETS_VERSION,
            bg=player_background((war_rank or {}).get(r["uid"]), (raid_rank or {}).get(r["uid"])),
        )
        with open(os.path.join(DOCS_DIR, "joueurs", rosters_mod.player_slug(r["uid"]) + ".html"), "w", encoding="utf-8") as f:
            f.write(html)
    print(f"Generated {len(rosters)} player page(s) + joueurs.html")


def load_wars():
    """Every captured and legacy war with its computed ranking, in chronological order."""
    all_wars = []
    for slug, json_path, maps, extra in discover_wars():
        result = compute_ranking(json_path, maps, extra)
        result["boards"] = war_boards(maps)
        result["layouts"] = war_layouts(maps)
        season = int(maps.get("season") or 0)
        war_number = int(maps.get("war_number") or 0)
        outcome = maps.get("result")
        all_wars.append({"slug": slug, "result": result, "season": season, "war_number": war_number, "outcome": outcome})

    for slug, legacy_path in discover_legacy_wars():
        legacy_data = load_legacy(legacy_path)
        result = compute_legacy_ranking(legacy_path)
        season = int(legacy_data.get("season") or 0)
        war_number = int(legacy_data.get("war_number") or 0)
        result["war_start"] = war_number  # no timestamp available; order within season by war_number
        outcome = legacy_data.get("result")
        all_wars.append({"slug": slug, "result": result, "season": season, "war_number": war_number, "outcome": outcome})

    all_wars.sort(key=lambda w: (w["season"], w["result"]["war_start"]))
    return all_wars


def main():
    os.makedirs(os.path.join(DOCS_DIR, "wars"), exist_ok=True)
    os.makedirs(os.path.join(DOCS_DIR, "seasons"), exist_ok=True)
    os.makedirs(os.path.join(DOCS_DIR, "assets"), exist_ok=True)

    all_wars = load_wars()
    PLAYER_SLUGS.update({r["uid"]: rosters_mod.player_slug(r["uid"]) for r in rosters_mod.load_rosters()})

    active_uids = frozenset()
    if all_wars:
        last_war = all_wars[-1]
        our_idx = find_team_idx(last_war["result"]["guilds"], OUR_GUILD)
        active_uids = frozenset(
            uid for uid, ps in last_war["result"]["player_stats"].items() if ps["team"] == our_idx
        )

    seasons = defaultdict(list)
    for w in all_wars:
        seasons[w["season"]].append(w)
    NAV_SEASONS["war"] = sorted(seasons, reverse=True)
    NAV_SEASONS["raid"] = sorted(medals_mod.raid_seasons(), reverse=True) if medals_mod.season_files() else []

    for w in all_wars:
        render_war_page(w["slug"], w["result"], w["season"], w.get("outcome"), active_uids, w.get("war_number"))

    for season, season_wars in seasons.items():
        render_season_page(season, season_wars, active_uids)

    render_index(seasons, active_uids)
    render_home(all_wars, seasons)
    render_strategy_index(all_wars)
    render_defenses_page(all_wars)
    members = {r["uid"] for r in rosters_mod.load_rosters()}
    render_players_pages(compute_war_rank(seasons, active_uids), raid_rank=medals_mod.raid_ranking(members), medals=compute_medals(seasons))
    render_raid_pages(all_wars)
    render_boss_pages(all_wars)
    for w in all_wars:
        render_war_strategy_page(w["slug"], w["result"], w["season"])
    print(f"Generated {len(all_wars)} war page(s), {len(seasons)} season page(s) + index.html into {DOCS_DIR}")


if __name__ == "__main__":
    main()
