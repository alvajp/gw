"""
Tiny reader for the fixed `<war>.maps.yaml` shape used in data/wars/:
top-level scalars (season:, war_number:) plus hard:/easy: nested blocks,
each mapping zone_type -> map name. Not a general YAML parser -- avoids
adding a PyYAML dependency for a format this simple and unlikely to
change shape.
"""


def load_maps(path):
    result = {"hard": {}, "easy": {}}
    current = None
    with open(path, encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.rstrip("\n")
            if not line.strip() or line.strip().startswith("#"):
                continue
            if not line.startswith(" "):
                key, _, value = line.partition(":")
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if value:
                    result[key] = value
                    current = None
                else:
                    current = key if key in ("hard", "easy") else None
                continue
            if current is None:
                continue
            zone_type, _, value = line.strip().partition(":")
            zone_type = zone_type.strip()
            value = value.strip().strip('"').strip("'")
            if zone_type and value:
                result[current][zone_type] = value
    return result
