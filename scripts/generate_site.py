"""
Read every war in data/wars/ (a <slug>.json + <slug>.maps.yaml pair),
compute the ranking for each, and render the static site into docs/.

Usage: python3 scripts/generate_site.py
"""
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

OUR_GUILD = "Les Joyeux Psychopathes !"

COLS = [
    ("pts", "Points"), ("win", "Wins"), ("fail", "Fails"), ("miss", "Miss"), ("finish", "Finishes"),
    ("MS", "MS"), ("AP", "AP"), ("AA", "AA"), ("AR", "AR"), ("FP", "FP"), ("LP", "LP"),
    ("1600", "1600"), ("1400", "1400"), ("1200_1050", "1200(1050)"), ("1100_850", "1100(850)"), ("650-", "650-"),
    ("kills", "Kills"),
]

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


def render_table(rows, hard_cols, easy_cols):
    headers = ["Joueur"] + [label for _, label in COLS]
    headers += [name for _, name in hard_cols] + [name for _, name in easy_cols]
    thead = "".join(f"<th>{html_escape(h)}</th>" for h in headers)

    body_rows = []
    for pname, ps in rows:
        cells = [f"<td>{html_escape(pname)}</td>"]
        for key, _label in COLS:
            val = ps["pts"] if key == "pts" else ps[key]
            if key == "pts":
                val = round_pts(val)
            cells.append(f"<td>{val}</td>")
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
    """items: list of (label, href, is_win). is_win colors the dot green
    when the war is recorded as a win — pass False when the item isn't a
    single war (e.g. the per-season items on the homepage). transition=True
    marks links as animated client-side navigation targets (only valid
    between page shapes that share the frise+chart layout, i.e. index<->season)."""
    attr = ' data-transition="true"' if transition else ""
    lis = []
    for label, href, is_win in items:
        dot_class = "frise-dot frise-dot-win" if is_win else "frise-dot"
        lis.append(
            f'<a class="frise-item" href="{href}"{attr}><span class="{dot_class}"></span>'
            f'<span class="frise-label">{html_escape(label)}</span></a>'
        )
    return '<div class="frise" id="frise">' + "".join(lis) + "</div>"


def render_result_badge(outcome):
    if outcome not in ("win", "loss"):
        return ""
    cls = "result-badge is-win" if outcome == "win" else "result-badge is-loss"
    label = "Victoire" if outcome == "win" else "D&eacute;faite"
    return f'<p class="{cls}">{label}</p>'


def render_history_table(wars_subset, war_href_prefix):
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
        thead_cells.append(
            f'<th><a href="{war_href_prefix}{w["slug"]}.html">{html_escape(header_labels[w["slug"]])}</a></th>'
        )
    thead_cells.append("<th>Total</th>")
    thead_cells.append("<th>Moyenne</th>")
    thead = "".join(thead_cells)

    totals = {uid: sum(per_war.values()) for uid, per_war in history.items()}
    averages = {uid: totals[uid] / len(history[uid]) for uid in history}
    body_rows = []
    for uid in sorted(history, key=lambda u: -totals[u]):
        per_war = history[uid]
        cells = [f"<td>{html_escape(display_names[uid])}</td>"]
        for w in wars_subset:
            v = per_war.get(w["slug"])
            cells.append(f"<td>{round_pts(v)}</td>" if v is not None else "<td>-</td>")
        cells.append(f"<td>{round_pts(totals[uid])}</td>")
        cells.append(f"<td>{round_pts(averages[uid])}</td>")
        body_rows.append("<tr>" + "".join(cells) + "</tr>")

    return f"""<div class="table-scroll"><table class="sortable">
  <thead><tr>{thead}</tr></thead>
  <tbody>{''.join(body_rows)}</tbody>
</table></div>"""


