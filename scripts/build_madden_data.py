#!/usr/bin/env python3
"""Fetch TeamCrafters Madden 27 ratings → data/league.json

Primary source mirrors EA Madden ratings (https://www.ea.com/games/madden-nfl/ratings)
via TeamCrafters open roster pages:
  https://www.teamcrafters.net/rosters/MADDEN27/10-01-26

Also embeds the real 2026 NFL regular-season schedule from ESPN's public scoreboard API.
Ages estimated from listed NFL experience years. Contracts are simplified dynasty values.
"""
from __future__ import annotations
import json, os, re, ssl, time, urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "data", "league.json")
CACHE = os.path.join(ROOT, "data", "_cache")
VERSION = "10-01-26"
BASE = f"https://www.teamcrafters.net/rosters/MADDEN27/{VERSION}"
EA_RATINGS = "https://www.ea.com/games/madden-nfl/ratings"
CTX = ssl.create_default_context()
UA = {"User-Agent": "Mozilla/5.0 nfl-dynasty/1.1 (personal fan tool; +https://github.com/Coleslaw510/nfl-dynasty)"}

TEAM_IDS = list(range(26519, 26552))  # 26551 = Free Agents

POS_BUCKET = {
    "QB": "QB",
    "HB": "RB", "FB": "RB", "RB": "RB",
    "WR": "WR",
    "TE": "TE",
    "LT": "OL", "LG": "OL", "C": "OL", "RG": "OL", "RT": "OL",
    "OL": "OL", "OT": "OL", "OG": "OL", "G": "OL", "T": "OL",
    "LE": "DL", "RE": "DL", "DT": "DL", "NT": "DL", "DL": "DL", "DE": "DL",
    "LEDG": "EDGE", "REDG": "EDGE", "ED": "EDGE", "LOLB": "EDGE", "ROLB": "EDGE",
    "MLB": "LB", "LB": "LB", "ILB": "LB", "OLB": "LB",
    "CB": "DB", "FS": "DB", "SS": "DB", "DB": "DB", "S": "DB", "NB": "DB",
    "K": "K", "PK": "K",
    "P": "P",
    "LS": "LS",
}

# Full 53-man depth targets by bucket (starters + backups)
ROSTER_DEPTH = {
    "QB": 3, "RB": 4, "WR": 6, "TE": 3, "OL": 9,
    "EDGE": 4, "DL": 5, "LB": 6, "DB": 10, "K": 1, "P": 1, "LS": 1,
}  # sums to 53

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

# ESPN scoreboard uses WSH for Washington
ESPN_ABBR = {"WSH": "WAS"}

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
            time.sleep(0.4 * (attempt + 1))
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
    base = 22 + max(0, exp - 1)
    if pos in ("K", "P", "LS") and exp >= 8:
        base += 2
    return max(21, min(44, base))


def salary_for(ovr: int, age: int, years: int, exp: int | None = None) -> int:
    """Simplified dynasty AAV. Tuned so a typical 53-man sits near/under $255M."""
    anchors = [
        (55, 850_000), (60, 1_050_000), (65, 1_400_000), (70, 2_000_000),
        (75, 3_600_000), (80, 6_800_000), (85, 11_000_000), (90, 16_500_000),
        (93, 21_500_000), (96, 26_500_000), (99, 32_000_000),
    ]
    o = max(55, min(99, int(ovr)))
    base = anchors[-1][1]
    for i in range(len(anchors) - 1):
        a0, s0 = anchors[i]
        a1, s1 = anchors[i + 1]
        if a0 <= o <= a1:
            t = 0 if a1 == a0 else (o - a0) / (a1 - a0)
            base = s0 + (s1 - s0) * t
            break
    if age >= 34:
        base *= 0.8
    elif age >= 31:
        base *= 0.88
    e = 99 if exp is None else int(exp)
    if e <= 3 and ovr < 94:
        base *= 0.32 if e <= 1 else (0.4 if e == 2 else 0.5)
    elif e <= 4 and ovr < 90:
        base *= 0.58
    if ovr < 70:
        base = min(base, 1_500_000)
    if ovr < 65:
        base = min(base, 1_100_000)
    return int(round(base / 50_000) * 50_000)


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


def player_row(p: dict, bucket: str) -> dict:
    exp = exp_years(p.get("class") or "")
    age = estimate_age(exp, bucket)
    ovr = int(p.get("OVR") or 60)
    years = contract_years(ovr, age)
    return {
        "id": int(p["id"]),
        "n": f'{p.get("firstName","").strip()} {p.get("lastName","").strip()}'.strip(),
        "pos": p.get("POS") or bucket,
        "bucket": bucket,
        "j": str(p.get("number") or ""),
        "ovr": ovr,
        "age": age,
        "exp": exp,
        "yearsLeft": years,
        "salary": salary_for(ovr, age, years, exp),
        "spd": int(p.get("SPD") or 0) or None,
    }


