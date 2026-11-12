"""Builds docs/assets/badges/*.webp, the icons of the player badges (see generate_site.compute_badges), from the PNGs of extract_game_sprites.py in
data/raid/asset_preview/: trimmed game icons, the laurel + icon + power-fist cuff badges (books, biggest account), the poop emoji with a golden rim.
Emojis come from Apple Color Emoji (macOS). Run with a Python that has Pillow: `python3 scripts/build_badge_art.py`.
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops
import os
P=os.path.expanduser("~/tacticus-guildwar-tracker/data/raid/asset_preview/")
OUT=os.path.expanduser("~/tacticus-guildwar-tracker/docs/assets/badges/"); os.makedirs(OUT,exist_ok=True)
def L(n): return Image.open(P+n+".png").convert("RGBA")
def emoji(ch, size=160):
    f=ImageFont.truetype("/System/Library/Fonts/Apple Color Emoji.ttc",160)
    im=Image.new("RGBA",(200,200),(0,0,0,0)); ImageDraw.Draw(im).text((20,10),ch,font=f,embedded_color=True)
    return im.crop(im.getbbox())
def fit(im,box):
    s=min(box[0]/im.width,box[1]/im.height); return im.resize((max(1,round(im.width*s)),max(1,round(im.height*s))),Image.LANCZOS)
def square(im,n=256,pad=0):
    c=Image.new("RGBA",(n,n),(0,0,0,0)); t=fit(im,(n-2*pad,n-2*pad)); c.alpha_composite(t,((n-t.width)//2,(n-t.height)//2)); return c
def trim(im):
    return im.crop(im.getbbox())
def save(im,name): im.save(OUT+name+".webp",quality=92,method=6)

# icons as they are
save(square(L("ui_icon_bomb")),"bomb")
save(trim(L("ui_icon_guildwars")),"guildwars")
save(trim(L("ui_icon_menu_achievements")),"achievements")
save(trim(L("ui_icon_power_large")),"power")

# laurel icons: the laurel with the icon on it, and the bottom (cuff) of the power-fist badge under it
cuff=L("ui_icon_power_large"); cuff=cuff.crop((0,138,cuff.width,cuff.height)); cuff=fit(cuff,(132,100))
def laurel_badge(icon_im):
    c=Image.new("RGBA",(256,300),(0,0,0,0))
    c.alpha_composite(cuff,((256-cuff.width)//2,168))   # behind the laurel: only its lower part shows
    lau=fit(L("ui_decor_laurel"),(256,256)); c.alpha_composite(lau,((256-lau.width)//2,4))
    c.alpha_composite(icon_im,((256-icon_im.width)//2,(lau.height-icon_im.height)//2+10))
    return c
save(trim(laurel_badge(fit(L("ui_icon_consumable_xp_book_5"),(206,206)))),"books")

# poop: the emoji, with a dark rim and a golden edge like the game icons
e=fit(emoji("💩"),(190,190))
a=e.getchannel("A")
rim=a.filter(ImageFilter.MaxFilter(9))
gold=Image.new("RGBA",e.size,(0,0,0,0))
g=Image.new("RGBA",(e.width+20,e.height+20),(0,0,0,0))
halo=Image.new("RGBA",g.size,(40,22,6,255)); m=Image.new("L",g.size,0); m.paste(a.filter(ImageFilter.MaxFilter(13)),(10,10)); g.paste(halo,(0,0),m)
m2=Image.new("L",g.size,0); m2.paste(a.filter(ImageFilter.MaxFilter(7)),(10,10)); gl=Image.new("RGBA",g.size,(214,160,60,255)); g.paste(gl,(0,0),m2)
g.alpha_composite(e,(10,10))
save(square(g),"poop")

# whale emoji on the laurel, like the books
save(trim(laurel_badge(fit(emoji("🐳"),(176,176)))),"whale")
print("ok")
