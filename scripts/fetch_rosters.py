"""
Fetch every guild member's roster from the official Tacticus API and store the
raw responses in data/rosters/<user_id>.json (git-ignored).

The API keys live in ~/.config/tacticus-guildwar/keys.json, outside the
repository: {"players": [{"name": ..., "user_id": ..., "api_key": ...}]}.
A player with an empty api_key is skipped. Keys are never printed or written
anywhere else; only the player data (units, progress) is kept.

Usage: python3 scripts/fetch_rosters.py
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data", "rosters")
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
        players = json.load(f)["players"]
    os.makedirs(OUT_DIR, exist_ok=True)
    ok, failed = 0, []
    for p in players:
        label = p.get("name") or p["user_id"]
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


if __name__ == "__main__":
    main()
