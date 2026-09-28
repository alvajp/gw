"""
Read every war in data/wars/ (a <slug>.json + <slug>.maps.yaml pair),
compute the ranking for each, and render the static site into docs/.

Usage: python3 scripts/generate_site.py
"""
import colorsys
import math
import os
import re
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(__file__))
from ranking import compute_ranking
from maps_yaml import load_maps
from legacy_ranking import compute_legacy_ranking, load_legacy

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

BAREME_HTML = """<h2 id="bareme">Barème de points</h2>
<ul>
  <li><strong>Palier de score par bataille</strong> :
    <ul>
      <li>1600 &rarr; 10 pts</li>
      <li>1400 &rarr; 8 pts</li>
      <li>1200 / 1050 &rarr; 7 pts</li>
      <li>1100 / 850 &rarr; 6 pts</li>
      <li>650 / 450 / 250 &rarr; 5 pts</li>
      <li>Fail / Miss &rarr; 0 pt</li>
    </ul>
  </li>
  <li><strong>Buffs de zone</strong> :
    <ul>
      <li>Medicae Station (MS) = +2 pts</li>
      <li>Autre buffs (AP/AA/AR/FP/LP) = +0.5 pt</li>
    </ul>
  </li>
  <li><strong>Bonus de map</strong> :
    <ul>
      <li>+2 pts pour 3 ponts, Pont, Divisée</li>
      <li>+0.5 pt pour 5 pilliers, Abricot, Lacs</li>
    </ul>
  </li>
</ul>"""


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


GRADIENT_LOW = (154, 164, 255)  # #9aa4ff, matches the chart's inactive bar color
GRADIENT_HIGH = (34, 197, 94)  # #22c55e, matches the chart's active/win bar color


def _rgb_to_hls(rgb):
    r, g, b = (c / 255.0 for c in rgb)
    return colorsys.rgb_to_hls(r, g, b)


GRADIENT_LOW_HLS = _rgb_to_hls(GRADIENT_LOW)
GRADIENT_HIGH_HLS = _rgb_to_hls(GRADIENT_HIGH)


def value_to_bg(val, lo, hi):
    """Map val within [lo, hi] to a blue->green background-color, for the
    lowest->highest gradient on a table cell. Interpolates in HLS (hue along
    its shortest path) rather than straight RGB: lerping RGB directly between
    a blue and a green washes out into a grayish, low-saturation teal in the
    middle, whereas HLS keeps the hue/saturation vivid all the way through.
    Returns "" (no styling) when every row shares the same value, since
    there's nothing to gradient."""
    if hi <= lo:
        return ""
    t = max(0.0, min(1.0, (val - lo) / (hi - lo)))
    h1, l1, s1 = GRADIENT_LOW_HLS
    h2, l2, s2 = GRADIENT_HIGH_HLS
    dh = h2 - h1
    if dh > 0.5:
        dh -= 1.0
    elif dh < -0.5:
        dh += 1.0
    h = (h1 + dh * t) % 1.0
    l = l1 + (l2 - l1) * t
    s = s1 + (s2 - s1) * t
    r, g, b = (round(c * 255) for c in colorsys.hls_to_rgb(h, l, s))
    return f' style="background-color: rgb({r}, {g}, {b}); color: #000"'


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
        if not fname.endswith(".json") or fname.endswith(".legacy.json"):
            continue
        slug = fname[:-len(".json")]
        json_path = os.path.join(WARS_DIR, fname)
        maps_path = os.path.join(WARS_DIR, slug + ".maps.yaml")
        maps = load_maps(maps_path) if os.path.exists(maps_path) else {"hard": {}, "easy": {}}
        wars.append((slug, json_path, maps))
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


