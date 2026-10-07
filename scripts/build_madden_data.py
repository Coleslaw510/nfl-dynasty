#!/usr/bin/env python3
"""Fetch TeamCrafters Madden 26 Super Bowl ratings → data/league.json

Source: https://www.teamcrafters.net/rosters/MADDEN26/23-super-bowl
Open published HTML only (same approach as CFB sim). Age estimated from
listed NFL experience years (class field like "7 Years").
"""
from __future__ import annotations
import json, os, re, ssl, time, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "league.json")
VERSION = "23-super-bowl"
BASE = f"https://www.teamcrafters.net/rosters/MADDEN26/{VERSION}"
CTX = ssl.create_default_context()
UA = {"User-Agent": "Mozilla/5.0 nfl-dynasty/1.0 (personal fan tool; +https://github.com/Coleslaw510/nfl-dynasty)"}

# TeamCrafters numeric IDs discovered from the roster hub (26551 = Free Agents)
TEAM_IDS = list(range(26519, 26552))

POS_BUCKET = {
    "QB": "QB",
    "HB": "RB", "FB": "RB", "RB": "RB",
    "WR": "WR",
    "TE": "TE",
    "LT": "OL", "LG": "OL", "C": "OL", "RG": "OL", "RT": "OL",
    "OL": "OL", "OT": "OL", "OG": "OL", "G": "OL", "T": "OL",
    "LE": "DL", "RE": "DL", "DT": "DL", "NT": "DL", "DL": "DL", "DE": "DL",
    "LEDG": "EDGE", "REDG": "EDGE", "ED": "EDGE",
    "LOLB": "LB", "MLB": "LB", "ROLB": "LB", "LB": "LB", "ILB": "LB", "OLB": "LB",
    "CB": "DB", "FS": "DB", "SS": "DB", "DB": "DB", "S": "DB", "NB": "DB",
    "K": "K", "PK": "K",
    "P": "P",
}

# Slim dynasty depth: starters + limited backups
STARTER_ORDER = {
    "QB": 1, "RB": 1, "WR": 3, "TE": 1,
    "OL": 5, "EDGE": 2, "DL": 2, "LB": 3, "DB": 4, "K": 1, "P": 1,
}
BACKUP_ORDER = {
    "QB": 1, "RB": 1, "WR": 1, "TE": 1,
    "OL": 1, "EDGE": 1, "DL": 1, "LB": 1, "DB": 1, "K": 0, "P": 0,
}

DIVISIONS = {
    "AFC East": ["Buffalo Bills", "Miami Dolphins", "New England Patriots", "New York Jets"],
    "AFC North": ["Baltimore Ravens", "Cincinnati Bengals", "Cleveland Browns", "Pittsburgh Steelers"],
    "AFC South": ["Houston Texans", "Indianapolis Colts", "Jacksonville Jaguars", "Tennessee Titans"],
    "AFC West": ["Denver Broncos", "Kansas City Chiefs", "Las Vegas Raiders", "Los Angeles Chargers"],
    "NFC East": ["Dallas Cowboys", "New York Giants", "Philadelphia Eagles", "Washington Commanders"],
    "NFC North": ["Chicago Bears", "Detroit Lions", "Green Bay Packers", "Minnesota Vikings"],
    "NFC South": ["Atlanta Falcons", "Carolina Panthers", "New Orleans Saints", "Tampa Bay Buccaneers"],
    "NFC West": ["Arizona Cardinals", "Los Angeles Rams", "San Francisco 49ers", "Seattle Seahawks"],
}