def compute_wars_averages(wars_subset):
    """uid -> average points across wars_subset (OUR_GUILD's team only), plus
    display names and an "efficience" ratio ((fails + misses) / (wins + finishes))."""
    history = defaultdict(list)
    fail_miss_win_finish = defaultdict(lambda: [0, 0, 0, 0])
    display_names = {}
    for w in wars_subset:
        result = w["result"]
        our_idx = find_team_idx(result["guilds"], OUR_GUILD)
        for uid, ps in result["player_stats"].items():
            if ps["team"] != our_idx:
                continue
            history[uid].append(ps["pts"])
            fmwf = fail_miss_win_finish[uid]
            fmwf[0] += ps["fail"]
            fmwf[1] += ps["miss"]
            fmwf[2] += ps["win"]
            fmwf[3] += ps["finish"]
            display_names[uid] = result["players"].get(uid, {}).get("displayName", uid)
    averages = {uid: sum(pts) / len(pts) for uid, pts in history.items()}
    efficience = {
        uid: ((fail + miss) / (win + finish) if (win + finish) > 0 else 0.0)
        for uid, (fail, miss, win, finish) in fail_miss_win_finish.items()
    }
    return display_names, averages, efficience


PAGE_TEMPLATE = """<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>{title}</title>
<link rel="stylesheet" href="{asset_prefix}assets/style.css">
</head>
<body>
<header><div class="breadcrumb" id="breadcrumb">{back_link}</div><h1 id="page-title">{title}</h1></header>
<main>
{body}
</main>
<script src="{asset_prefix}assets/sort-table.js"></script>
<script src="{asset_prefix}assets/chart-toggle.js"></script>
<script src="{asset_prefix}assets/page-transition.js"></script>
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
    back_link = back_link_html(f"../seasons/{season}.html", f"Saison {season}")
    html = PAGE_TEMPLATE.format(title=title, asset_prefix="../", body=body, back_link=back_link)
    out_path = os.path.join(DOCS_DIR, "wars", slug + ".html")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)


def render_season_page(season, wars_in_season, active_uids=frozenset()):
    wars_in_season = sorted(wars_in_season, key=lambda w: w["result"]["war_start"])

    frise_items = []
    for w in wars_in_season:
        our_idx = find_team_idx(w["result"]["guilds"], OUR_GUILD)
        opp = ", ".join(opponent_names(w["result"], our_idx)) or w["slug"]
        frise_items.append((opp, f"../wars/{w['slug']}.html", w.get("outcome") == "win"))

    display_names, averages, efficience = compute_wars_averages(wars_in_season)

    body = render_frise(frise_items)
    body += render_average_chart(display_names, averages, efficience, active_uids)
    body += f'<div id="table-wrap">{render_history_table(wars_in_season, "../wars/")}</div>'

    back_link = back_link_html("../index.html", "Accueil", transition=True)
    html = PAGE_TEMPLATE.format(title=f"Saison {season}", asset_prefix="../", body=body, back_link=back_link)
    out_dir = os.path.join(DOCS_DIR, "seasons")
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, f"{season}.html"), "w", encoding="utf-8") as f:
        f.write(html)


def compute_season_averages(seasons):
    """uid -> per-season [sum_pts, war_count], plus display names, overall
    totals/war-counts/averages across every war played on OUR_GUILD's team,
    and an overall "efficience" ratio ((fails + misses) / (wins + finishes))."""
    season_stats = defaultdict(dict)  # uid -> season -> [sum_pts, war_count]
    fail_miss_win_finish = defaultdict(lambda: [0, 0, 0, 0])
    display_names = {}
    for season, wars_in_season in seasons.items():
        for w in wars_in_season:
            result = w["result"]
            our_idx = find_team_idx(result["guilds"], OUR_GUILD)
            for uid, ps in result["player_stats"].items():
                if ps["team"] != our_idx:
                    continue
                entry = season_stats[uid].setdefault(season, [0.0, 0])
                entry[0] += ps["pts"]
                entry[1] += 1
                fmwf = fail_miss_win_finish[uid]
                fmwf[0] += ps["fail"]
                fmwf[1] += ps["miss"]
                fmwf[2] += ps["win"]
                fmwf[3] += ps["finish"]
                display_names[uid] = result["players"].get(uid, {}).get("displayName", uid)

    totals = {uid: sum(s for s, _ in per_season.values()) for uid, per_season in season_stats.items()}
    war_counts = {uid: sum(c for _, c in per_season.values()) for uid, per_season in season_stats.items()}
    averages = {uid: totals[uid] / war_counts[uid] for uid in season_stats}
    efficience = {
        uid: ((fail + miss) / (win + finish) if (win + finish) > 0 else 0.0)
        for uid, (fail, miss, win, finish) in fail_miss_win_finish.items()
    }
    return season_stats, display_names, totals, war_counts, averages, efficience


def render_season_average_table(season_numbers, season_stats, display_names, averages):
    """Joueur x season table for the homepage: each season column shows the
    player's average points per war played that season (not the raw per-war
    results), plus the overall Moyenne across every war played."""
    thead_cells = ["<th>Joueur</th>"]
    for season in season_numbers:
        thead_cells.append(f'<th><a href="seasons/{season}.html">Saison {season}</a></th>')
    thead_cells.append("<th>Moyenne</th>")
    thead = "".join(thead_cells)

    body_rows = []
    for uid in sorted(season_stats, key=lambda u: -averages[u]):
        per_season = season_stats[uid]
        cells = [f"<td>{html_escape(display_names[uid])}</td>"]
        for season in season_numbers:
            entry = per_season.get(season)
            cells.append(f"<td>{round_pts(entry[0] / entry[1])}</td>" if entry else "<td>-</td>")
        cells.append(f"<td>{round_pts(averages[uid])}</td>")
        body_rows.append("<tr>" + "".join(cells) + "</tr>")

    return f"""<div class="table-scroll"><table class="sortable">
  <thead><tr>{thead}</tr></thead>
  <tbody>{''.join(body_rows)}</tbody>
