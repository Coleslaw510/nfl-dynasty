# NFL Dynasty

Classic NFL dynasty sim (no all-time shop) — sibling to [CFB Season Sim](https://coleslaw510.github.io/cfb-sim/).

**Live:** https://coleslaw510.github.io/nfl-dynasty/

## Features

- Mode picker (CFB Season Sim ↔ NFL Dynasty)
- All 32 real NFL teams
- **Full 53-man rosters** (starters + backups)
- Player OVRs from **TeamCrafters Madden 27 · 10/1/26 Update** (mirrors [EA Madden ratings](https://www.ea.com/games/madden-nfl/ratings))  
  Source: https://www.teamcrafters.net/rosters/MADDEN27/10-01-26  
  Ages estimated from listed NFL experience years (not DOBs)
- Simplified salary cap (~$255M), contracts, free agency, 3-round draft
- **Year 1 = real 2026 NFL regular-season schedule** (ESPN scoreboard API; 18 weeks with byes). Later seasons are generated with division opponents 2×.
- NFL playoffs through Super Bowl
- Offseason aging: improve through ~age 28, regress in the 30s, some retirements
- Contract years decrement each offseason
- Roster tab sortable by Pos / Player / OVR / Age / Yrs / Salary
- Clean tabbed UI: Schedule · Roster · Standings · Cap · History

## Out of scope (for now)

- Practice squad
- Real NFL contract structures (signing bonus, dead money, restructures)
- Trade block / multiplayer
- Exact DOB ages / injury system / play-calling
- All-time shop (intentionally CFB-only)
- Full 7-round draft (currently 3 rounds)

## Rebuild roster data

```bash
python3 scripts/build_madden_data.py
```

`data/_cache/` is gitignored. Committed artifact is `data/league.json`.

## Local

Serve the repo root over HTTP (GitHub Pages or any static server).