ABBR = {
    "Arizona Cardinals": "ARI", "Atlanta Falcons": "ATL", "Baltimore Ravens": "BAL",
    "Buffalo Bills": "BUF", "Carolina Panthers": "CAR", "Chicago Bears": "CHI",
    "Cincinnati Bengals": "CIN", "Cleveland Browns": "CLE", "Dallas Cowboys": "DAL",
    "Denver Broncos": "DEN", "Detroit Lions": "DET", "Green Bay Packers": "GB",
    "Houston Texans": "HOU", "Indianapolis Colts": "IND", "Jacksonville Jaguars": "JAX",
    "Kansas City Chiefs": "KC", "Las Vegas Raiders": "LV", "Los Angeles Chargers": "LAC",
    "Los Angeles Rams": "LAR", "Miami Dolphins": "MIA", "Minnesota Vikings": "MIN",
    "New England Patriots": "NE", "New Orleans Saints": "NO", "New York Giants": "NYG",
    "New York Jets": "NYJ", "Philadelphia Eagles": "PHI", "Pittsburgh Steelers": "PIT",
    "San Francisco 49ers": "SF", "Seattle Seahawks": "SEA", "Tampa Bay Buccaneers": "TB",
    "Tennessee Titans": "TEN", "Washington Commanders": "WAS",
}

COLORS = {
    "ARI": "#97233F", "ATL": "#A71930", "BAL": "#241773", "BUF": "#00338D",
    "CAR": "#0085CA", "CHI": "#0B162A", "CIN": "#FB4F14", "CLE": "#311D00",
    "DAL": "#003594", "DEN": "#FB4F14", "DET": "#0076B6", "GB": "#203731",
    "HOU": "#03202F", "IND": "#002C5F", "JAX": "#006778", "KC": "#E31837",
    "LV": "#000000", "LAC": "#0080C6", "LAR": "#003594", "MIA": "#008E97",
    "MIN": "#4F2683", "NE": "#002244", "NO": "#D3BC8D", "NYG": "#0B2265",
    "NYJ": "#125740", "PHI": "#004C54", "PIT": "#FFB612", "SF": "#AA0000",
    "SEA": "#002244", "TB": "#D50A0A", "TEN": "#0C2340", "WAS": "#5A1414",
}


def get(url, retries=4):
    last = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, context=CTX, timeout=60) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:
            last = e
            time.sleep(0.35 * (attempt + 1))
    raise last


def extract_array(s: str):
    depth = 0
    in_str = False
    esc = False
    for i, ch in enumerate(s):
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                return s[: i + 1]
    return None


def unescape_push(script: str):
    m = re.search(r'self\.__next_f\.push\(\[1,"(.*)"\]\)', script, re.S)
    if not m:
        return None
    return bytes(m.group(1), "utf-8").decode("unicode_escape")


def parse_players(html: str):
    scripts = re.findall(r"<script[^>]*>(.*?)</script>", html, re.S)
    for s in sorted(scripts, key=len, reverse=True):
        if "firstName" not in s and "OVR" not in s:
            continue
        u = unescape_push(s)
        if not u or '"players":[' not in u:
            continue
        idx = u.find('"players":[')
        arr = extract_array(u[idx + 10 :])
        if not arr:
            continue
        try:
            return json.loads(arr)
        except json.JSONDecodeError:
            continue
    return []


def parse_team_name(html: str, tid: int):
    m = re.search(r'"@type":"SportsTeam"[^}]*?"name":"([^"]+)"', html)
    if m:
        return m.group(1)
    m = re.search(r"<title>([^<]+?) Madden", html)
    if m:
        short = m.group(1).strip()
        # map city/short → full
        for full in ABBR:
            if full.startswith(short) or short in full:
                return full
        return short
    return f"Team {tid}"


def exp_years(cls: str) -> int:
    if not cls:
        return 1
    m = re.search(r"(\d+)", str(cls))
    return int(m.group(1)) if m else 1


def estimate_age(exp: int, pos: str) -> int:
    # Rough NFL age from experience; rookies ~22
    base = 22 + max(0, exp - 1)
    if pos in ("K", "P") and exp >= 8:
        base += 2
    return max(21, min(44, base))


def salary_for(ovr: int, age: int, years: int) -> int:
    # Annual salary in dollars (simplified Madden-ish)
    base = 800_000 + max(0, ovr - 55) ** 2 * 18_000
    if ovr >= 90:
        base += (ovr - 89) * 1_800_000
    if ovr >= 95:
        base += (ovr - 94) * 2_500_000
    if age >= 32:
        base = int(base * 0.92)
    return int(round(base / 10_000) * 10_000)


