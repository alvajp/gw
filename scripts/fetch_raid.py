#!/usr/bin/env python3
"""Fetch the guild raid history (every season from FIRST_SEASON to the latest) from the official Tacticus API with the guild key and store the raw
answers in data/raid/season-<n>.json (git-ignored). The key lives in ~/.config/tacticus-guildwar/keys.json under
{"Guild": {"api_key": ...}} (same file as the players' keys; never printed, never written anywhere else).

Usage: python3 scripts/fetch_raid.py
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "data", "raid")
KEYS = os.path.expanduser("~/.config/tacticus-guildwar/keys.json")
BASE = "https://api.tacticusgame.com/api/v1/"
UA = "tacticus-guildwar-tracker (personal guild stats site)"
FIRST_SEASON = 82   # the history kept for the medals starts here (the API answers for any past season)


def call(path, key, attempts=3):
    req = urllib.request.Request(BASE + path, headers={"X-API-KEY": key, "User-Agent": UA})
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
        key = (json.load(f).get("Guild") or {}).get("api_key")
    if not key:
        sys.exit('No "Guild" api_key in keys.json')
    os.makedirs(OUT_DIR, exist_ok=True)
    try:
        latest = max(call("guild", key)["guild"]["guildRaidSeasons"])
        for season in range(FIRST_SEASON, latest + 1):
            data = call(f"guildRaid/{season}", key)
            with open(os.path.join(OUT_DIR, f"season-{season}.json"), "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
            print(f"ok season {season}: {len(data['entries'])} attacks")
            time.sleep(0.3)
    except urllib.error.HTTPError as e:
        sys.exit(f"FAILED HTTP {e.code}")
    except (OSError, ValueError) as e:
        sys.exit(f"FAILED {type(e).__name__}")


if __name__ == "__main__":
    main()
