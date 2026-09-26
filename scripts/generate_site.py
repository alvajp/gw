"""
Read every war in data/wars/ (a <slug>.json + <slug>.maps.yaml pair),
compute the ranking for each, and render the static site into docs/.

Usage: python3 scripts/generate_site.py
"""
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
  <li><strong>Palier de score par bataille</strong> (le palier le plus haut inclut le bonus de destruction de zone) :
    <ul>
      <li>1600 &rarr; 10 pts</li>
      <li>1400 &rarr; 8 pts</li>
      <li>1200 / 1050 &rarr; 7 pts</li>
      <li>1100 / 850 &rarr; 6 pts</li>
      <li>650 / 450 / 250 &rarr; 5 pts</li>
      <li>Fail (score le plus bas) &rarr; 0 pt</li>
    </ul>
  </li>
  <li><strong>Buffs de zone</strong> : Medicae Station (MS) = +2 pts par bataille, tout autre buff (AP/AA/AR/FP/LP) = +0.5 pt.</li>
  <li><strong>Bonus de map</strong> : +2 pts par bataille sur une zone classée difficile, +0.5 pt sur une zone facile (les noms de map changent à chaque guerre).</li>
  <li><strong>Miss</strong> : chaque jeton d'attaque non joué sur les 10 alloués par guerre = 0 pt.</li>
</ul>"""


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
                val = f"{val:.1f}"
            cells.append(f"<td>{val}</td>")
        for i in range(1, len(hard_cols) + 1):
            cells.append(f"<td>{ps.get(f'hard{i}', 0)}</td>")
        for i in range(1, len(easy_cols) + 1):
            cells.append(f"<td>{ps.get(f'easy{i}', 0)}</td>")
        body_rows.append("<tr>" + "".join(cells) + "</tr>")

    return f"""<table class="sortable">
  <thead><tr>{thead}</tr></thead>
  <tbody>{''.join(body_rows)}</tbody>
</table>"""


def render_frise(items):
    """items: list of (label, href, slug). slug is the war slug used to sync
    the dot color with the localStorage-backed win/loss toggle (see
    result-toggle.js) — pass None when the item isn't a single war (e.g. the
    per-season items on the homepage)."""
    lis = []
    for label, href, slug in items:
        slug_attr = f' data-war-slug="{html_escape(slug)}"' if slug else ""
        lis.append(
            f'<a class="frise-item" href="{href}"{slug_attr}><span class="frise-dot"></span>'
            f'<span class="frise-label">{html_escape(label)}</span></a>'
        )
    return '<div class="frise">' + "".join(lis) + "</div>"


def render_result_toggle(slug):
    return (
        f'<button type="button" class="result-toggle" data-war-toggle="{html_escape(slug)}">'
        '<span class="result-toggle-track"><span class="result-toggle-thumb"></span></span>'
        '<span class="result-toggle-label">D&eacute;faite</span></button>'
    )


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
            cells.append(f"<td>{v:.1f}</td>" if v is not None else "<td>-</td>")
        cells.append(f"<td>{totals[uid]:.1f}</td>")
        cells.append(f"<td>{averages[uid]:.0f}</td>")
        body_rows.append("<tr>" + "".join(cells) + "</tr>")

    return f"""<table class="sortable">
  <thead><tr>{thead}</tr></thead>
  <tbody>{''.join(body_rows)}</tbody>
</table>"""


PAGE_TEMPLATE = """<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>{title}</title>
<link rel="stylesheet" href="{asset_prefix}assets/style.css">
</head>
<body>
<header>{back_link}<h1>{title}</h1></header>
<main>
{body}
</main>
<script src="{asset_prefix}assets/sort-table.js"></script>
<script src="{asset_prefix}assets/result-toggle.js"></script>
</body>
</html>"""


def back_link_html(href, label):
    if not href:
        return ""
    return f'<a href="{href}">&larr; {html_escape(label)}</a>'


def guild_rows(result, team_idx):
    players = result["players"]
    player_stats = result["player_stats"]
    rows = [
        (players.get(uid, {}).get("displayName", uid), ps)
        for uid, ps in player_stats.items() if ps["team"] == team_idx
    ]
    rows.sort(key=lambda x: -x[1]["pts"])
    return rows


def render_war_page(slug, result, season):
    guilds = result["guilds"]
    hard_cols = result["hard_cols"]
    easy_cols = result["easy_cols"]

    our_idx = find_team_idx(guilds, OUR_GUILD)
    our_rows = guild_rows(result, our_idx)
    body = render_result_toggle(slug)
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


def render_season_page(season, wars_in_season):
    wars_in_season = sorted(wars_in_season, key=lambda w: w["result"]["war_start"])

    frise_items = []
    for w in wars_in_season:
        our_idx = find_team_idx(w["result"]["guilds"], OUR_GUILD)
        opp = ", ".join(opponent_names(w["result"], our_idx)) or w["slug"]
        frise_items.append((opp, f"../wars/{w['slug']}.html", w["slug"]))

    body = render_frise(frise_items)
    body += render_history_table(wars_in_season, "../wars/")

    back_link = back_link_html("../index.html", "Accueil")
    html = PAGE_TEMPLATE.format(title=f"Saison {season}", asset_prefix="../", body=body, back_link=back_link)
    out_dir = os.path.join(DOCS_DIR, "seasons")
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, f"{season}.html"), "w", encoding="utf-8") as f:
        f.write(html)


def compute_season_averages(seasons):
    """uid -> per-season [sum_pts, war_count], plus display names, overall
    totals/war-counts/averages across every war played on OUR_GUILD's team."""
    season_stats = defaultdict(dict)  # uid -> season -> [sum_pts, war_count]
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
                display_names[uid] = result["players"].get(uid, {}).get("displayName", uid)

    totals = {uid: sum(s for s, _ in per_season.values()) for uid, per_season in season_stats.items()}
    war_counts = {uid: sum(c for _, c in per_season.values()) for uid, per_season in season_stats.items()}
    averages = {uid: totals[uid] / war_counts[uid] for uid in season_stats}
    return season_stats, display_names, totals, war_counts, averages


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
            cells.append(f"<td>{entry[0] / entry[1]:.0f}</td>" if entry else "<td>-</td>")
        cells.append(f"<td>{averages[uid]:.0f}</td>")
        body_rows.append("<tr>" + "".join(cells) + "</tr>")

    return f"""<table class="sortable">
  <thead><tr>{thead}</tr></thead>
  <tbody>{''.join(body_rows)}</tbody>
</table>"""


