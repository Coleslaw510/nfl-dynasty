# NFL Dynasty

Classic NFL dynasty sim (no all-time shop) — sibling to [CFB Season Sim](https://coleslaw510.github.io/cfb-sim/).

**Live:** https://coleslaw510.github.io/nfl-dynasty/

## v1 features

- Mode picker (CFB Season Sim ↔ NFL Dynasty)
- All 32 real NFL teams
- Slim roster: starters + ~1 backup per position group (~29 players)
- Player OVRs from **TeamCrafters Madden 26 Super Bowl** published roster pages  
  Source: https://www.teamcrafters.net/rosters/MADDEN26/23-super-bowl  
  Ages estimated from listed NFL experience years (not DOBs)
- Simplified salary cap (~$255.4M), contracts, free agency, 3-round draft
- Division opponents twice per season; 17-week schedule + NFL playoffs through Super Bowl
- Offseason aging: improve through ~age 28, regress in the 30s, some retirements
- Contract years decrement each offseason
- Clean tabbed UI: Schedule · Roster · Standings · Cap · History

## Out of scope (v1)

- Full 53-man roster / practice squad
- Real NFL contract structures (signing bonus, dead money, restructures)
- Trade block / multiplayer
- Exact DOB ages / injury system / play-calling
- All-time shop (intentionally CFB-only)
- Full 7-round draft (v1 is 3 rounds)
- Perfect NFL scheduling rotation beyond division 2×

## Rebuild roster data

```bash
# optional: populate data/_cache by fetching TeamCrafters HTML, then:
python3 scripts/build_madden_data.py
```

`data/_cache/` is gitignored. Committed artifact is `data/league.json`.

## Local

Serve the repo root over HTTP (GitHub Pages or any static server).
