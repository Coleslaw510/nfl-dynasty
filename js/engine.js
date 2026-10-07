/* NFL Dynasty engine — schedule, sim, cap, FA, draft, aging */
(function (global) {
  "use strict";

  const SAVE_KEY = "nfl-dynasty-v1";
  const STARTER_NEEDS = { QB: 1, RB: 1, WR: 3, TE: 1, OL: 5, EDGE: 2, DL: 2, LB: 3, DB: 4, K: 1, P: 1 };
  const BACKUP_NEEDS = { QB: 1, RB: 1, WR: 1, TE: 1, OL: 1, EDGE: 1, DL: 1, LB: 1, DB: 1, K: 0, P: 0 };
  const BUCKET_ORDER = ["QB", "RB", "WR", "TE", "OL", "EDGE", "DL", "LB", "DB", "K", "P"];

  function mulberry32(a) {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function money(n) {
    const v = Math.round(n);
    if (Math.abs(v) >= 1e6) return "$" + (v / 1e6).toFixed(v % 1e6 === 0 ? 0 : 2) + "M";
    if (Math.abs(v) >= 1e3) return "$" + Math.round(v / 1e3) + "K";
    return "$" + v;
  }
  function recordStr(w, l, t) {
    return t ? `${w}–${l}–${t}` : `${w}–${l}`;
  }

  const FIRST = ["Jaylen","Marcus","Tyler","Cam","Jordan","Malik","Noah","Isaiah","Cole","Dylan","Jalen","Xavier","Aiden","Carson","Miles","Bryce","Devin","Owen","Eli","Caleb","Nate","Chris","Jake","Hunter","Logan","Austin","Kai","Zion","Rome","Ashton"];
  const LAST = ["Williams","Johnson","Brown","Davis","Miller","Wilson","Moore","Taylor","Anderson","Thomas","Jackson","White","Harris","Martin","Thompson","Garcia","Robinson","Clark","Lewis","Walker","Hall","Allen","Young","King","Wright","Scott","Green","Baker","Adams","Nelson","Carter","Mitchell","Turner","Phillips","Campbell","Parker","Evans","Edwards","Collins","Stewart"];
  const DRAFT_POS = ["QB","RB","WR","WR","TE","OL","OL","EDGE","DL","LB","DB","DB","K","P"];

  function pickName(rng) {
    return FIRST[Math.floor(rng() * FIRST.length)] + " " + LAST[Math.floor(rng() * LAST.length)];
  }

  function salaryFor(ovr, age) {
    const anchors = [[55,900000],[60,1200000],[65,1800000],[70,2800000],[75,5000000],[80,9500000],[85,15500000],[90,24000000],[93,32000000],[96,40000000],[99,48000000]];
    const o = clamp(ovr | 0, 55, 99);
    let base = anchors[anchors.length - 1][1];
    for (let i = 0; i < anchors.length - 1; i++) {
      const [a0, s0] = anchors[i], [a1, s1] = anchors[i + 1];
      if (o >= a0 && o <= a1) {
        const t = a1 === a0 ? 0 : (o - a0) / (a1 - a0);
        base = s0 + (s1 - s0) * t;
        break;
      }
    }
    if (age >= 34) base *= 0.82;
    else if (age >= 31) base *= 0.92;
    else if (age <= 23 && ovr < 88) base *= 0.8;
    // Match league.json scale so generated contracts stay in-universe
    base *= 0.548;
    return Math.round(base / 50000) * 50000;
  }

  function contractYears(ovr, age) {
    if (age >= 34) return 1;
    if (age >= 31) return ovr >= 80 ? 2 : 1;
    if (ovr >= 90) return 5;
    if (ovr >= 82) return 4;
    if (ovr >= 74) return 3;
    return 2;
  }

  function teamCapHit(team) {
    return (team.roster || []).reduce((s, p) => s + (p.salary || 0), 0);
  }

  function recomputeRatings(team) {
    const offB = new Set(["QB", "RB", "WR", "TE", "OL"]);
    const defB = new Set(["EDGE", "DL", "LB", "DB"]);
    const offs = team.roster.filter((p) => offB.has(p.bucket)).map((p) => p.ovr).sort((a, b) => b - a);
    const defs = team.roster.filter((p) => defB.has(p.bucket)).map((p) => p.ovr).sort((a, b) => b - a);
    const off = offs.length ? Math.round(offs.slice(0, 11).reduce((a, b) => a + b, 0) / Math.min(11, offs.length)) : 70;
    const def = defs.length ? Math.round(defs.slice(0, 11).reduce((a, b) => a + b, 0) / Math.min(11, defs.length)) : 70;
    team.ratings = { ovr: Math.round(off * 0.52 + def * 0.48), off, def };
    return team.ratings;
  }

  function sortRoster(roster) {
    const bi = (b) => BUCKET_ORDER.indexOf(b);
    return roster.slice().sort((a, b) => bi(a.bucket) - bi(b.bucket) || b.ovr - a.ovr || a.n.localeCompare(b.n));
  }

  function rosterNeeds(roster) {
    const counts = {};
    for (const b of BUCKET_ORDER) counts[b] = 0;
    for (const p of roster) counts[p.bucket] = (counts[p.bucket] || 0) + 1;
    const gaps = [];
    for (const b of BUCKET_ORDER) {
      const need = (STARTER_NEEDS[b] || 0) + (BACKUP_NEEDS[b] || 0);
      if ((counts[b] || 0) < need) gaps.push({ bucket: b, have: counts[b] || 0, need });
    }
    return { counts, gaps };
  }

  /* -------- Schedule generation (division 2×) -------- */
  function generateSchedule(teams, year, rng) {
    const byDiv = {};
    for (const t of teams) (byDiv[t.division] ||= []).push(t.id);
    const ids = teams.map((t) => t.id);
    const pairCount = {}; // "a|b" sorted key -> count
    const key = (a, b) => (a < b ? a + "|" + b : b + "|" + a);
    const games = [];

    function add(home, away, kind) {
      const k = key(home, away);
      pairCount[k] = (pairCount[k] || 0) + 1;
      games.push({ home, away, kind });
    }

    // Division: home + away vs each div foe => 6 games/team
    for (const divIds of Object.values(byDiv)) {
      for (let i = 0; i < divIds.length; i++) {
        for (let j = i + 1; j < divIds.length; j++) {
          add(divIds[i], divIds[j], "DIV");
          add(divIds[j], divIds[i], "DIV");
        }
      }
    }

    function gamesFor(tid) {
      let n = 0;
      for (const g of games) if (g.home === tid || g.away === tid) n++;
      return n;
    }

    // Fill to 17 with unique opponents preferentially (max 1 non-div meeting in v1 fill)
    let guard = 0;
    while (guard++ < 5000) {
      const needy = ids.filter((id) => gamesFor(id) < 17).sort((a, b) => gamesFor(a) - gamesFor(b) || a.localeCompare(b));
      if (!needy.length) break;
      let placed = false;
      for (const a of needy) {
        const candidates = ids
          .filter((b) => b !== a && gamesFor(b) < 17)
          .sort((x, y) => gamesFor(x) - gamesFor(y) || rng() - 0.5);
        for (const b of candidates) {
          const k = key(a, b);
          const sameDiv = teams.find((t) => t.id === a).division === teams.find((t) => t.id === b).division;
          const maxMeet = sameDiv ? 2 : 1;
          if ((pairCount[k] || 0) >= maxMeet) continue;
          // home/away alternate by hash
          const homeFirst = ((hashSeed(year + k) + games.length) % 2) === 0;
          add(homeFirst ? a : b, homeFirst ? b : a, sameDiv ? "DIV" : "REG");
          placed = true;
          break;
        }
        if (placed) break;
      }
      if (!placed) {
        // allow a second non-div meeting if stuck
        for (const a of needy) {
          const candidates = ids.filter((b) => b !== a && gamesFor(b) < 17);
          for (const b of candidates) {
            const k = key(a, b);
            if ((pairCount[k] || 0) >= 2) continue;
            add(a, b, "REG");
            placed = true;
            break;
          }
          if (placed) break;
        }
      }
      if (!placed) break;
    }

    // Assign weeks 1–17 with no team double-booked
    const weekGames = Array.from({ length: 18 }, () => []);
    const teamWeek = {};
    for (const id of ids) teamWeek[id] = new Set();
    const place = games.slice();
    for (let i = place.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [place[i], place[j]] = [place[j], place[i]];
    }
    const scheduled = [];
    for (const g of place) {
      let week = null;
      for (let w = 1; w <= 17; w++) {
        if (teamWeek[g.home].has(w) || teamWeek[g.away].has(w)) continue;
        week = w;
        break;
      }
      if (!week) {
        // should be rare; find any open shared week
        for (let w = 1; w <= 17; w++) {
          if (!teamWeek[g.home].has(w) && !teamWeek[g.away].has(w)) { week = w; break; }
        }
      }
      if (!week) week = 1 + (scheduled.length % 17);
      teamWeek[g.home].add(week);
      teamWeek[g.away].add(week);
      const full = {
        id: `${year}-W${week}-${g.home}-${g.away}`,
        week, homeId: g.home, awayId: g.away, kind: g.kind,
        homeScore: null, awayScore: null
      };
      weekGames[week].push(full);
      scheduled.push(full);
    }
    return scheduled.sort((a, b) => a.week - b.week || a.id.localeCompare(b.id));
  }

  /* -------- Game simulation -------- */
  function expectedPoints(off, def, homeBoost) {
    return clamp(21.5 + (off - 78) * 0.42 - (def - 78) * 0.38 + homeBoost, 7, 45);
  }

  function simulateGame(homeTeam, awayTeam, rng, opts) {
    opts = opts || {};
    const hBoost = opts.neutral ? 0 : 1.8;
    const hExp = expectedPoints(homeTeam.ratings.off, awayTeam.ratings.def, hBoost);
    const aExp = expectedPoints(awayTeam.ratings.off, homeTeam.ratings.def, 0);
    // Favorites win more vs big gaps (learned from CFB tuning)
    const gap = (homeTeam.ratings.ovr - awayTeam.ratings.ovr);
    let h = Math.round(hExp + (rng() - 0.5) * 14 + gap * 0.08);
    let a = Math.round(aExp + (rng() - 0.5) * 14 - gap * 0.08);
    h = clamp(h, 3, 55);
    a = clamp(a, 0, 55);
    // NFL OT: one possession sudden death with equal chance after tie — no 10-pt OT losses
    if (h === a) {
      if (rng() < 0.55) {
        // home scores FG or TD
        h += rng() < 0.7 ? 3 : 6;
      } else {
        a += rng() < 0.7 ? 3 : 6;
      }
    }
    const homePass = Math.round(clamp(210 + (homeTeam.ratings.off - 78) * 3.2 + (rng() - 0.5) * 90, 90, 420));
    const awayPass = Math.round(clamp(210 + (awayTeam.ratings.off - 78) * 3.2 + (rng() - 0.5) * 90, 90, 420));
    const homeRush = Math.round(clamp(115 + (homeTeam.ratings.off - 78) * 1.4 + (rng() - 0.5) * 60, 40, 260));
    const awayRush = Math.round(clamp(115 + (awayTeam.ratings.off - 78) * 1.4 + (rng() - 0.5) * 60, 40, 260));
    return {
      homeScore: h, awayScore: a,
      stats: {
        home: { pass: homePass, rush: homeRush },
        away: { pass: awayPass, rush: awayRush }
      }
    };
  }

  /* -------- Standings / playoffs -------- */
  function emptyRecord() { return { w: 0, l: 0, t: 0, pf: 0, pa: 0, divW: 0, divL: 0, confW: 0, confL: 0 }; }

  function applyResult(state, game) {
    const home = state.teamsById[game.homeId];
    const away = state.teamsById[game.awayId];
    const hr = state.records[game.homeId];
    const ar = state.records[game.awayId];
    hr.pf += game.homeScore; hr.pa += game.awayScore;
    ar.pf += game.awayScore; ar.pa += game.homeScore;
    const div = home.division === away.division;
    const conf = home.conference === away.conference;
    if (game.homeScore > game.awayScore) {
      hr.w++; ar.l++;
      if (div) { hr.divW++; ar.divL++; }
      if (conf) { hr.confW++; ar.confL++; }
    } else if (game.awayScore > game.homeScore) {
      ar.w++; hr.l++;
      if (div) { ar.divW++; hr.divL++; }
      if (conf) { ar.confW++; hr.confL++; }
    } else {
      hr.t++; ar.t++;
    }
  }

  function standingsList(state, conference) {
    let teams = state.teams;
    if (conference) teams = teams.filter((t) => t.conference === conference);
    return teams.slice().sort((a, b) => {
      const ra = state.records[a.id], rb = state.records[b.id];
      const pa = ra.w + ra.l + ra.t ? (ra.w + 0.5 * ra.t) / (ra.w + ra.l + ra.t) : 0;
      const pb = rb.w + rb.l + rb.t ? (rb.w + 0.5 * rb.t) / (rb.w + rb.l + rb.t) : 0;
      if (pb !== pa) return pb - pa;
      if (rb.confW !== ra.confW) return rb.confW - ra.confW;
      return (rb.pf - rb.pa) - (ra.pf - ra.pa);
    });
  }

  function divisionWinners(state, conference) {
    const divs = [...new Set(state.teams.filter((t) => t.conference === conference).map((t) => t.division))];
    const winners = [];
    for (const d of divs) {
      const list = state.teams.filter((t) => t.division === d);
      list.sort((a, b) => {
        const ra = state.records[a.id], rb = state.records[b.id];
        const pa = (ra.w + 0.5 * ra.t) / Math.max(1, ra.w + ra.l + ra.t);
        const pb = (rb.w + 0.5 * rb.t) / Math.max(1, rb.w + rb.l + rb.t);
        if (pb !== pa) return pb - pa;
        if (rb.divW !== ra.divW) return rb.divW - ra.divW;
        return (rb.pf - rb.pa) - (ra.pf - ra.pa);
      });
      winners.push(list[0]);
    }
    winners.sort((a, b) => {
      const ra = state.records[a.id], rb = state.records[b.id];
      const pa = (ra.w + 0.5 * ra.t) / Math.max(1, ra.w + ra.l + ra.t);
      const pb = (rb.w + 0.5 * rb.t) / Math.max(1, rb.w + rb.l + rb.t);
      return pb - pa;
    });
    return winners;
  }

  function buildPlayoffField(state, conference) {
    const seeds = divisionWinners(state, conference);
    const seededIds = new Set(seeds.map((t) => t.id));
    const wild = standingsList(state, conference).filter((t) => !seededIds.has(t.id)).slice(0, 3);
    return seeds.concat(wild); // 1..7
  }

  function initPlayoffs(state) {
    const afc = buildPlayoffField(state, "AFC");
    const nfc = buildPlayoffField(state, "NFC");
    state.playoffs = {
      afc: afc.map((t) => t.id),
      nfc: nfc.map((t) => t.id),
      round: "WC", // WC, DIV, CONF, SB
      games: [],
      championId: null
    };
    // Wild card: 2v7, 3v6, 4v5; 1 bye
    function wc(conf, ids) {
      return [
        { id: `${state.year}-${conf}-WC-2-7`, week: 18, homeId: ids[1], awayId: ids[6], kind: "WC", conf, homeScore: null, awayScore: null },
        { id: `${state.year}-${conf}-WC-3-6`, week: 18, homeId: ids[2], awayId: ids[5], kind: "WC", conf, homeScore: null, awayScore: null },
        { id: `${state.year}-${conf}-WC-4-5`, week: 18, homeId: ids[3], awayId: ids[4], kind: "WC", conf, homeScore: null, awayScore: null },
      ];
    }
    state.playoffs.games = wc("AFC", state.playoffs.afc).concat(wc("NFC", state.playoffs.nfc));
    state.phase = "playoffs";
    state.week = 18;
  }

  function playoffWinnerId(game) {
    return game.homeScore >= game.awayScore ? game.homeId : game.awayId;
  }

  function advancePlayoffs(state, rng) {
    const po = state.playoffs;
    const pending = po.games.filter((g) => g.homeScore == null);
    if (pending.length) {
      for (const g of pending) {
        const res = simulateGame(state.teamsById[g.homeId], state.teamsById[g.awayId], rng, { neutral: g.kind === "SB" });
        g.homeScore = res.homeScore; g.awayScore = res.awayScore; g.stats = res.stats;
      }
      return;
    }
    if (po.round === "WC") {
      function nextDiv(conf, ids) {
        const games = po.games.filter((g) => g.conf === conf && g.kind === "WC");
        const winners = games.map(playoffWinnerId);
        // 1 seed hosts lowest remaining seed; other two
        const alive = [ids[0]].concat(winners);
        // sort by original seed index
        alive.sort((a, b) => ids.indexOf(a) - ids.indexOf(b));
        return [
          { id: `${state.year}-${conf}-DIV-1`, week: 19, homeId: alive[0], awayId: alive[3], kind: "DIV", conf, homeScore: null, awayScore: null },
          { id: `${state.year}-${conf}-DIV-2`, week: 19, homeId: alive[1], awayId: alive[2], kind: "DIV", conf, homeScore: null, awayScore: null },
        ];
      }
      po.games = nextDiv("AFC", po.afc).concat(nextDiv("NFC", po.nfc));
      po.round = "DIV";
      state.week = 19;
    } else if (po.round === "DIV") {
      function confFinal(conf, ids) {
        const games = po.games.filter((g) => g.conf === conf && g.kind === "DIV");
        const winners = games.map(playoffWinnerId);
        winners.sort((a, b) => ids.indexOf(a) - ids.indexOf(b));
        return { id: `${state.year}-${conf}-CONF`, week: 20, homeId: winners[0], awayId: winners[1], kind: "CONF", conf, homeScore: null, awayScore: null };
      }
      po.games = [confFinal("AFC", po.afc), confFinal("NFC", po.nfc)];
      po.round = "CONF";
      state.week = 20;
    } else if (po.round === "CONF") {
      const afcG = po.games.find((g) => g.conf === "AFC" && g.kind === "CONF");
      const nfcG = po.games.find((g) => g.conf === "NFC" && g.kind === "CONF");
      po.games = [{
        id: `${state.year}-SB`, week: 21, homeId: playoffWinnerId(afcG), awayId: playoffWinnerId(nfcG),
        kind: "SB", conf: "NFL", homeScore: null, awayScore: null
      }];
      po.round = "SB";
      state.week = 21;
    } else if (po.round === "SB") {
      const sb = po.games.find((g) => g.kind === "SB");
      po.championId = playoffWinnerId(sb);
      state.phase = "recap";
    }
  }

  /* -------- Offseason systems -------- */
  function ageAndProgress(state, rng) {
    const log = [];
    for (const team of state.teams) {
      for (const p of team.roster) {
        p.age += 1;
        p.exp = (p.exp || 1) + 1;
        if (p.yearsLeft > 0) p.yearsLeft -= 1;
        let delta = 0;
        if (p.age <= 28) {
          // young improvement
          const chance = clamp(0.55 - (p.ovr - 70) * 0.01, 0.15, 0.7);
          if (rng() < chance) delta = rng() < 0.25 ? 2 : 1;
          if (p.ovr >= 94) delta = Math.min(delta, 1);
        } else if (p.age >= 31) {
          const chance = clamp(0.25 + (p.age - 31) * 0.08, 0.2, 0.75);
          if (rng() < chance) delta = rng() < 0.3 ? -2 : -1;
          if (p.age >= 36) delta = Math.min(delta, -1);
        }
        if (delta) {
          const before = p.ovr;
          p.ovr = clamp(p.ovr + delta, 40, 99);
          if (p.ovr !== before) log.push({ teamId: team.id, name: p.n, before, after: p.ovr, age: p.age });
        }
      }
      // retire very old / low
      const kept = [];
      for (const p of team.roster) {
        if (p.age >= 38 || (p.age >= 35 && p.ovr < 70) || (p.age >= 33 && p.ovr < 62)) {
          log.push({ teamId: team.id, name: p.n, retired: true, age: p.age, ovr: p.ovr });
          continue;
        }
        kept.push(p);
      }
      team.roster = sortRoster(kept);
      recomputeRatings(team);
    }
    return log;
  }

  function collectExpired(state) {
    const expired = [];
    for (const team of state.teams) {
      const stay = [];
      for (const p of team.roster) {
        if (p.yearsLeft <= 0) {
          expired.push({ ...p, fromTeamId: team.id, asking: Math.round(salaryFor(p.ovr, p.age) * 1.06 / 50000) * 50000 });
        } else stay.push(p);
      }
      team.roster = stay;
      recomputeRatings(team);
    }
    state.freeAgents = (state.freeAgents || []).concat(expired);
    state.freeAgents.sort((a, b) => b.ovr - a.ovr);
    return expired;
  }

  function cpuResign(state, rng) {
    for (const team of state.teams) {
      if (team.id === state.userTeamId) continue;
      const room = state.salaryCap - teamCapHit(team);
      // soft resign of own expired still in FA list from this team
      const mine = state.freeAgents.filter((p) => p.fromTeamId === team.id && p.ovr >= 74);
      for (const p of mine.slice(0, 4)) {
        const years = contractYears(p.ovr, p.age);
        const sal = Math.round((p.asking || salaryFor(p.ovr, p.age)) * (0.92 + rng() * 0.1) / 50000) * 50000;
        if (sal * 1 > room * 0.35 && p.ovr < 88) continue;
        if (teamCapHit(team) + sal > state.salaryCap) continue;
        // sign
        state.freeAgents = state.freeAgents.filter((x) => x.id !== p.id);
        team.roster.push({ ...p, yearsLeft: years, salary: sal, asking: undefined, fromTeamId: undefined });
        team.roster = sortRoster(team.roster);
        recomputeRatings(team);
      }
    }
  }

  function cpuFreeAgency(state, rng) {
    for (let round = 0; round < 3; round++) {
      for (const team of state.teams) {
        if (team.id === state.userTeamId) continue;
        const needs = rosterNeeds(team.roster).gaps;
        if (!needs.length) continue;
        const bucket = needs[0].bucket;
        const cand = state.freeAgents.find((p) => p.bucket === bucket && teamCapHit(team) + (p.asking || p.salary) <= state.salaryCap);
        if (!cand) continue;
        if (rng() > 0.55 && cand.ovr < 80) continue;
        const sal = cand.asking || cand.salary;
        const years = contractYears(cand.ovr, cand.age);
        team.roster.push({ ...cand, salary: sal, yearsLeft: years, asking: undefined, fromTeamId: undefined });
        team.roster = sortRoster(team.roster);
        recomputeRatings(team);
        state.freeAgents = state.freeAgents.filter((x) => x.id !== cand.id);
      }
    }
  }

  function generateDraftClass(year, rng) {
    const cls = [];
    let id = year * 10000;
    for (let i = 0; i < 224; i++) { // 7 rounds * 32
      const bucket = DRAFT_POS[Math.floor(rng() * (DRAFT_POS.length - 2))]; // rarely K/P early
      const pos = bucket === "OL" ? ["LT","LG","C","RG","RT"][Math.floor(rng()*5)]
        : bucket === "EDGE" ? (rng() < 0.5 ? "LEDG" : "REDG")
        : bucket === "DL" ? (rng() < 0.5 ? "DT" : "DE")
        : bucket === "LB" ? ["MLB","OLB","OLB"][Math.floor(rng()*3)]
        : bucket === "DB" ? ["CB","CB","FS","SS"][Math.floor(rng()*4)]
        : bucket === "RB" ? "HB" : bucket;
      // talent curve
      let ovr;
      if (i < 10) ovr = 78 + Math.floor(rng() * 10);
      else if (i < 32) ovr = 72 + Math.floor(rng() * 8);
      else if (i < 64) ovr = 68 + Math.floor(rng() * 7);
      else if (i < 128) ovr = 64 + Math.floor(rng() * 7);
      else ovr = 58 + Math.floor(rng() * 8);
      cls.push({
        id: ++id,
        n: pickName(rng),
        pos, bucket,
        j: String(1 + Math.floor(rng() * 98)),
        ovr, age: 21 + (rng() < 0.15 ? 1 : 0),
        exp: 0, yearsLeft: 4,
        salary: salaryFor(ovr, 22),
        draftRank: i + 1
      });
    }
    return cls;
  }

  function draftOrder(state) {
    // worst record first (simple reverse standings), then playoff teams by reverse finish approx
    const list = standingsList(state, null).slice().reverse();
    return list.map((t) => t.id);
  }

  function runCpuDraftPicks(state, rng, untilUser) {
    const order = state.draft.order;
    while (state.draft.pickIndex < state.draft.picksTotal) {
      const slot = state.draft.pickIndex;
      const teamId = order[slot % 32];
      if (untilUser && teamId === state.userTeamId) return; // stop for user
      const team = state.teamsById[teamId];
      const needs = rosterNeeds(team.roster).gaps.map((g) => g.bucket);
      let pick = null;
      if (needs.length) pick = state.draft.pool.find((p) => needs.includes(p.bucket));
      if (!pick) pick = state.draft.pool[0];
      if (!pick) break;
      state.draft.pool = state.draft.pool.filter((p) => p.id !== pick.id);
      const sal = Math.min(salaryFor(pick.ovr, pick.age), 6_500_000);
      team.roster.push({ ...pick, salary: sal, yearsLeft: 4 });
      team.roster = sortRoster(team.roster);
      recomputeRatings(team);
      state.draft.log.push({ pick: slot + 1, teamId, player: pick });
      state.draft.pickIndex++;
      if (untilUser && order[state.draft.pickIndex % 32] === state.userTeamId) return;
    }
  }

  /* -------- State bootstrap -------- */
  function createState(league, userTeamId) {
    const teams = clone(league.teams);
    const teamsById = {};
    for (const t of teams) {
      t.roster = sortRoster(t.roster);
      recomputeRatings(t);
      teamsById[t.id] = t;
    }
    const rng = mulberry32(hashSeed("nfl-dynasty-" + league.seasonYear + "-" + userTeamId));
    const year = league.seasonYear || 2026;
    const schedule = generateSchedule(teams, year, rng);
    const records = {};
    for (const t of teams) records[t.id] = emptyRecord();
    return {
      version: 1,
      year,
      week: 1,
      phase: "regular", // regular | playoffs | recap | offseason
      offseasonStep: null, // resign | fa | draft | progress | done
      userTeamId,
      salaryCap: league.salaryCap,
      teams,
      teamsById,
      schedule,
      records,
      freeAgents: clone(league.freeAgents || []),
      playoffs: null,
      history: [],
      lastBox: null,
      draft: null,
      offseasonLog: [],
      sourceLabel: league.sourceLabel,
      rngSeed: hashSeed("nfl-dynasty-" + year + "-" + userTeamId),
    };
  }

  function userTeam(state) { return state.teamsById[state.userTeamId]; }

  function save(state) {
    const slim = clone(state);
    delete slim.teamsById;
    localStorage.setItem(SAVE_KEY, JSON.stringify(slim));
  }
  function load() {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw);
      s.teamsById = {};
      for (const t of s.teams) s.teamsById[t.id] = t;
      return s;
    } catch {
      return null;
    }
  }
  function clearSave() { localStorage.removeItem(SAVE_KEY); }

  function simWeek(state) {
    const rng = mulberry32(hashSeed(state.rngSeed + ":W" + state.week + ":" + state.phase + ":" + (state.playoffs && state.playoffs.round)));
    if (state.phase === "regular") {
      const games = state.schedule.filter((g) => g.week === state.week && g.homeScore == null);
      let userBox = null;
      for (const g of games) {
        const res = simulateGame(state.teamsById[g.homeId], state.teamsById[g.awayId], rng);
        g.homeScore = res.homeScore; g.awayScore = res.awayScore; g.stats = res.stats;
        applyResult(state, g);
        if (g.homeId === state.userTeamId || g.awayId === state.userTeamId) userBox = g;
      }
      state.lastBox = userBox;
      if (state.week >= 17) {
        initPlayoffs(state);
      } else {
        state.week += 1;
      }
      return;
    }
    if (state.phase === "playoffs") {
      const beforeRound = state.playoffs.round;
      const beforeLen = state.playoffs.games.filter((g) => g.homeScore == null).length;
      advancePlayoffs(state, rng);
      // capture user game box
      const ug = state.playoffs.games.find((g) => (g.homeId === state.userTeamId || g.awayId === state.userTeamId) && g.homeScore != null);
      if (ug) state.lastBox = ug;
      // If we only filled scores, stay; if advanced to new round with null scores, auto-stop for next click
      if (state.phase === "recap") {
        finalizeSeason(state);
      }
    }
  }

  function finalizeSeason(state) {
    const ut = userTeam(state);
    const rec = state.records[ut.id];
    const champ = state.playoffs && state.playoffs.championId;
    const madePlayoffs = !!(state.playoffs && (state.playoffs.afc.includes(ut.id) || state.playoffs.nfc.includes(ut.id)));
    let result = "Missed playoffs";
    if (champ === ut.id) result = "Won Super Bowl";
    else if (madePlayoffs) {
      const sb = state.playoffs.games.find((g) => g.kind === "SB");
      const conf = state.playoffs.games.find((g) => g.kind === "CONF" && (g.homeId === ut.id || g.awayId === ut.id));
      if (sb && (sb.homeId === ut.id || sb.awayId === ut.id)) result = "Lost Super Bowl";
      else if (conf) result = "Lost Conference Championship";
      else result = "Made playoffs";
    }
    state.history.push({
      year: state.year,
      teamId: ut.id,
      record: { w: rec.w, l: rec.l, t: rec.t },
      result,
      ovr: ut.ratings.ovr,
      championId: champ
    });
    state.phase = "offseason";
    state.offseasonStep = "resign";
    state.offseasonLog = [];
  }

  function startNextSeason(state) {
    state.year += 1;
    state.week = 1;
    state.phase = "regular";
    state.offseasonStep = null;
    state.playoffs = null;
    state.lastBox = null;
    state.draft = null;
    const rng = mulberry32(hashSeed(state.rngSeed + ":Y" + state.year));
    state.schedule = generateSchedule(state.teams, state.year, rng);
    state.records = {};
    for (const t of state.teams) state.records[t.id] = emptyRecord();
    // Soft cap bump
    state.salaryCap = Math.round(state.salaryCap * 1.02);
  }

  global.NFLDynasty = {
    SAVE_KEY, STARTER_NEEDS, BACKUP_NEEDS, BUCKET_ORDER,
    money, recordStr, clamp, clone, hashSeed, mulberry32,
    salaryFor, contractYears, teamCapHit, recomputeRatings, sortRoster, rosterNeeds,
    createState, userTeam, save, load, clearSave,
    simWeek, standingsList, divisionWinners,
    ageAndProgress, collectExpired, cpuResign, cpuFreeAgency,
    generateDraftClass, draftOrder, runCpuDraftPicks, startNextSeason,
    finalizeSeason
  };
})(window);
