"""Extract sprites from the installed game (not part of the generator, run by hand): list wanted sprite names in `want`, run it, the PNGs land in the
git-ignored data/raid/asset_preview/ with a contact sheet (sheet.png).

Source: the Unity asset bundles of the Tacticus launcher's cache, ~/Library/Caches/tacticus/games/<id>/Tacticus.app/.../StreamingAssets/Bundles
(atlases/main_*.resource holds most UI icons and decors). Needs UnityPy, e.g. `python3 -m venv /tmp/uv && /tmp/uv/bin/pip install UnityPy Pillow`; the bundles
carry no Unity version, hence the fallback (read it from `strings .../Data/globalgamemanagers | grep 6000`). Game art belongs to Snowprint Studios / Games Workshop.
"""
import UnityPy, glob, os, sys
from PIL import Image, ImageDraw
UnityPy.config.FALLBACK_UNITY_VERSION = "6000.3.13f1"
B=os.path.expanduser("~/Library/Caches/tacticus/games/if2c19sn6g/Tacticus.app/Contents/Resources/Data/StreamingAssets/Bundles")
want=["ui_icon_bomb","ui_icon_guild_resource_orbitalBombardment_large","ui_icon_consumable_xp_book_5","ui_icon_consumable_xp_book_5_mythic_frame","ui_icon_power_large","ui_icon_defencepower_large","ui_decor_power_level","button_special_powerLevelUp","ui_icon_pvp_trophy_large","ui_icon_pvp_trophy_default","ui_decor_laurel","ui_decor_skull","ui_decor_eagle_gold","ui_bes_medal","ui_campaign_medal","ui_icon_playerbook","ui_icon_ForgeBadge","ui_icon_menu_achievements","ui_icon_menu_guildboss","ui_icon_guildwars","ui_icon_rank_mythic_01","ui_icon_rank_diamond_01","ui_decor_wings_middle_skull","ui_decor_wing_legendary_big","ui_Icon_Crossmark","ui_icon_resource_crusade_bomb_large","ui_ability_badges_mythic","ui_forge_badges_mythic","ui_decor_bes_laurel","ui_decor_bes_skull","ui_decor_bes_wing","ui_icon_stat_dmg_01_hud","ui_icon_pvp_league_9","ui_icon_pvp_league_8","ui_icon_dmg_prediction_skull","ui_icon_resource_coin_large"]
found={}
for f in glob.glob(B+"/**/*.resource",recursive=True):
    if any(x in f for x in ("/product_images/","/offers/","/droptables/","/fonts/","/languages/","/videos/","/envmaps/","/fx/","/scenes/","/boards/","/stages/")): continue
    try: env=UnityPy.load(f)
    except Exception: continue
    for o in env.objects:
        if o.type.name=="Sprite":
            try:
                s=o.read()
                if s.m_Name in want and s.m_Name not in found: found[s.m_Name]=s.image.convert("RGBA")
            except Exception as e: pass
    if len(found)==len(want): break
print(len(found), [w for w in want if w not in found])
out="/Users/pierrebigjean/tacticus-guildwar-tracker/data/raid/asset_preview"; os.makedirs(out,exist_ok=True)
cell=150; cols=6; rows=(len(found)+cols-1)//cols
sheet=Image.new("RGBA",(cols*cell,rows*(cell+28)),(30,32,40,255)); d=ImageDraw.Draw(sheet)
for i,(n,im) in enumerate(found.items()):
    im.save(f"{out}/{n}.png")
    t=im.copy(); t.thumbnail((cell-12,cell-12))
    x,y=(i%cols)*cell,(i//cols)*(cell+28)
    sheet.alpha_composite(t,(x+(cell-t.width)//2,y+6+(cell-12-t.height)//2))
    d.text((x+4,y+cell-2),n.replace("ui_icon_","").replace("ui_decor_","d_")[:26],fill=(220,220,220,255))
sheet.save(f"{out}/sheet.png"); print(sheet.size)