def contract_years(ovr: int, age: int) -> int:
    if age >= 34:
        return 1
    if age >= 31:
        return 2 if ovr >= 80 else 1
    if ovr >= 90:
        return 5
    if ovr >= 82:
        return 4
    if ovr >= 74:
        return 3
    return 2


def slim_roster(raw_players: list) -> list:
    """Keep starters + limited backups; drop practice-squad depth."""
    buckets: dict[str, list] = {}
    for p in raw_players:
        if p.get("isFiller"):
            continue
        pos = p.get("POS") or ""
        bucket = POS_BUCKET.get(pos)
        if not bucket:
            continue
        buckets.setdefault(bucket, []).append(p)
    for b in buckets:
        buckets[b].sort(key=lambda x: (-int(x.get("OVR") or 0), x.get("lastName") or ""))

    kept = []
    for bucket, starters in STARTER_ORDER.items():
        backups = BACKUP_ORDER.get(bucket, 0)
        need = starters + backups
        for p in buckets.get(bucket, [])[:need]:
            exp = exp_years(p.get("class") or "")
            age = estimate_age(exp, bucket if bucket not in ("EDGE",) else "DL")
            ovr = int(p.get("OVR") or 60)
            years = contract_years(ovr, age)
            kept.append({
                "id": int(p["id"]),
                "n": f'{p.get("firstName","").strip()} {p.get("lastName","").strip()}'.strip(),
                "pos": p.get("POS") or bucket,
                "bucket": bucket,
                "j": str(p.get("number") or ""),
                "ovr": ovr,
                "age": age,
                "exp": exp,
                "yearsLeft": years,
                "salary": salary_for(ovr, age, years),
                "spd": int(p.get("SPD") or 0) or None,
            })
    return kept


def team_strength(players: list) -> dict:
    if not players:
        return {"ovr": 70, "off": 70, "def": 70}
    off_b = {"QB", "RB", "WR", "TE", "OL"}
    def_b = {"EDGE", "DL", "LB", "DB"}
    offs = [p["ovr"] for p in players if p["bucket"] in off_b]
    defs = [p["ovr"] for p in players if p["bucket"] in def_b]
    offs.sort(reverse=True)
    defs.sort(reverse=True)
    off = round(sum(offs[:11]) / max(1, min(11, len(offs)))) if offs else 70
    deff = round(sum(defs[:11]) / max(1, min(11, len(defs)))) if defs else 70
    ovr = round(off * 0.52 + deff * 0.48)
    return {"ovr": ovr, "off": off, "def": deff}


