"""
Read every war in data/wars/ (a <slug>.json + <slug>.maps.yaml pair),
compute the ranking for each, and render the static site into docs/.

Usage: python3 scripts/generate_site.py
"""
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(__file__))
from ranking import compute_ranking
from maps_yaml import load_maps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WARS_DIR = os.path.join(ROOT, "data", "wars")
DOCS_DIR = os.path.join(ROOT, "docs")

COLS = [
    ("pts", "Points"), ("win", "Wins"), ("fail", "Fails"), ("miss", "Miss"), ("finish", "Finishes"),
    ("MS", "MS"), ("AP", "AP"), ("AA", "AA"), ("AR", "AR"), ("FP", "FP"), ("LP", "LP"),
    ("1600", "1600"), ("1400", "1400"), ("1200_1050", "1200(1050)"), ("1100_850", "1100(850)"), ("650-", "650-"),
    ("kills", "Kills"),
]


def discover_wars():
    wars = []
    for fname in sorted(os.listdir(WARS_DIR)):
        if not fname.endswith(".json"):
            continue
        slug = fname[:-len(".json")]
        json_path = os.path.join(WARS_DIR, fname)
        maps_path = os.path.join(WARS_DIR, slug + ".maps.yaml")
        maps = load_maps(maps_path) if os.path.exists(maps_path) else {"hard": {}, "easy": {}}
        wars.append((slug, json_path, maps))
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


PAGE_TEMPLATE = """<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>{title}</title>
<link rel="stylesheet" href="{asset_prefix}assets/style.css">
</head>
<body>
<header><a href="{asset_prefix}index.html">&larr; Accueil</a><h1>{title}</h1></header>
<main>
{body}
</main>
<script src="{asset_prefix}assets/sort-table.js"></script>
</body>
</html>"""


def render_war_page(slug, result):
    players = result["players"]
    guilds = result["guilds"]
    player_stats = result["player_stats"]
    hard_cols = result["hard_cols"]
    easy_cols = result["easy_cols"]

    sections = []
    for team_idx in sorted(guilds):
        guild_name = guilds[team_idx]["name"]
        rows = [
            (players.get(uid, {}).get("displayName", uid), ps)
            for uid, ps in player_stats.items() if ps["team"] == team_idx
        ]
        rows.sort(key=lambda x: -x[1]["pts"])
        sections.append(f"<h2>{html_escape(guild_name)}</h2>" + render_table(rows, hard_cols, easy_cols))

    body = "\n".join(sections)
    html = PAGE_TEMPLATE.format(title=f"Guerre : {slug}", asset_prefix="../", body=body)
    out_path = os.path.join(DOCS_DIR, "wars", slug + ".html")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)


def render_index(all_results):
    """all_results: list of (slug, result) in the order wars were discovered."""
    war_links = "".join(
        f'<li><a href="wars/{slug}.html">{html_escape(slug)}</a></li>' for slug, _ in all_results
    )

    # Per-player points history across wars, keyed by userId (stable across wars)
    history = defaultdict(dict)  # uid -> {slug: pts}
    display_names = {}
    for slug, result in all_results:
        for uid, ps in result["player_stats"].items():
            history[uid][slug] = ps["pts"]
            display_names[uid] = result["players"].get(uid, {}).get("displayName", uid)

    slugs = [slug for slug, _ in all_results]
    headers = ["Joueur"] + slugs + ["Total"]
    thead = "".join(f"<th>{html_escape(h)}</th>" for h in headers)
    totals = {uid: sum(per_war.values()) for uid, per_war in history.items()}
    body_rows = []
    for uid in sorted(history, key=lambda u: -totals[u]):
        per_war = history[uid]
        cells = [f"<td>{html_escape(display_names[uid])}</td>"]
        for slug in slugs:
            v = per_war.get(slug)
            cells.append(f"<td>{v:.1f}</td>" if v is not None else "<td>-</td>")
        cells.append(f"<td>{totals[uid]:.1f}</td>")
        body_rows.append("<tr>" + "".join(cells) + "</tr>")

    history_table = f"""<table class="sortable">
  <thead><tr>{thead}</tr></thead>
  <tbody>{''.join(body_rows)}</tbody>
</table>"""

    body = f"<h2>Guerres</h2><ul>{war_links}</ul><h2>Historique des points par joueur</h2>{history_table}"
    html = PAGE_TEMPLATE.format(title="Tacticus Guild War Tracker", asset_prefix="", body=body)
    with open(os.path.join(DOCS_DIR, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)


def main():
    os.makedirs(os.path.join(DOCS_DIR, "wars"), exist_ok=True)
    os.makedirs(os.path.join(DOCS_DIR, "assets"), exist_ok=True)

    all_results = []
    for slug, json_path, maps in discover_wars():
        result = compute_ranking(json_path, maps)
        render_war_page(slug, result)
        all_results.append((slug, result))

    render_index(all_results)
    print(f"Generated {len(all_results)} war page(s) + index.html into {DOCS_DIR}")


if __name__ == "__main__":
    main()