def render_table(rows, hard_cols, easy_cols):
    headers = ["Joueur"] + [label for _, label in COLS]
    headers += [name for _, name in hard_cols] + [name for _, name in easy_cols]
    thead = "".join(f"<th>{html_escape(h)}</th>" for h in headers)

    # First pass: compute the rounded pts/réussites/buffs/map values for every
    # row so the gradient's low/high bounds are known before rendering cells.
    computed = []
    for pname, ps in rows:
        reussites, buffs_pts, map_pts = compute_pts_breakdown(ps, hard_cols, easy_cols)
        reussites_i, buffs_pts_i, map_pts_i = round_breakdown(ps["pts"], [reussites, buffs_pts, map_pts])
        breakdown = {
            "pts": round_pts(ps["pts"]),
            "reussites": reussites_i,
            "buffs_pts": buffs_pts_i,
            "map_pts": map_pts_i,
        }
        computed.append((pname, ps, breakdown))

    bounds = {
        key: (min(b[key] for _, _, b in computed), max(b[key] for _, _, b in computed))
        for key in GRADIENT_COLS
    } if computed else {}

    body_rows = []
    for pname, ps, breakdown in computed:
        cells = [f"<td>{html_escape(pname)}</td>"]
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
        body_rows.append("<tr>" + "".join(cells) + "</tr>")

    return f"""<div class="table-scroll"><table class="sortable">
  <thead><tr>{thead}</tr></thead>
  <tbody>{''.join(body_rows)}</tbody>
</table></div>"""


def render_frise(items, transition=False):
    """items: list of (label, href, outcome, above). outcome is "win"/"loss"/
    None and colors the dot green/red accordingly (None keeps the neutral
    color — used for items that aren't a single war, e.g. the per-season
    items on the homepage). above is an optional short string (e.g. the war
    number within its season) rendered above the dot; pass None to omit it.
    transition=True marks links as animated client-side navigation targets
    (only valid between page shapes that share the frise+chart layout, i.e.
    index<->season)."""
    attr = ' data-transition="true"' if transition else ""
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
            f'<a class="frise-item" href="{href}"{attr}>{above_html}<span class="{dot_class}"></span>'
            f'<span class="frise-label">{html_escape(label)}</span></a>'
        )
    return (
        '<div class="frise-wrap"><div class="frise-scroll"><div class="frise" id="frise">'
        + "".join(lis)
        + "</div></div></div>"
    )


def render_result_badge(outcome):
    if outcome not in ("win", "loss"):
        return ""
    cls = "result-badge is-win" if outcome == "win" else "result-badge is-loss"
    label = "Victoire" if outcome == "win" else "D&eacute;faite"
    return f'<p class="{cls}">{label}</p>'