def full_roster(raw_players: list) -> list:
    """Keep a full 53-man roster by position depth, then fill leftovers by OVR."""
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

    kept_ids = set()
    kept = []
    for bucket, need in ROSTER_DEPTH.items():
        for p in buckets.get(bucket, [])[:need]:
            row = player_row(p, bucket)
            kept.append(row)
            kept_ids.add(row["id"])

    if len(kept) < 53:
        rest = []
        for bucket, plist in buckets.items():
            for p in plist:
                pid = int(p["id"])
                if pid in kept_ids:
                    continue
                rest.append(player_row(p, bucket))
        rest.sort(key=lambda x: (-x["ovr"], x["n"]))
        for row in rest:
            if len(kept) >= 53:
                break
            kept.append(row)
            kept_ids.add(row["id"])

    # Prefer position order then OVR
    order = list(ROSTER_DEPTH.keys())
    kept.sort(key=lambda p: (order.index(p["bucket"]) if p["bucket"] in order else 99, -p["ovr"], p["n"]))
    return kept[:53]


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
    cache = os.path.join(CACHE, f"m27_{VERSION}_{tid}.html")
    if os.path.exists(cache) and os.path.getsize(cache) > 40000:
        html = open(cache, encoding="utf-8", errors="replace").read()
    else:
        html = get(f"{BASE}/{tid}")
        os.makedirs(CACHE, exist_ok=True)
        open(cache, "w", encoding="utf-8").write(html)
    name = parse_team_name(html, tid)
    players = parse_players(html)
    return tid, name, players


def resolve_full_name(name: str) -> str:
    if name in ABBR:
        return name
    matches = [c for c in ABBR if c.startswith(name) or name in c]
    if len(matches) == 1:
        return matches[0]
    return name


def fetch_espn_schedule():
    cache = os.path.join(CACHE, "espn_2026_schedule.json")
    if os.path.exists(cache):
        return json.load(open(cache))
    games = []
    for w in range(1, 19):
        url = f"https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?year=2026&seasontype=2&week={w}"
        raw = json.loads(get(url))
        for e in raw.get("events") or []:
            comps = e.get("competitions") or []
            if not comps:
                continue
            home = away = None
            for t in comps[0].get("competitors") or []:
                abbr = t.get("team", {}).get("abbreviation")
                abbr = ESPN_ABBR.get(abbr, abbr)
                if t.get("homeAway") == "home":
                    home = abbr
                else:
                    away = abbr
            if home and away:
                games.append({"week": w, "home": home, "away": away, "date": e.get("date")})
    open(cache, "w").write(json.dumps(games))
    return games


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    os.makedirs(CACHE, exist_ok=True)
    results = {}
    with ThreadPoolExecutor(max_workers=8) as ex:
        futs = {ex.submit(fetch_team, tid): tid for tid in TEAM_IDS}
        for fut in as_completed(futs):
            tid, name, players = fut.result()
            results[tid] = (name, players)
            print(f"  {tid} {name}: {len(players)} raw")

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
                row = player_row(p, bucket)
                row["yearsLeft"] = 0
                row["asking"] = int(row["salary"] * 1.05)
                free_agents.append(row)
            continue

        full = resolve_full_name(name)
        roster = full_roster(raw)
        ratings = team_strength(roster)
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
            "roster": roster,
        })

    known = {t["name"] for t in teams}
    missing = [n for n in ABBR if n not in known]
    if missing:
        print("WARNING missing teams:", missing)

    free_agents.sort(key=lambda p: -p["ovr"])
    free_agents = free_agents[:220]

    espn_games = fetch_espn_schedule()
    schedule2026 = [{"week": g["week"], "home": ESPN_ABBR.get(g["home"], g["home"]),
                     "away": ESPN_ABBR.get(g["away"], g["away"])} for g in espn_games]

    payload = {
        "source": BASE,
        "eaRatings": EA_RATINGS,
        "sourceLabel": "TeamCrafters Madden 27 · 10/1/26 Update (EA Madden ratings)",
        "rosterVersion": VERSION,
        "fetchedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "salaryCap": 255_000_000,
        "seasonYear": 2026,
        "regularWeeks": 18,
        "rosterLimit": 53,
        "teamCount": len(teams),
        "playerCount": sum(len(t["roster"]) for t in teams),
        "freeAgentCount": len(free_agents),
        "teams": sorted(teams, key=lambda t: (t["conference"], t["division"], t["name"])),
        "freeAgents": free_agents,
        "divisions": DIVISIONS,
        "schedule2026": schedule2026,
        "notes": [
            "Player OVRs from TeamCrafters published Madden 27 10/1/26 Update roster pages (mirrors EA Madden ratings).",
            "EA ratings hub: https://www.ea.com/games/madden-nfl/ratings",
            "Ages estimated from listed NFL experience years (not exact DOB).",
            "Contracts and salaries are simplified dynasty values, not real NFL contracts.",
            "Year-1 schedule is the real 2026 NFL regular season (ESPN scoreboard API); later years are generated.",
            "Rosters trimmed to a full 53-man active roster by position depth.",
        ],
    }
    with open(OUT, "w") as f:
        json.dump(payload, f, separators=(",", ":"))
    counts = sorted({len(t["roster"]) for t in teams})
    print(f"Wrote {OUT}: {payload['teamCount']} teams, {payload['playerCount']} rostered, "
          f"{payload['freeAgentCount']} FA, schedule games={len(schedule2026)}, roster sizes={counts}")
    # Sample CHI
    chi = next(t for t in teams if t["abbr"] == "CHI")
    print("CHI sample:", [(p["pos"], p["n"], p["ovr"]) for p in chi["roster"][:6]], "n=", len(chi["roster"]))


if __name__ == "__main__":
    main()