def render_average_chart(display_names, averages, active_uids=frozenset()):
    """Bar chart of every player's overall average points, highest first
    (leftmost), rendered as a static inline SVG (no JS dependency). Bars for
    players present in the most recent war are highlighted green to show
    who's currently active."""
    order = sorted(averages, key=lambda u: -averages[u])
    if not order:
        return ""

    bar_width, gap = 22, 6
    chart_h, top_pad, bottom_pad = 220, 20, 130
    max_avg = max(averages.values())
    width = gap + len(order) * (bar_width + gap)
    height = top_pad + chart_h + bottom_pad

    bars = []
    for i, uid in enumerate(order):
        avg = averages[uid]
        h = (avg / max_avg) * chart_h if max_avg else 0
        x = gap + i * (bar_width + gap)
        y = top_pad + (chart_h - h)
        cx = x + bar_width / 2
        fill = "#22c55e" if uid in active_uids else "#9aa4ff"
        bars.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{bar_width}" height="{h:.1f}" rx="2" fill="{fill}"/>')
        bars.append(f'<text x="{cx:.1f}" y="{y - 6:.1f}" class="chart-value">{avg:.0f}</text>')
        label_y = top_pad + chart_h + 12
        bars.append(
            f'<text x="{cx:.1f}" y="{label_y}" class="chart-label" '
            f'transform="rotate(-60 {cx:.1f} {label_y})">{html_escape(display_names[uid])}</text>'
        )

    svg = (
        f'<svg viewBox="0 0 {width} {height}" width="{width}" height="{height}" '
        f'xmlns="http://www.w3.org/2000/svg">' + "".join(bars) + "</svg>"
    )
    return f'<h2>Moyenne globale par joueur</h2><div class="chart-scroll">{svg}</div>'


def render_index(seasons, active_uids=frozenset()):
    season_numbers = sorted(seasons.keys())
    frise_items = [(f"Saison {s}", f"seasons/{s}.html", None) for s in season_numbers]
    season_stats, display_names, totals, war_counts, averages = compute_season_averages(seasons)

    body = render_frise(frise_items)
    body += render_average_chart(display_names, averages, active_uids)
    body += render_season_average_table(season_numbers, season_stats, display_names, averages)
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
        all_wars.append({"slug": slug, "result": result, "season": season, "war_number": war_number})

    for slug, legacy_path in discover_legacy_wars():
        legacy_data = load_legacy(legacy_path)
        result = compute_legacy_ranking(legacy_path)
        season = int(legacy_data.get("season") or 0)
        war_number = int(legacy_data.get("war_number") or 0)
        result["war_start"] = war_number  # no timestamp available; order within season by war_number
        all_wars.append({"slug": slug, "result": result, "season": season, "war_number": war_number})

    all_wars.sort(key=lambda w: (w["season"], w["result"]["war_start"]))

    for w in all_wars:
        render_war_page(w["slug"], w["result"], w["season"])

    seasons = defaultdict(list)
    for w in all_wars:
        seasons[w["season"]].append(w)
    for season, season_wars in seasons.items():
        render_season_page(season, season_wars)

    active_uids = frozenset()
    if all_wars:
        last_war = all_wars[-1]
        our_idx = find_team_idx(last_war["result"]["guilds"], OUR_GUILD)
        active_uids = frozenset(
            uid for uid, ps in last_war["result"]["player_stats"].items() if ps["team"] == our_idx
        )
    render_index(seasons, active_uids)
    print(f"Generated {len(all_wars)} war page(s), {len(seasons)} season page(s) + index.html into {DOCS_DIR}")


if __name__ == "__main__":
    main()
