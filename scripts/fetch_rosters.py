"""
Fetch every guild member's roster from the official Tacticus API and store the
raw responses in data/rosters/<user_id>.json (git-ignored).

The API keys live in ~/.config/tacticus-guildwar/keys.json, outside the
repository: {"psychos": [{"name": ..., "user_id": ..., "api_key": ...}]} ("players" is still read for the older layout).
A player with an empty api_key is skipped. Keys are never printed or written
anywhere else; only the player data (units, progress) is kept.

The second guild (--guild=cabale) lives in the same file under "cabale": [{"name": ..., "api_key": ...}] -- its members' user ids are
not known (the API does not give them, and there is no guild key to list them), so the id of a page is derived from the key's hash (stable as long as the
key is not renewed; an optional "user_id" in the entry wins). Its rosters go to data/rosters-cabale/.

Usage: python3 scripts/fetch_rosters.py [--guild=cabale] [--strict] [name-or-user-id ...]   (names / ids given: only those members)   (--strict: exit 1 if any member failed, used by the daily GitHub workflow)
"""
import hashlib
import json
import os
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GUILD = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--guild=")), "ljp")
GUILD_KEYS = {"ljp": ("psychos", "players"), "cabale": ("cabale", "Cabale")}  # where each guild's members are in keys.json
OUT_DIR = os.path.join(ROOT, "data", "rosters" if GUILD == "ljp" else f"rosters-{GUILD}")
KEYS = os.path.expanduser("~/.config/tacticus-guildwar/keys.json")
URL = "https://api.tacticusgame.com/api/v1/player"
UA = "tacticus-guildwar-tracker (personal guild stats site)"


def fetch(api_key, attempts=3):
    """One roster; a slow or dropped connection (socket.timeout is an OSError on Python 3.9) is retried, HTTP errors are not."""
    req = urllib.request.Request(URL, headers={"X-API-KEY": api_key, "User-Agent": UA})
    for n in range(attempts):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError:
            raise
        except (OSError, ValueError):
            if n == attempts - 1:
                raise
            time.sleep(2 * (n + 1))


def main():
    if not os.path.exists(KEYS):
        sys.exit(f"Missing {KEYS}")
    with open(KEYS, encoding="utf-8") as f:
        keys = json.load(f)
    players = []
    for name in GUILD_KEYS[GUILD]:  # the section of the guild: a list of members (or {"players": [...]} in the older layout)
        section = keys.get(name)
        players = (section.get("players") if isinstance(section, dict) else section) or []
        if players:
            break
    if GUILD != "ljp":
        for p in players:
            h = hashlib.sha256((p.get("api_key") or "").encode()).hexdigest()
            p.setdefault("user_id", f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}")
    os.makedirs(OUT_DIR, exist_ok=True)
    only = [a.lower() for a in sys.argv[1:] if not a.startswith("--")]  # optional: refresh only these members (name or user id)
    ok, failed = 0, []
    for p in players:
        label = p.get("name") or p["user_id"]
        if only and not any(o in (p.get("name") or "").lower() or o == p["user_id"].lower() or p["user_id"].lower().startswith(o) for o in only):
            continue
        if not p.get("api_key") or not p.get("user_id"):
            failed.append((label, "no key"))
            continue
        try:
            data = fetch(p["api_key"])
        except urllib.error.HTTPError as e:
            failed.append((label, f"HTTP {e.code}"))
            continue
        except (OSError, ValueError) as e:
            failed.append((label, type(e).__name__))
            continue
        data["userId"] = p["user_id"]
        with open(os.path.join(OUT_DIR, p["user_id"] + ".json"), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
        ok += 1
        print("ok", data["player"]["details"]["name"], len(data["player"]["units"]), "units")
        time.sleep(0.3)
    print(f"{ok} roster(s) saved in {OUT_DIR}")
    for label, why in failed:
        print("FAILED", label, why)
    if failed and "--strict" in sys.argv:  # CI: a partial member list must not be published
        sys.exit(1)


if __name__ == "__main__":
    main()
