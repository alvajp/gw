#!/usr/bin/env python3
"""What the Simulation board needs to know about each character: data/unit_rules.json.

From the game's own files: the local configuration (~/Library/Application Support/com.snowprintstudios.tacticus/gameconfig/*.json, section units.lineup) gives the movement, the reach
of each weapon (1 = melee, n = ranged), the traits that change the rules (Flying, Unstoppable / Vehicle / Immune, IndirectFire, RapidAssault: +1 movement until it attacks), the base
stats and what each rank adds; the French names of the abilities and traits come from the language bundle (needs UnityPy: use the venv python). The stats at the top of each
rarity are computed here: (base + what the ranks up to that one add) x (100 + 10 per star) %, which the recorded battles confirm (the level does not change the stats):

    rare       level 26  Silver 1 (rank 9)        1 red star  (6)
    epic       level 35  Gold 1 (rank 12)         3 red stars (8)
    legendary  level 50  Diamond 3 (rank 17)      1 blue star (11)
    mythic     level 60  Adamantine 2 (rank 19)   winged skull (14)

The file is committed (the daily build has no game files):

    python3 scripts/unit_rules.py
"""
import glob
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LEVEL = {"r": 26, "e": 35, "l": 50, "m": 60}  # the ability levels at the top of each rarity (the character's level)
TOP = {"r": (9, 6), "e": (12, 8), "l": (17, 11), "m": (19, 14)}  # rarity -> (rank, stars) of the top of that rarity


def french_terms():
    """The French language bundle's terms (Abilities/<id>_Name, Traits/<trait>_Name ...), {} when UnityPy or the game's files are missing."""
    try:
        import UnityPy
    except ImportError:
        return {}
    UnityPy.config.FALLBACK_UNITY_VERSION = "6000.3.13f1"
    found = glob.glob(os.path.expanduser("~/Library/Caches/tacticus/games/*/Tacticus.app/Contents/Resources/Data/StreamingAssets/Bundles/languages/fr_*.resource"))
    for obj in (UnityPy.load(found[0]).objects if found else []):
        if obj.type.name == "MonoBehaviour":
            try:
                terms = obj.read_typetree()["mSource"]["mTerms"]
            except Exception:
                continue
            return {t["Term"]: t["Languages"][0] for t in terms if t.get("Languages")}
    return {}


def main():
    files = sorted(glob.glob(os.path.expanduser("~/Library/Application Support/com.snowprintstudios.tacticus/gameconfig/*.json")), key=os.path.getmtime)
    units = json.load(open(files[-1], encoding="utf-8"))["clientGameConfig"]["units"]
    lineup, abilities, steps = units["lineup"], units["abilities"], units["heroProgressionSteps"]
    fr = french_terms()
    out = {"_pierce": {k: v.get("PiercingRatio", 1) for k, v in units["damageProfiles"].items()}}  # armour left against each damage profile: 100 - this %
    gv = json.load(open(files[-1], encoding="utf-8"))["clientGameConfig"]["globalValues"]
    # the numbers of the traits (traitVariables) and of the terrain / elevation, as the game's configuration gives them
    out["_tv"] = {**gv["traitVariables"], **{k: gv[k] for k in ("elevationBonus", "swampBonus", "shrubBonus", "lightCoverHitReduction", "trenchBonus") if k in gv}}

    def ability_mult(rar):  # the ability stat multiplier (%) of the stars at the top of the rarity
        return next(x["abilityStatMultiplierPct"] for x in steps if x["stars"] == TOP[rar][1])

    def ability(a, kind, u):
        """[id, French name, a / p, average damage at the top of each rarity (None: no damage), melee / ranged, damage profile, hits, description, values by rarity, range (0: the weapon's)]"""
        cfg = abilities.get(a) or {}
        var, const = cfg.get("variables") or {}, cfg.get("constants") or {}
        dmg = None
        if kind == "a" and var.get("minDmg") and var.get("maxDmg"):
            dmg = {rar: round((var["minDmg"][LEVEL[rar] - 1] + var["maxDmg"][LEVEL[rar] - 1]) / 2 * ability_mult(rar) / 100) for rar in TOP}
        # the French description with its {names} left in, and the value of each name at the top of every rarity (the arrays are by level; some are boosted by the stars)
        text = fr.get("Abilities/" + a + "_CurrentLevelDescription") or ""
        text = re.sub(r"\{\[S/([^\]]+)\]\}", lambda m: fr.get("S/" + m.group(1), ""), text)
        text = re.sub(r"</?style[^>]*>|</?[ib]>", "", text).replace("\xa0", " ").strip()
        names = sorted(set(re.findall(r"\{\[([^\]]+)\]\}", text)))
        boosted = set(cfg.get("variablesAffectedByRarityBonus") or [])
        vals = {}
        for rar in TOP:
            vals[rar] = {}
            for n in names:
                v = var.get(n) if isinstance(var.get(n), list) else const.get(n)
                if isinstance(v, list):
                    v = v[min(len(v), LEVEL[rar]) - 1]
                    if n in boosted:
                        v = round(v * ability_mult(rar) / 100)
                vals[rar][n] = v
        text = re.sub(r"\{\[([^\]]+)\]\}", lambda m: "{" + m.group(1) + "}", text)
        return [a, fr.get("Abilities/" + a + "_Name", a), kind, dmg, cfg.get("attackRangeType") or "", const.get("damageProfile") or "", int(const.get("nrOfHits") or 1), text, vals, int(const.get("range") or 0)]

    for uid, u in lineup.items():
        tr = set(u.get("traits") or [])
        ranges = sorted({w.get("Range") or 1 for w in u.get("weapons") or []}) or [1]
        rec = {"mv": u.get("Movement"), "rg": ranges, **({"fl": 1} if "Flying" in tr else {}), **({"us": 1} if tr & {"Unstoppable", "Vehicle", "Immune"} else {}),
               **({"id": 1} if "IndirectFire" in tr else {}), **({"ra": 1} if "RapidAssault" in tr else {})}
        base, inc = u.get("stats") or {}, u.get("upgradesStatIncrease")
        if inc and base:
            rec["st"] = {}
            for rar, (rank, stars) in TOP.items():
                add = [sum(x[i] + x[i + 1] for x in inc[:rank]) for i in (0, 2, 4)]
                rec["st"][rar] = [round((base[k] + a) * (100 + 10 * stars) / 100) for k, a in zip(("Health", "Damage", "FixedArmor"), add)]
        rec["wp"] = [[w.get("Range") or 1, w.get("DamageProfile") or "Physical", w.get("hits") or 1] for w in u.get("weapons") or []]  # reach (1 = melee), damage profile, hits
        rec["ab"] = [ability(a, k, u) for k, key in (("a", "activeAbilities"), ("p", "passiveAbilities")) for a in u.get(key) or []]
        rec["tr"] = [[t, fr["Traits/" + t + "_Name"]] for t in sorted(tr) if fr.get("Traits/" + t + "_Name")]
        out[uid] = rec
    with open(os.path.join(ROOT, "data", "unit_rules.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    print(len(out), "units")


if __name__ == "__main__":
    main()