def render_history_table(wars_subset):
    """wars_subset: list of war dicts (with 'slug' and 'result'), already in
    chronological order. Renders a Joueur x war-columns table with a Total
    column, restricted to players who were on OUR_GUILD's team in that war."""
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

    thead_cells = ["<th>Joueur</th>"]
    for w in wars_subset:
        thead_cells.append(f'<th>{html_escape(header_labels[w["slug"]])}</th>')
    thead_cells.append("<th>Total</th>")
    thead_cells.append("<th>Moyenne</th>")
    thead = "".join(thead_cells)

    totals = {uid: sum(per_war.values()) for uid, per_war in history.items()}
    averages = {uid: totals[uid] / len(history[uid]) for uid in history}
    rounded_avg = {uid: round_pts(v) for uid, v in averages.items()}
    avg_lo, avg_hi = (min(rounded_avg.values()), max(rounded_avg.values())) if rounded_avg else (0, 0)
    body_rows = []
    for uid in sorted(history, key=lambda u: -totals[u]):
        per_war = history[uid]
        cells = [f"<td>{html_escape(display_names[uid])}</td>"]
        for w in wars_subset:
            v = per_war.get(w["slug"])
            cells.append(f"<td>{round_pts(v)}</td>" if v is not None else "<td>-</td>")
        cells.append(f"<td>{round_pts(totals[uid])}</td>")
        cells.append(f"<td{value_to_bg(rounded_avg[uid], avg_lo, avg_hi)}>{rounded_avg[uid]}</td>")
        body_rows.append("<tr>" + "".join(cells) + "</tr>")

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
<link rel="stylesheet" href="{asset_prefix}assets/style.css?v={v}">
</head>
<body>
<header><div class="breadcrumb" id="breadcrumb">{back_link}</div><h1 id="page-title" class="{title_class}">{title}</h1><div id="header-extra">{header_extra}</div></header>
<main>
{body}
</main>
<script src="{asset_prefix}assets/sort-table.js?v={v}"></script>
<script src="{asset_prefix}assets/chart-toggle.js?v={v}"></script>
<script src="{asset_prefix}assets/active-toggle.js?v={v}"></script>
<script src="{asset_prefix}assets/page-transition.js?v={v}"></script>
</body>
</html>"""


def back_link_html(href, label, transition=False):
    if not href:
        return ""
    attr = ' data-transition="true"' if transition else ""
    return f'<a href="{href}"{attr}>&larr; {html_escape(label)}</a>'


def guild_rows(result, team_idx):
    players = result["players"]
    player_stats = result["player_stats"]
    rows = [
        (players.get(uid, {}).get("displayName", uid), ps)
        for uid, ps in player_stats.items() if ps["team"] == team_idx
    ]
    rows.sort(key=lambda x: -x[1]["pts"])
    return rows


def render_war_page(slug, result, season, outcome=None):
    guilds = result["guilds"]
    hard_cols = result["hard_cols"]
    easy_cols = result["easy_cols"]

    our_idx = find_team_idx(guilds, OUR_GUILD)
    our_rows = guild_rows(result, our_idx)
    body = render_result_badge(outcome)
    body += render_table(our_rows, hard_cols, easy_cols)

    other_tables = []
    for team_idx, g in sorted(guilds.items()):
        if team_idx == our_idx:
            continue
        rows = guild_rows(result, team_idx)
        other_tables.append(f"<h3>{html_escape(g['name'])}</h3>" + render_table(rows, hard_cols, easy_cols))

    if other_tables:
        body += "<h2>Adversaires</h2>" + "".join(other_tables)

    title = ", ".join(opponent_names(result, our_idx)) or slug
    back_link = back_link_html(f"../seasons/{season}.html", f"Saison {season}", transition=True)
    html = PAGE_TEMPLATE.format(title=title, asset_prefix="../", body=body, back_link=back_link, title_class="", header_extra="", v=ASSETS_VERSION)
    out_path = os.path.join(DOCS_DIR, "wars", slug + ".html")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)


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

    body = render_frise(frise_items, transition=True)
    body += render_average_chart(display_names, averages, win_rate, tokens, buffs, maps_, score_display_names, score_distributions, active_uids, scope="season")
    body += f'<div id="table-wrap">{render_history_table(wars_in_season)}</div>'
    body += '<div id="bareme-wrap"></div>'

    back_link = back_link_html("../index.html", "Classement général", transition=True)
    html = PAGE_TEMPLATE.format(title=f"Saison {season}", asset_prefix="../", body=body, back_link=back_link, title_class="", header_extra="", v=ASSETS_VERSION)
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
    thead_cells = ["<th>Joueur</th>"]
    for season in season_numbers:
        thead_cells.append(f"<th>Saison {season}</th>")
    thead_cells.append("<th>Moyenne</th>")
    thead = "".join(thead_cells)

    rounded_avg = {uid: round_pts(averages[uid]) for uid in season_stats}
    avg_lo, avg_hi = (min(rounded_avg.values()), max(rounded_avg.values())) if rounded_avg else (0, 0)
    body_rows = []
    for uid in sorted(season_stats, key=lambda u: -averages[u]):
        per_season = season_stats[uid]
        cells = [f"<td>{html_escape(display_names[uid])}</td>"]
        for season in season_numbers:
            entry = per_season.get(season)
            cells.append(f"<td>{round_pts(entry[0] / entry[1])}</td>" if entry else "<td>-</td>")
        cells.append(f"<td{value_to_bg(rounded_avg[uid], avg_lo, avg_hi)}>{rounded_avg[uid]}</td>")
        is_active = "true" if uid in active_uids else "false"
        body_rows.append(f'<tr data-uid="{uid}" data-active="{is_active}">' + "".join(cells) + "</tr>")

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
        fill = "#22c55e" if uid in active_uids else "#9aa4ff"
        bars.append(
            f'<rect class="chart-bar" data-uid="{uid}" x="{x:.1f}" y="{y:.1f}" '
            f'width="{bar_width}" height="{h:.1f}" rx="2" fill="{fill}"/>'
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
    active_uids=frozenset(), scope="global", filterable=False,
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

    The "scores" chart-scroll is always emitted, even when score_distributions
    is empty (e.g. a season made up entirely of legacy wars, see
    legacy_ranking.py) -- same reasoning as the old standalone
    #chart-wrap-scores section it replaces: keeping every page's chart-wrap
    with an identical set of (metric, filter) keys is what lets
    page-transition.js's keyed sync (see transitionChart) always find a
    match regardless of which two pages are involved in a client-side nav."""
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
    # everything else keeps its existing order.
    chip_keys = ["moyenne", "scores", "victoire", "tokens", "buffs", "maps"]
    chips = "".join(
        f'<button type="button" class="chip{" active" if key == "moyenne" else ""}" data-metric="{key}" data-legend="{html_escape(legends[key])}">{html_escape(labels[key])}</button>'
        for key in chip_keys
    )

    charts = []
    for key, values, fmt, ascending in metrics:
        style = "" if key == "moyenne" else ' style="display:none"'
        svg = render_metric_svg(key, display_names, values, active_uids, fmt, ascending=ascending)
        if filterable:
            # Pre-render an "active players only" variant alongside the full
            # one so the header's roster toggle (active-toggle.js) can just
            # show/hide the right static SVG, same static-content philosophy
            # as the metric chips themselves -- no client-side layout math
            # to re-flow bars after removing some.
            active_values = {uid: v for uid, v in values.items() if uid in active_uids}
            active_svg = render_metric_svg(
                key, display_names, active_values, active_uids, fmt, ascending=ascending, id_suffix="-active"
            )
            charts.append(f'<div class="chart-scroll" data-metric="{key}" data-active-filter="all"{style}>{svg}</div>')
            charts.append(f'<div class="chart-scroll" data-metric="{key}" data-active-filter="active" style="display:none">{active_svg}</div>')
        else:
            charts.append(f'<div class="chart-scroll" data-metric="{key}"{style}>{svg}</div>')

    scores_svg = render_boxplot_svg(score_display_names, score_distributions, active_uids)
    if filterable:
        active_score_distributions = {uid: vals for uid, vals in score_distributions.items() if uid in active_uids}
        active_scores_svg = render_boxplot_svg(
            score_display_names, active_score_distributions, active_uids, id_suffix="-active"
        )
        charts.append(f'<div class="chart-scroll" data-metric="scores" data-active-filter="all" style="display:none">{scores_svg}</div>')
        charts.append(f'<div class="chart-scroll" data-metric="scores" data-active-filter="active" style="display:none">{active_scores_svg}</div>')
    else:
        charts.append(f'<div class="chart-scroll" data-metric="scores" style="display:none">{scores_svg}</div>')

    wrap_attr = ' data-active-filter="all"' if filterable else ""
    return (
        f'<div id="chart-wrap" class="chart-wrap"{wrap_attr}><div class="chips">{chips}</div>'
        f'<p class="chart-legend">{html_escape(legends["moyenne"])}</p>'
        f'{"".join(charts)}</div>'
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
            f'stroke="#2a2d38" stroke-width="1"/>'
        )
        axis.append(f'<text x="{left_pad - 6:.1f}" y="{ty + 3:.1f}" class="chart-axis-label">{tick}</text>')

    bars = []
    for i, uid in enumerate(order):
        vals = distributions[uid]
        q1, med, q3 = compute_quartiles(vals)
        lo, hi = min(vals), max(vals)
        x = left_pad + gap + i * (bar_width + gap)
        cx = x + bar_width / 2
        color = "#22c55e" if uid in active_uids else "#9aa4ff"
        y_lo, y_hi = y_of(lo), y_of(hi)
        y_q1, y_q3, y_med = y_of(q1), y_of(q3), y_of(med)
        cap_half = bar_width * 0.22

        bars.append(f'<g class="chart-box-group" data-uid="{uid}" style="--accent:{color}">')
        # Whisker first (drawn behind the box): full min-max spread, muted so
        # the eye lands on the box/median first and treats this as context.
        bars.append(
            f'<line class="chart-whisker" x1="{cx:.1f}" y1="{y_lo:.1f}" x2="{cx:.1f}" y2="{y_hi:.1f}" '
            f'stroke="#4b5160" stroke-width="1.5" stroke-linecap="round"/>'
        )
        for cap_y in (y_lo, y_hi):
            bars.append(
                f'<line class="chart-whisker-cap" x1="{cx - cap_half:.1f}" y1="{cap_y:.1f}" '
                f'x2="{cx + cap_half:.1f}" y2="{cap_y:.1f}" stroke="#4b5160" stroke-width="1.5" '
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
    frise_items = [(f"Saison {s}", f"seasons/{s}.html", None, None) for s in season_numbers]
    season_stats, display_names, totals, war_counts, averages, win_rate, tokens, buffs, maps_ = compute_season_averages(seasons)
    all_wars_flat = [w for wars_in_season in seasons.values() for w in wars_in_season]
    score_display_names, score_distributions = compute_score_distributions(all_wars_flat)

    body = render_frise(frise_items, transition=True)
    body += render_average_chart(display_names, averages, win_rate, tokens, buffs, maps_, score_display_names, score_distributions, active_uids, scope="global", filterable=True)
    body += f'<div id="table-wrap">{render_season_average_table(season_numbers, season_stats, display_names, averages, active_uids)}</div>'
    body += f'<div id="bareme-wrap">{BAREME_HTML}</div>'

    # Header-level filter (not a .chips row filter like the chart's, since
    # it acts on both the table below and the chart above rather than being
    # itself a chart metric, and needs to live at the title's height on the
    # far right -- see #header-extra in style.css) toggling the roster down
    # to just players present in the most recently recorded war. Rendered as
    # an actual switch (track + sliding thumb), not a plain button, so it
    # reads as a toggle rather than a filter chip. Starts off (shows
    # everyone); active-toggle.js flips the label/state, hides
    # data-active="false" table rows, and swaps in the pre-rendered
    # "active players only" chart variant (data-active-filter="active").
    active_toggle = (
        '<button type="button" id="active-toggle" class="toggle" aria-pressed="false" '
        'data-label-off="Tous les joueurs" data-label-on="Joueurs actifs seulement">'
        '<span class="toggle-track"><span class="toggle-thumb"></span></span>'
        '<span class="toggle-label">Tous les joueurs</span>'
        "</button>"
    )

    # Guild name sits where the breadcrumb back-link would on other pages --
    # same visual format (color/size), just not a link and with no arrow,
    # since index has nothing to navigate back to.
    guild_label = f'<span class="breadcrumb-label">{html_escape(OUR_GUILD_LABEL)}</span>'

    html = PAGE_TEMPLATE.format(title="Classement général", asset_prefix="", body=body, back_link=guild_label, title_class="hero-title", header_extra=active_toggle, v=ASSETS_VERSION)
    with open(os.path.join(DOCS_DIR, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)


def main():
    os.makedirs(os.path.join(DOCS_DIR, "wars"), exist_ok=True)
    os.makedirs(os.path.join(DOCS_DIR, "seasons"), exist_ok=True)
    os.makedirs(os.path.join(DOCS_DIR, "assets"), exist_ok=True)

    all_wars = []
    for slug, json_path, maps in discover_wars():
        result = compute_ranking(json_path, maps)
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

    for w in all_wars:
        render_war_page(w["slug"], w["result"], w["season"], w.get("outcome"))

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
    for season, season_wars in seasons.items():
        render_season_page(season, season_wars, active_uids)

    render_index(seasons, active_uids)
    print(f"Generated {len(all_wars)} war page(s), {len(seasons)} season page(s) + index.html into {DOCS_DIR}")


if __name__ == "__main__":
    main()
