# Tacticus Guild War Tracker

Static site tracking guild war results for "Les Joyeux Psychopathes !" across multiple wars, generated from captured `game-event/game3` activity logs (see mitmproxy capture setup in project notes).

## Structure

- `data/wars/<slug>.json` — raw captured activity log for one war
- `data/wars/<slug>.maps.yaml` — that war's zone→map-name difficulty assignment (hard = +2pts/battle, easy = +0.5pt/battle); these names rotate every war and can't be derived from game data, so they're supplied manually
- `scripts/ranking.py` — the point formula (win/finish tiers, buffs, map bonus, unused-token count)
- `scripts/generate_site.py` — renders `docs/` (the GitHub Pages source) from everything in `data/wars/`
- `docs/` — generated static site, do not hand-edit

## Regenerating the site

```
python3 scripts/generate_site.py
```

## Adding a new war

1. Drop the captured JSON into `data/wars/<slug>.json`
2. Write `data/wars/<slug>.maps.yaml` with that war's 6 zone→map assignments
3. Run `python3 scripts/generate_site.py`
4. Commit and push
