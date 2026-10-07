/* NFL Dynasty UI */
(function () {
  "use strict";
  const E = window.NFLDynasty;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  let league = null;
  let state = null;
  let activeTab = "schedule";

  function toast(msg) {
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }

  function ovrClass(o) {
    if (o >= 90) return "elite";
    if (o >= 80) return "great";
    if (o >= 72) return "good";
    return "";
  }
  function ovrBadge(o) {
    return `<span class="ovr ${ovrClass(o)}">${o}</span>`;
  }

  function show(view) {
    ["mode", "picker", "season", "offseason"].forEach((v) => {
      const el = $(`#view-${v}`);
      if (el) el.hidden = v !== view;
    });
    $("#btnFullReset").hidden = view === "mode" || view === "picker";
    $("#topMeta").hidden = !(view === "season" || view === "offseason");
  }

  function moneyShort(n) {
    const v = Math.round(n);
    const sign = v < 0 ? "-" : "";
    const a = Math.abs(v);
    if (a >= 1e6) {
      const m = a / 1e6;
      return sign + "$" + (m >= 100 ? Math.round(m) : m.toFixed(m >= 10 ? 0 : 1)) + "M";
    }
    if (a >= 1e3) return sign + "$" + Math.round(a / 1e3) + "K";
    return sign + "$" + a;
  }

  function refreshMeta() {
    if (!state) return;
    const hit = E.teamCapHit(E.userTeam(state));
    const room = state.salaryCap - hit;
    const roomCls = room < 0 ? "cap-over" : "cap-room";
    $("#capChip").innerHTML = `<span class="cap-label">Cap</span><span class="cap-figures"><strong>${moneyShort(hit)}</strong><span class="cap-sep">/</span>${moneyShort(state.salaryCap)}</span><span class="${roomCls}">${room < 0 ? "" : "+"}${moneyShort(room)}</span>`;
    $("#yearChip").textContent = String(state.year);
  }

  function renderTeamChip(el) {
    const t = E.userTeam(state);
    const r = state.records[t.id];
    el.innerHTML = `
      <div class="logo" style="background:${t.color}">${t.abbr}</div>
      <div>
        <strong>${t.name}</strong>
        <div class="muted small">OVR ${t.ratings.ovr} · OFF ${t.ratings.off} · DEF ${t.ratings.def} · ${E.recordStr(r.w,r.l,r.t)}</div>
      </div>`;
  }

  /* -------- Mode / picker -------- */
  function renderPicker() {
    const q = ($("#teamSearch").value || "").toLowerCase();
    const conf = $("#confFilter").value;
    const grid = $("#teamGrid");
    grid.innerHTML = "";
    for (const t of league.teams) {
      if (conf && t.conference !== conf) continue;
      if (q && !(`${t.name} ${t.abbr} ${t.division}`).toLowerCase().includes(q)) continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "team-card";
      btn.innerHTML = `
        <div class="row">
          <div>
            <strong>${t.name}</strong>
            <div class="muted small">${t.division}</div>
          </div>
          <div class="abbr" style="background:${t.color}">${t.abbr}</div>
        </div>
        <div class="muted small" style="margin-top:8px">OVR ${t.ratings.ovr} · Cap hit ${E.money(E.teamCapHit(t))} · ${t.roster.length} players</div>`;
      btn.addEventListener("click", () => startDynasty(t.id));
      grid.appendChild(btn);
    }
  }

  function startDynasty(teamId) {
    state = E.createState(league, teamId);
    E.save(state);
    activeTab = "schedule";
    show("season");
    renderSeason();
    toast(`Welcome to ${E.userTeam(state).name}`);
  }

  /* -------- Season UI -------- */
  function setTab(tab) {
    activeTab = tab;
    $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    ["schedule", "roster", "standings", "cap", "history"].forEach((t) => {
      const p = $(`#panel-${t}`);
      if (p) p.hidden = t !== tab;
    });
    renderActivePanel();
  }

  function primaryLabel() {
    if (state.phase === "regular") {
      const uid = state.userTeamId;
      const mine = state.schedule.find((g) => g.week === state.week && (g.homeId === uid || g.awayId === uid));
      if (!mine) return `Sim bye · W${state.week}`;
      return `Sim week ${state.week}`;
    }
    if (state.phase === "playoffs") {
      const map = { WC: "Sim Wild Card", DIV: "Sim Divisional", CONF: "Sim Conference", SB: "Sim Super Bowl" };
      return map[state.playoffs.round] || "Sim playoffs";
    }
    if (state.phase === "recap" || state.phase === "offseason") return "Enter offseason";
    return "Continue";
  }

  function renderSeason() {
    renderTeamChip($("#myTeamChip"));
    refreshMeta();
    const r = state.records[state.userTeamId];
    $("#recordLabel").textContent = E.recordStr(r.w, r.l, r.t);
    if (state.phase === "regular") {
      $("#phaseLabel").textContent = "Regular season";
      const uid = state.userTeamId;
      const mine = state.schedule.find((g) => g.week === state.week && (g.homeId === uid || g.awayId === uid));
      $("#weekLabel").textContent = mine ? `Week ${state.week}` : `Week ${state.week} · Bye`;
    } else if (state.phase === "playoffs") {
      $("#phaseLabel").textContent = "Playoffs";
      $("#weekLabel").textContent = ({ WC: "Wild Card", DIV: "Divisional", CONF: "Conference", SB: "Super Bowl" })[state.playoffs.round] || "Playoffs";
    } else {
      $("#phaseLabel").textContent = "Season complete";
      $("#weekLabel").textContent = "Recap";
    }
    $("#btnPrimary").textContent = primaryLabel();
    $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === activeTab));
    renderActivePanel();
  }

  function renderActivePanel() {
    if (activeTab === "schedule") renderSchedule();
    if (activeTab === "roster") renderRoster();
    if (activeTab === "standings") renderStandings();
    if (activeTab === "cap") renderCap();
    if (activeTab === "history") renderHistory();
  }

  function teamLabel(id) {
    const t = state.teamsById[id];
    return t ? `${t.abbr}` : id;
  }
  function teamName(id) {
    const t = state.teamsById[id];
    return t ? t.name : id;
  }

  function gameResultPill(g, userId) {
    if (g.homeScore == null) return `<span class="pill">Upcoming</span>`;
    const userHome = g.homeId === userId;
    const userScore = userHome ? g.homeScore : g.awayScore;
    const oppScore = userHome ? g.awayScore : g.homeScore;
    if (userScore > oppScore) return `<span class="pill win">W ${userScore}–${oppScore}</span>`;
    if (userScore < oppScore) return `<span class="pill loss">L ${userScore}–${oppScore}</span>`;
    return `<span class="pill">T ${userScore}–${oppScore}</span>`;
  }

  function renderSchedule() {
    const panel = $("#panel-schedule");
    const uid = state.userTeamId;
    let games = [];
    if (state.phase === "playoffs" || state.phase === "recap" || state.phase === "offseason") {
      games = (state.playoffs && state.playoffs.games) ? state.playoffs.games.slice() : [];
      // also show remaining / completed user regular season below
    }
    const reg = state.schedule.filter((g) => g.homeId === uid || g.awayId === uid);
    const next = reg.find((g) => g.homeScore == null && state.phase === "regular" && g.week === state.week)
      || reg.find((g) => g.homeScore == null && state.phase === "regular");

    let html = "";
    if (state.lastBox) {
      const g = state.lastBox;
      html += `<div class="card"><h3>Last result</h3>
        <div><strong>${teamName(g.awayId)}</strong> ${g.awayScore} @ <strong>${teamName(g.homeId)}</strong> ${g.homeScore}
        <div class="muted small">${g.kind || "REG"} · Pass ${g.stats ? `${g.stats.away.pass}/${g.stats.home.pass}` : "—"} · Rush ${g.stats ? `${g.stats.away.rush}/${g.stats.home.rush}` : "—"}</div></div></div>`;
    }

    if (state.phase === "regular" && next) {
      const oppId = next.homeId === uid ? next.awayId : next.homeId;
      const opp = state.teamsById[oppId];
      const home = next.homeId === uid;
      html += `<div class="card next-game"><h3>Your next game · Week ${next.week}</h3>
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center">
          <div>
            <div class="eyebrow">${home ? "Home" : "Away"} · ${next.kind === "DIV" ? "Division" : "Regular"}</div>
            <strong style="font-size:18px">${home ? "vs" : "@"} ${opp.name}</strong>
            <div class="muted small">You ${ovrBadge(E.userTeam(state).ratings.ovr)} · Opp ${ovrBadge(opp.ratings.ovr)}</div>
          </div>
          <button type="button" class="btn btn-primary" id="btnSimInline">Sim this week</button>
        </div></div>`;
    }

    if (state.phase === "playoffs" || (state.playoffs && state.playoffs.games)) {
      html += `<div class="card"><h3>Playoffs</h3>`;
      const pg = state.playoffs.games || [];
      for (const g of pg) {
        const mine = g.homeId === uid || g.awayId === uid;
        html += `<div class="game-row" style="${mine ? "background:rgba(61,139,253,.08);border-radius:8px;padding:10px" : ""}">
          <div class="muted small">${g.kind}</div>
          <div><strong>${teamLabel(g.awayId)}</strong> @ <strong>${teamLabel(g.homeId)}</strong>
            <div class="muted small">${teamName(g.awayId)} @ ${teamName(g.homeId)}</div></div>
          <div class="score">${g.homeScore == null ? "—" : `${g.awayScore}–${g.homeScore}`}</div>
        </div>`;
      }
      html += `</div>`;
    }

    html += `<div class="card"><h3>Your schedule</h3>`;
    for (const g of reg) {
      const oppId = g.homeId === uid ? g.awayId : g.homeId;
      const opp = state.teamsById[oppId];
      const home = g.homeId === uid;
      const isNext = next && g.id === next.id;
      html += `<div class="game-row" ${isNext ? 'style="background:rgba(61,139,253,.08);border-radius:8px;padding:10px"' : ""}>
        <div class="muted small">W${g.week}</div>
        <div>${home ? "vs" : "@"} <strong>${opp.abbr}</strong> ${ovrBadge(opp.ratings.ovr)}
          <span class="muted small">${opp.name}${g.kind === "DIV" ? " · DIV" : ""}</span></div>
        <div>${gameResultPill(g, uid)}</div>
      </div>`;
    }
    html += `</div>`;
    panel.innerHTML = html;
    const inline = $("#btnSimInline");
    if (inline) inline.addEventListener("click", onPrimary);
  }

  let rosterSort = { key: "pos", dir: 1 };

  function renderRoster() {
    const t = E.userTeam(state);
    const panel = $("#panel-roster");
    const limit = state.rosterLimit || E.ROSTER_LIMIT || 53;
    const sorted = t.roster.slice().sort((a, b) => {
      const k = rosterSort.key;
      const dir = rosterSort.dir;
      if (k === "pos") {
        const bi = (p) => E.BUCKET_ORDER.indexOf(p.bucket);
        const d = bi(a) - bi(b) || b.ovr - a.ovr || a.n.localeCompare(b.n);
        return dir * d;
      }
      if (k === "n") return dir * a.n.localeCompare(b.n);
      if (k === "ovr") return dir * (a.ovr - b.ovr) || a.n.localeCompare(b.n);
      if (k === "age") return dir * (a.age - b.age) || b.ovr - a.ovr;
      if (k === "yearsLeft") return dir * (a.yearsLeft - b.yearsLeft) || b.ovr - a.ovr;
      if (k === "salary") return dir * (a.salary - b.salary) || b.ovr - a.ovr;
      return 0;
    });
    const mark = (key) => rosterSort.key === key ? (rosterSort.dir > 0 ? " ▲" : " ▼") : "";
    let html = `<div class="card"><h3>Roster · ${t.roster.length}/${limit}</h3>
      <p class="muted small">Full 53-man roster. Tap a column to sort.</p>
      <div class="table-wrap"><table class="table sortable"><thead><tr>
        <th data-sort="pos">Pos${mark("pos")}</th>
        <th data-sort="n">Player${mark("n")}</th>
        <th data-sort="ovr">OVR${mark("ovr")}</th>
        <th data-sort="age">Age${mark("age")}</th>
        <th data-sort="yearsLeft">Yrs${mark("yearsLeft")}</th>
        <th data-sort="salary">Salary${mark("salary")}</th>
      </tr></thead><tbody>`;
    for (const p of sorted) {
      html += `<tr>
        <td>${p.pos}</td>
        <td>${p.n}${p.j ? ` <span class="muted small">#${p.j}</span>` : ""}</td>
        <td>${ovrBadge(p.ovr)}</td>
        <td>${p.age}</td>
        <td>${p.yearsLeft}</td>
        <td>${E.money(p.salary)}</td>
      </tr>`;
    }
    html += `</tbody></table></div></div>`;
    const needs = E.rosterNeeds(t.roster);
    if (needs.gaps.length) {
      html += `<div class="card"><h3>Depth gaps</h3><p class="muted small">${needs.gaps.map((g) => `${g.bucket} ${g.have}/${g.need}`).join(" · ")}</p></div>`;
    }
    panel.innerHTML = html;
    panel.querySelectorAll("th[data-sort]").forEach((th) => {
      th.style.cursor = "pointer";
      th.addEventListener("click", () => {
        const key = th.dataset.sort;
        if (rosterSort.key === key) rosterSort.dir *= -1;
        else {
          rosterSort.key = key;
          rosterSort.dir = key === "pos" || key === "n" ? 1 : -1;
        }
        renderRoster();
      });
    });
  }

  function renderStandings() {
    const panel = $("#panel-standings");
    const divs = [...new Set(state.teams.map((t) => t.division))];
    let html = `<div class="standings-grid">`;
    for (const d of divs) {
      const list = state.teams.filter((t) => t.division === d).sort((a, b) => {
        const ra = state.records[a.id], rb = state.records[b.id];
        const pa = (ra.w + 0.5 * ra.t) / Math.max(1, ra.w + ra.l + ra.t);
        const pb = (rb.w + 0.5 * rb.t) / Math.max(1, rb.w + rb.l + rb.t);
        return pb - pa || (rb.pf - rb.pa) - (ra.pf - ra.pa);
      });
      html += `<div class="card"><h3>${d}</h3><table class="table"><thead><tr><th>Team</th><th>W</th><th>L</th><th>PF</th></tr></thead><tbody>`;
      for (const t of list) {
        const r = state.records[t.id];
        const mine = t.id === state.userTeamId;
        html += `<tr style="${mine ? "background:rgba(61,139,253,.1)" : ""}"><td>${t.abbr} ${ovrBadge(t.ratings.ovr)}</td><td>${r.w}</td><td>${r.l}</td><td>${r.pf}</td></tr>`;
      }
      html += `</tbody></table></div>`;
    }
    html += `</div>`;
    if (state.playoffs && state.playoffs.afc) {
      html += `<div class="card"><h3>Playoff seeds</h3>
        <p><strong>AFC:</strong> ${state.playoffs.afc.map((id, i) => `${i + 1}. ${teamLabel(id)}`).join(" · ")}</p>
        <p><strong>NFC:</strong> ${state.playoffs.nfc.map((id, i) => `${i + 1}. ${teamLabel(id)}`).join(" · ")}</p>
        ${state.playoffs.championId ? `<p><strong>Champion:</strong> ${teamName(state.playoffs.championId)}</p>` : ""}
      </div>`;
    }
    panel.innerHTML = html;
  }

  function renderCap() {
    const t = E.userTeam(state);
    const hit = E.teamCapHit(t);
    const room = state.salaryCap - hit;
    const pct = Math.min(100, Math.round((hit / state.salaryCap) * 100));
    const panel = $("#panel-cap");
    let html = `<div class="card"><h3>Salary cap</h3>
      <div>${E.money(hit)} of ${E.money(state.salaryCap)} · room ${E.money(room)}</div>
      <div class="bar"><span style="width:${pct}%;background:${room < 0 ? "var(--danger)" : "var(--accent)"}"></span></div>
      <p class="muted small" style="margin-top:8px">Simplified dynasty contracts (not real NFL deals). Cap rises ~2%/year.</p></div>`;
    html += `<div class="card"><h3>Contracts</h3><table class="table"><thead><tr><th>Player</th><th>OVR</th><th>Age</th><th>Left</th><th>AAV</th></tr></thead><tbody>`;
    const bySal = t.roster.slice().sort((a, b) => b.salary - a.salary);
    for (const p of bySal) {
      html += `<tr><td>${p.n}</td><td>${ovrBadge(p.ovr)}</td><td>${p.age}</td><td>${p.yearsLeft}y</td><td>${E.money(p.salary)}</td></tr>`;
    }
    html += `</tbody></table></div>`;
    panel.innerHTML = html;
  }

  function renderHistory() {
    const panel = $("#panel-history");
    if (!state.history.length) {
      panel.innerHTML = `<div class="card"><h3>Franchise history</h3><p class="muted">Finish a season to record it here.</p></div>`;
      return;
    }
    let html = `<div class="card"><h3>Franchise history</h3><table class="table"><thead><tr><th>Year</th><th>Record</th><th>Result</th><th>OVR</th></tr></thead><tbody>`;
    for (const h of state.history.slice().reverse()) {
      html += `<tr><td>${h.year}</td><td>${E.recordStr(h.record.w, h.record.l, h.record.t)}</td><td>${h.result}</td><td>${h.ovr}</td></tr>`;
    }
    html += `</tbody></table></div>`;
    panel.innerHTML = html;
  }

  function onPrimary() {
    if (state.phase === "offseason") {
      show("offseason");
      renderOffseason();
      return;
    }
    if (state.phase === "recap") {
      // should already move to offseason in finalize
      state.phase = "offseason";
      state.offseasonStep = state.offseasonStep || "resign";
      show("offseason");
      renderOffseason();
      E.save(state);
      return;
    }
    E.simWeek(state);
    if (state.phase === "offseason") {
      show("offseason");
      renderOffseason();
    } else {
      renderSeason();
    }
    E.save(state);
  }

  /* -------- Offseason -------- */
  function renderOffseason() {
    renderTeamChip($("#osTeamChip"));
    refreshMeta();
    const step = state.offseasonStep || "resign";
    $("#osStepLabel").textContent = ({ resign: "Resign players", fa: "Free agency", draft: "Draft", progress: "Progression", done: "Ready" })[step];
    $("#osCapLabel").textContent = `Room ${E.money(state.salaryCap - E.teamCapHit(E.userTeam(state)))}`;
    const body = $("#osBody");
    const btn = $("#btnOsPrimary");

    if (step === "resign") {
      // Ensure expired collected once
      if (!state._expiredReady) {
        const expired = E.collectExpired(state);
        state._userExpired = expired.filter((p) => p.fromTeamId === state.userTeamId);
        E.cpuResign(state, E.mulberry32(E.hashSeed(state.rngSeed + ":resign" + state.year)));
        state._expiredReady = true;
        E.save(state);
      }
      const list = state._userExpired || [];
      let html = `<div class="card"><h3>Resign your free agents</h3>
        <p class="muted small">Contract years hit zero. Re-sign who you want, then continue — unsigned players stay in free agency.</p>`;
      if (!list.length) html += `<p class="muted">No pending resigns.</p>`;
      for (const p of list) {
        const still = state.freeAgents.some((x) => x.id === p.id);
        if (!still) continue;
        html += `<div class="list-actions" style="padding:8px 0;border-top:1px solid var(--line)">
          <div><strong>${p.n}</strong> ${p.pos} ${ovrBadge(p.ovr)} · age ${p.age}<div class="muted small">Asking ${E.money(p.asking)}</div></div>
          <div class="actions">
            <button type="button" class="btn btn-sm btn-primary" data-resign="${p.id}">Re-sign</button>
            <button type="button" class="btn btn-sm btn-ghost" data-release="${p.id}">Let walk</button>
          </div>
        </div>`;
      }
      html += `</div>`;
      body.innerHTML = html;
      btn.textContent = "Continue to free agency";
      body.querySelectorAll("[data-resign]").forEach((b) => b.addEventListener("click", () => {
        const id = +b.dataset.resign;
        const p = state.freeAgents.find((x) => x.id === id);
        if (!p) return;
        const sal = p.asking || p.salary;
        if (E.teamCapHit(E.userTeam(state)) + sal > state.salaryCap) return toast("Over the cap");
        const years = E.contractYears(p.ovr, p.age);
        E.userTeam(state).roster.push({ ...p, salary: sal, yearsLeft: years, asking: undefined, fromTeamId: undefined });
        E.userTeam(state).roster = E.sortRoster(E.userTeam(state).roster);
        E.recomputeRatings(E.userTeam(state));
        state.freeAgents = state.freeAgents.filter((x) => x.id !== id);
        state._userExpired = (state._userExpired || []).filter((x) => x.id !== id);
        E.save(state); renderOffseason(); toast(`Re-signed ${p.n}`);
      }));
      body.querySelectorAll("[data-release]").forEach((b) => b.addEventListener("click", () => {
        const id = +b.dataset.release;
        state._userExpired = (state._userExpired || []).filter((x) => x.id !== id);
        E.save(state); renderOffseason();
      }));
      btn.onclick = () => {
        state.offseasonStep = "fa";
        state._expiredReady = false;
        E.cpuFreeAgency(state, E.mulberry32(E.hashSeed(state.rngSeed + ":fa" + state.year)));
        E.save(state); renderOffseason();
      };
      return;
    }

    if (step === "fa") {
      const fa = state.freeAgents.slice(0, 80);
      let html = `<div class="card"><h3>Free agency</h3>
        <p class="muted small">Sign players under the 53-man limit and salary cap. CPU clubs already took a pass.</p>
        <div class="filters"><input id="faSearch" placeholder="Search FA…" /><select id="faBucket"><option value="">All positions</option>${E.BUCKET_ORDER.map((b)=>`<option value="${b}">${b}</option>`).join("")}</select></div>
        <div id="faList"></div></div>`;
      body.innerHTML = html;
      const draw = () => {
        const q = ($("#faSearch").value || "").toLowerCase();
        const bucket = $("#faBucket").value;
        const needs = E.rosterNeeds(E.userTeam(state));
        const maxCount = state.rosterLimit || E.ROSTER_LIMIT || 53;
        let listHtml = "";
        for (const p of state.freeAgents) {
          if (bucket && p.bucket !== bucket) continue;
          if (q && !p.n.toLowerCase().includes(q)) continue;
          listHtml += `<div class="list-actions" style="padding:8px 0;border-top:1px solid var(--line)">
            <div><strong>${p.n}</strong> ${p.pos} ${ovrBadge(p.ovr)} · ${p.age} yrs old<div class="muted small">${E.money(p.asking || p.salary)} · ${p.bucket}</div></div>
            <button type="button" class="btn btn-sm btn-primary" data-sign="${p.id}">Sign</button>
          </div>`;
        }
        $("#faList").innerHTML = listHtml || `<p class="muted">No players.</p>`;
        $("#faList").querySelectorAll("[data-sign]").forEach((b) => b.addEventListener("click", () => {
          const id = +b.dataset.sign;
          const p = state.freeAgents.find((x) => x.id === id);
          if (!p) return;
          const team = E.userTeam(state);
          if (team.roster.length >= maxCount) return toast("Roster full (53)");
          const sal = p.asking || p.salary;
          if (E.teamCapHit(team) + sal > state.salaryCap) return toast("Over the cap");
          team.roster.push({ ...p, salary: sal, yearsLeft: E.contractYears(p.ovr, p.age), asking: undefined, fromTeamId: undefined });
          team.roster = E.sortRoster(team.roster);
          E.recomputeRatings(team);
          state.freeAgents = state.freeAgents.filter((x) => x.id !== id);
          E.save(state); refreshMeta(); draw(); toast(`Signed ${p.n}`);
        }));
      };
      $("#faSearch").addEventListener("input", draw);
      $("#faBucket").addEventListener("change", draw);
      draw();
      btn.textContent = "Continue to draft";
      btn.onclick = () => {
        const rng = E.mulberry32(E.hashSeed(state.rngSeed + ":draft" + state.year));
        state.draft = {
          order: E.draftOrder(state),
          pool: E.generateDraftClass(state.year + 1, rng),
          pickIndex: 0,
          picksTotal: 32 * 3, // 3 rounds v1
          log: []
        };
        E.runCpuDraftPicks(state, rng, true);
        state.offseasonStep = "draft";
        E.save(state); renderOffseason();
      };
      return;
    }

    if (step === "draft") {
      const d = state.draft;
      const onClock = d.order[d.pickIndex % 32];
      const round = Math.floor(d.pickIndex / 32) + 1;
      const pickInRound = (d.pickIndex % 32) + 1;
      let html = `<div class="card"><h3>Draft · Round ${round}, Pick ${pickInRound}</h3>`;
      if (d.pickIndex >= d.picksTotal) {
        html += `<p class="muted">Draft complete (3 rounds in v1).</p></div>`;
        body.innerHTML = html;
        btn.textContent = "Run progression";
        btn.onclick = () => {
          const rng = E.mulberry32(E.hashSeed(state.rngSeed + ":age" + state.year));
          state.offseasonLog = E.ageAndProgress(state, rng);
          state.offseasonStep = "progress";
          E.save(state); renderOffseason();
        };
        return;
      }
      if (onClock !== state.userTeamId) {
        html += `<p class="muted">CPU is picking…</p></div>`;
        body.innerHTML = html;
        btn.textContent = "Sim to my pick";
        btn.onclick = () => {
          E.runCpuDraftPicks(state, E.mulberry32(E.hashSeed(state.rngSeed + ":d" + d.pickIndex)), true);
          if (state.draft.pickIndex >= state.draft.picksTotal) {
            /* fall through */
          }
          E.save(state); renderOffseason();
        };
        // auto-kick once
        setTimeout(() => {
          if (state.offseasonStep === "draft" && state.draft && state.draft.order[state.draft.pickIndex % 32] !== state.userTeamId) {
            E.runCpuDraftPicks(state, E.mulberry32(E.hashSeed(state.rngSeed + ":d" + state.draft.pickIndex)), true);
            E.save(state); renderOffseason();
          }
        }, 50);
        return;
      }
      html += `<p class="muted small">You're on the clock. Board sorted by overall.</p>`;
      const board = d.pool.slice(0, 40);
      for (const p of board) {
        html += `<div class="list-actions" style="padding:8px 0;border-top:1px solid var(--line)">
          <div><strong>#${p.draftRank}</strong> ${p.n} · ${p.pos} ${ovrBadge(p.ovr)} · age ${p.age}</div>
          <button type="button" class="btn btn-sm btn-primary" data-draft="${p.id}">Draft</button>
        </div>`;
      }
      html += `</div>`;
      body.innerHTML = html;
      btn.textContent = "Auto-pick best need";
      body.querySelectorAll("[data-draft]").forEach((b) => b.addEventListener("click", () => {
        draftPlayer(+b.dataset.draft);
      }));
      btn.onclick = () => {
        const needs = E.rosterNeeds(E.userTeam(state)).gaps.map((g) => g.bucket);
        let pick = needs.length ? d.pool.find((p) => needs.includes(p.bucket)) : null;
        if (!pick) pick = d.pool[0];
        if (pick) draftPlayer(pick.id);
      };
      return;
    }

    if (step === "progress") {
      const log = state.offseasonLog || [];
      let html = `<div class="card"><h3>Offseason progression</h3>
        <p class="muted small">Young players (≤28) improve · older players (31+) regress · some retire.</p>`;
      const mine = log.filter((x) => x.teamId === state.userTeamId);
      if (!mine.length) html += `<p class="muted">No notable changes on your roster.</p>`;
      for (const x of mine.slice(0, 40)) {
        if (x.retired) html += `<div class="muted small">${x.name} retired (age ${x.age}, OVR ${x.ovr})</div>`;
        else html += `<div class="muted small">${x.name}: ${x.before} → <strong>${x.after}</strong> (age ${x.age})</div>`;
      }
      html += `</div>`;
      body.innerHTML = html;
      btn.textContent = `Start ${state.year + 1} season`;
      btn.onclick = () => {
        E.startNextSeason(state);
        delete state._expiredReady;
        delete state._userExpired;
        E.save(state);
        show("season");
        activeTab = "schedule";
        renderSeason();
        toast(`${state.year} season underway`);
      };
      return;
    }
  }

  function draftPlayer(pid) {
    const d = state.draft;
    const p = d.pool.find((x) => x.id === pid);
    if (!p) return;
    const team = E.userTeam(state);
    const maxCount = state.rosterLimit || E.ROSTER_LIMIT || 53;
    // If full at bucket, still allow but cut lowest ovr same bucket backup if needed
    const have = team.roster.filter((x) => x.bucket === p.bucket);
    const need = (E.STARTER_NEEDS[p.bucket] || 0) + (E.BACKUP_NEEDS[p.bucket] || 0);
    if (have.length >= need) {
      const cut = have.slice().sort((a, b) => a.ovr - b.ovr)[0];
      team.roster = team.roster.filter((x) => x.id !== cut.id);
      state.freeAgents.push({ ...cut, asking: Math.round(cut.salary * 1.05 / 50000) * 50000, yearsLeft: 0 });
      toast(`Cut ${cut.n} to make room`);
    } else if (team.roster.length >= maxCount) {
      return toast("Roster full");
    }
    const sal = Math.min(E.salaryFor(p.ovr, p.age), 6500000);
    team.roster.push({ ...p, salary: sal, yearsLeft: 4 });
    team.roster = E.sortRoster(team.roster);
    E.recomputeRatings(team);
    d.pool = d.pool.filter((x) => x.id !== pid);
    d.log.push({ pick: d.pickIndex + 1, teamId: team.id, player: p });
    d.pickIndex++;
    E.runCpuDraftPicks(state, E.mulberry32(E.hashSeed(state.rngSeed + ":d" + d.pickIndex)), true);
    E.save(state);
    renderOffseason();
  }

  /* -------- Boot -------- */
  async function boot() {
    // Mode-first: if ?mode=nfl or returning save, skip hub appropriately
    const params = new URLSearchParams(location.search);
    $("#btnModeNFL").addEventListener("click", () => {
      history.replaceState({}, "", "?mode=nfl");
      show("picker");
      renderPicker();
    });
    $("#btnBackMode").addEventListener("click", () => {
      show("mode");
    });
    $("#teamSearch").addEventListener("input", renderPicker);
    $("#confFilter").addEventListener("change", renderPicker);
    $("#btnPrimary").addEventListener("click", onPrimary);
    $("#btnFullReset").addEventListener("click", () => {
      if (!confirm("Full reset? This clears your dynasty save.")) return;
      E.clearSave();
      state = null;
      show("mode");
      toast("Dynasty cleared");
    });
    $$(".tab").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

    const res = await fetch("data/league.json");
    league = await res.json();

    state = E.load();
    if (state && params.get("mode") !== "choose") {
      show(state.phase === "offseason" ? "offseason" : "season");
      if (state.phase === "offseason") renderOffseason();
      else renderSeason();
      return;
    }
    if (params.get("mode") === "nfl") {
      show("picker");
      renderPicker();
      return;
    }
    show("mode");
  }

  boot().catch((err) => {
    console.error(err);
    document.body.insertAdjacentHTML("beforeend", `<div class="toast">Failed to load league data</div>`);
  });
})();