def fetch_team(tid: int):
    cache = os.path.join(DATA if False else os.path.join(ROOT, "data", "_cache"), f"{tid}.html")
    cache = os.path.join(ROOT, "data", "_cache", f"{tid}.html")
    if os.path.exists(cache) and os.path.getsize(cache) > 50000:
        html = open(cache, encoding="utf-8", errors="replace").read()
    else:
        html = get(f"{BASE}/{tid}")
        os.makedirs(os.path.dirname(cache), exist_ok=True)
        open(cache, "w", encoding="utf-8").write(html)
    name = parse_team_name(html, tid)
    players = parse_players(html)
    return tid, name, players


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    results = {}
    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = {ex.submit(fetch_team, tid): tid for tid in TEAM_IDS}
        for fut in as_completed(futs):
            tid, name, players = fut.result()
            results[tid] = (name, players)
            print(f"  {tid} {name}: {len(players)} raw")

    # Map division info
    name_to_div = {}
    name_to_conf = {}
    for div, names in DIVISIONS.items():
        conf = div.split()[0]
        for n in names:
            name_to_div[n] = div
            name_to_conf[n] = conf

    teams = []
    free_agents = []
    for tid, (name, raw) in sorted(results.items(), key=lambda x: x[1][0]):
        if name == "Free Agents" or "Free Agent" in name:
            for p in raw:
                if p.get("isFiller"):
                    continue
                pos = p.get("POS") or ""
                bucket = POS_BUCKET.get(pos)
                if not bucket:
                    continue
                exp = exp_years(p.get("class") or "")
                age = estimate_age(exp, bucket)
                ovr = int(p.get("OVR") or 60)
                free_agents.append({
                    "id": int(p["id"]),
                    "n": f'{p.get("firstName","").strip()} {p.get("lastName","").strip()}'.strip(),
                    "pos": pos,
                    "bucket": bucket,
                    "j": str(p.get("number") or ""),
                    "ovr": ovr,
                    "age": age,
                    "exp": exp,
                    "yearsLeft": 0,
                    "salary": salary_for(ovr, age, 1),
                    "asking": int(salary_for(ovr, age, 1) * 1.05),
                })
            continue
        # Normalize short city names to full franchise names
        full = name
        if name not in ABBR:
            for cand in ABBR:
                if cand.startswith(name + " ") or cand == name:
                    full = cand
                    break
            else:
                # title was city only e.g. "Buffalo"
                for cand in ABBR:
                    if cand.split()[0] == name or (name == "New York" and "Jets" in cand):
                        # ambiguous NY — leave as-is and fix below
                        pass
                # Prefer schema full name already; if city-only, match uniquely
                matches = [c for c in ABBR if c.startswith(name)]
                if len(matches) == 1:
                    full = matches[0]
                elif name == "New York":
                    # Can't know — check player stars? skip special case handled by schema
                    full = name
                elif name == "Los Angeles":
                    matches = [c for c in ABBR if "Los Angeles" in c]
                    full = name  # schema should have full

        # Re-parse using schema preference already in parse_team_name
        if full not in ABBR:
            # try contains
            matches = [c for c in ABBR if name in c]
            if len(matches) == 1:
                full = matches[0]

        slim = slim_roster(raw)
        ratings = team_strength(slim)
        abbr = ABBR.get(full, name[:3].upper())
        teams.append({
            "id": str(tid),
            "tcId": tid,
            "name": full if full in ABBR else name,
            "abbr": abbr,
            "city": (full if full in ABBR else name).rsplit(" ", 1)[0] if full in ABBR else name,
            "nick": (full if full in ABBR else name).split(" ")[-1],
            "conference": name_to_conf.get(full) or name_to_conf.get(name) or "?",
            "division": name_to_div.get(full) or name_to_div.get(name) or "?",
            "color": COLORS.get(abbr, "#333333"),
            "ratings": ratings,
            "roster": slim,
        })

    # Fix any unresolved names using division membership count
    known = {t["name"] for t in teams}
    missing = [n for n in ABBR if n not in known]
    if missing:
        print("WARNING missing teams:", missing)

    free_agents.sort(key=lambda p: -p["ovr"])
    # Cap FA pool size for v1 UI
    free_agents = free_agents[:180]

    # Cap figure (approximate 2025/26 style, in dollars)
    payload = {
        "source": BASE,
        "sourceLabel": "TeamCrafters Madden 26 Super Bowl ratings",
        "rosterVersion": VERSION,
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "salaryCap": 255_400_000,
        "seasonYear": 2026,
        "teamCount": len(teams),
        "playerCount": sum(len(t["roster"]) for t in teams),
        "freeAgentCount": len(free_agents),
        "teams": sorted(teams, key=lambda t: (t["conference"], t["division"], t["name"])),
        "freeAgents": free_agents,
        "divisions": DIVISIONS,
        "notes": [
            "Player OVRs from TeamCrafters published Madden 26 Super Bowl roster pages.",
            "Ages estimated from listed NFL experience years (not exact DOB).",
            "Contracts and salaries are simplified dynasty values, not real NFL contracts.",
            "Rosters trimmed to starters + ~1 backup per position group.",
        ],
    }
    with open(OUT, "w") as f:
        json.dump(payload, f, separators=(",", ":"))
    print(f"Wrote {OUT}: {payload['teamCount']} teams, {payload['playerCount']} rostered, {payload['freeAgentCount']} FA")


if __name__ == "__main__":
    main()