</table></div>"""


def render_metric_svg(metric_key, display_names, values, active_uids, fmt, ascending=False):
    """One inline SVG bar chart for a single metric, players sorted with the
    "best" value leftmost (highest first by default, or lowest first when
    `ascending` is set — e.g. for "Efficience" where lower is better). Bars
    for players present in the most recent war are highlighted green to show
    who's currently active."""
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
        h = (val / max_val) * chart_h if max_val else 0
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
        f'<svg id="avg-chart-{metric_key}" viewBox="0 0 {width} {height}" width="{width}" height="{height}" '
        f'xmlns="http://www.w3.org/2000/svg">' + "".join(bars) + "</svg>"
    )


def render_average_chart(display_names, averages, efficience, active_uids=frozenset()):
    """Chip-toggled bar chart: "Moyenne" (avg points, shown by default) vs
    "Efficience" (fails / (wins + finishes)), both rendered up front as
    static inline SVGs (no JS dependency beyond the show/hide toggle)."""
    if not averages:
        return ""

    metrics = [
        ("moyenne", "Moyenne", averages, lambda v: str(round_pts(v)), False),
        ("efficience", "Efficience", efficience, lambda v: f"{v * 100:.0f}%", True),
    ]

    chips = "".join(
        f'<button type="button" class="chip{" active" if i == 0 else ""}" data-metric="{key}">{html_escape(label)}</button>'
        for i, (key, label, _values, _fmt, _ascending) in enumerate(metrics)
    )

    charts = []
    for i, (key, _label, values, fmt, ascending) in enumerate(metrics):
        style = "" if i == 0 else ' style="display:none"'
        svg = render_metric_svg(key, display_names, values, active_uids, fmt, ascending=ascending)
        charts.append(f'<div class="chart-scroll" data-metric="{key}"{style}>{svg}</div>')

    return f'<div id="chart-wrap"><div class="chips">{chips}</div>{"".join(charts)}</div>'


def render_index(seasons, active_uids=frozenset()):
    season_numbers = sorted(seasons.keys())
    frise_items = [(f"Saison {s}", f"seasons/{s}.html", False) for s in season_numbers]
    season_stats, display_names, totals, war_counts, averages, efficience = compute_season_averages(seasons)

    body = render_frise(frise_items, transition=True)
    body += render_average_chart(display_names, averages, efficience, active_uids)
    body += f'<div id="table-wrap">{render_season_average_table(season_numbers, season_stats, display_names, averages)}</div>'
    body += BAREME_HTML

    html = PAGE_TEMPLATE.format(title="LJP Wars", asset_prefix="", body=body, back_link="")
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
