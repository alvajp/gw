#!/usr/bin/env python3
"""Download the game's progression costs (tacticusdb's public data API) and keep the cumulative curves the raid-meta
completion % needs in data/progression_costs.json:
  star_cum            shard-equivalents paid to reach progression index 0..19 (mythic shard = 5 shards, orbs counted 1 each,
                      mythic orb = 5 legendary orbs)
  xp_cum              total XP to reach level L (index L-1)
  ability_gold_cum    gold to reach ability level L (heroes), ability_token_cum the matching badges (mythic = 5 legendary)
  mow_ability_gold_cum  same gold curve for machines of war
  rank_energy_cum     per unit id: energy needed to farm the rank-up items, cumulative per rank (cheapest drop location)
Run when the game changes its costs:
    python3 scripts/fetch_progression_costs.py && python3 scripts/generate_site.py"""
import itertools
import json
import os
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = "https://tacticusdb.com/api/data/"
MYTHIC = 5  # one mythic item (shard, orb, badge) is worth 5 of the rarity below


def get(name):
    req = urllib.request.Request(BASE + name, headers={"User-Agent": "tacticus-guildwar-tracker"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def weighted(costs, prefix):
    return sum(v * (MYTHIC if k.endswith("Mythic") else 1) for k, v in costs.items() if k.startswith(prefix))


def main():
    prof, upgrades = get("progressionProfiles"), get("upgrades")
    prog = prof["progression"]
    cum = lambda xs: [0] + [round(x, 2) for x in itertools.accumulate(xs)]

    def energy(uid):
        costs = (upgrades.get(uid) or {}).get("energyCosts")
        return min(costs) if costs else 0

    out = {
        "star_cum": cum(
            s["costs"].get("shards", 0) + MYTHIC * s["costs"].get("mythicShards", 0) + weighted(s["costs"], "heroAscensionOrb")
            for s in prog["heroProgressionSteps"]
        ),
        "xp_cum": cum(prog["xpLevels"]),
        "ability_gold_cum": cum(a["gold"] for a in prog["abilityUpgradeCosts"]),
        "ability_token_cum": cum(weighted(a, "abilityToken") for a in prog["abilityUpgradeCosts"]),
        "mow_ability_gold_cum": cum(a["gold"] for a in prog["abilityUpgradeCostsMoW"]),
        "rank_energy_cum": {
            uid: cum(sum(energy(x) for x in rank) for rank in c["upgrades"])
            for uid, c in prof["characters"].items() if c.get("upgrades")
        },
    }
    path = os.path.join(ROOT, "data", "progression_costs.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, separators=(",", ":"))
    print("saved", path, {k: len(v) for k, v in out.items()})


if __name__ == "__main__":
    main()
