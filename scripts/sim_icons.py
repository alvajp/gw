#!/usr/bin/env python3
"""The icons of the Simulation board's character panel, taken from the game's own files: docs/assets/traits/<Trait>.webp (atlases/hero_traits: sprite ui_icon_trait_<name>) and
docs/assets/abilities/<ability>.webp for the abilities of every character (Bundles/abilities/*/<ability>_*.resource), passives included. Needs UnityPy + Pillow (the venv python)
and the game's files on this Mac; the pictures are committed:

    python3 scripts/sim_icons.py
"""
import glob
import json
import os
import re

import UnityPy

UnityPy.config.FALLBACK_UNITY_VERSION = "6000.3.13f1"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUNDLES = os.path.expanduser("~/Library/Caches/tacticus/games/*/Tacticus.app/Contents/Resources/Data/StreamingAssets/Bundles")
# the sprites that do not follow ui_icon_trait_<trait in snake_case>_01 (the game's own spelling included)
ODD = {"Psyker": "psychic", "TerminatorArmour": "terminator_amour", "WeaverOfFate": "weavers_of_fate", "Daemon": "daemonic", "SuppressiveFire": "supressive_fire",
       "Diminutive": "diminuitive", "LivingMetal": "livingmetall", "ContagionsOfNurgle": "contagions", "BlessingsOfKhorne": "blessing_of_khorne", "MkXGravis": "mk_gravis",
       "TwoManTeam": "2_man_team", "DeathToTheFalseEmperor": "false_emperor", "Resilient": "resilient"}


def snake(t):
    return re.sub(r"(?<!^)([A-Z])", r"_\1", t).lower()


def main():
    gcfg = sorted(glob.glob(os.path.expanduser("~/Library/Application Support/com.snowprintstudios.tacticus/gameconfig/*.json")), key=os.path.getmtime)[-1]
    lineup = json.load(open(gcfg, encoding="utf-8"))["clientGameConfig"]["units"]["lineup"]
    traits = sorted({t for u in lineup.values() for t in u.get("traits") or []})
    # traits
    sprites = {}
    for o in UnityPy.load(glob.glob(BUNDLES + "/atlases/hero_traits_*.resource")[0]).objects:
        if o.type.name == "Sprite":
            s = o.read()
            sprites[s.m_Name] = s
    os.makedirs(os.path.join(ROOT, "docs", "assets", "traits"), exist_ok=True)
    got, miss = 0, []
    for t in traits:
        name = ODD.get(t) or snake(t)
        s = sprites.get("ui_icon_trait_" + name + "_01") or sprites.get("ui_icon_trait_" + name)
        if not s:
            miss.append(t)
            continue
        im = s.image.convert("RGBA")
        im.thumbnail((64, 64))
        im.save(os.path.join(ROOT, "docs", "assets", "traits", t + ".webp"), "WEBP", quality=88)
        got += 1
    print("traits:", got, "icons; none for", ", ".join(miss))
    # the icons of the effects (buffs, debuffs, marks) shown on the characters: docs/assets/effects/<name>.webp
    os.makedirs(os.path.join(ROOT, "docs", "assets", "effects"), exist_ok=True)
    wanted_fx = ["markerlight", "buffed", "debuffed", "damage_powerup", "armor_powerup", "health_powerup", "hit_powerup", "shield", "stunned", "supressed", "taunted", "infiltrate", "overwatch",
                 "light_cover", "fortified", "master_annihilator", "stand_vigil", "martial_superiority", "black_rage", "fire", "ice", "poisoned", "melee_powerup", "reveal", "conceal", "synapse",
                 "shadow_in_the_warp", "terminator_armour", "early_warning", "blood_surge", "fueled_by_fury", "damaged", "possessed", "healing_powerup", "reinforcement_powerup"]
    fx = 0
    for n in wanted_fx:
        sp = sprites.get("ui_icon_uniteffect_" + n + "_01") or sprites.get("ui_icon_uniteffect_" + n)
        if not sp:
            print("no effect icon:", n)
            continue
        im = sp.image.convert("RGBA")
        im.thumbnail((64, 64))
        im.save(os.path.join(ROOT, "docs", "assets", "effects", n + ".webp"), "WEBP", quality=88)
        fx += 1
    print("effects:", fx, "icons")
    # abilities
    out = os.path.join(ROOT, "docs", "assets", "abilities")
    got, miss = 0, []
    wanted = sorted({a for u in lineup.values() for k in ("activeAbilities", "passiveAbilities") for a in u.get(k) or []})
    for a in wanted:
        if os.path.exists(os.path.join(out, a + ".webp")):
            continue
        found = glob.glob(BUNDLES + "/abilities/*/" + a.lower() + "_*.resource")
        done = False
        for f in found:
            for obj in UnityPy.load(f).objects:
                if obj.type.name in ("Sprite", "Texture2D"):
                    im = obj.read().image.convert("RGBA")
                    im.thumbnail((64, 64))
                    im.save(os.path.join(out, a + ".webp"), "WEBP", quality=85)
                    done = True
                    break
            if done:
                break
        got += done
        if not done:
            miss.append(a)
    print("abilities:", got, "new icons; none for", len(miss), ":", ", ".join(miss[:12]))


if __name__ == "__main__":
    main()
