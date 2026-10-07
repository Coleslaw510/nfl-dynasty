/* NFL Dynasty UI */
(function () {
  "use strict";
  const E = window.NFLDynasty;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];

  let league = null;
  let state = null;
  let activeTab = "schedule";
  let osTab = "step"; // step | roster | cap
  let faSignId = null; // expand year picker for this FA id
  let resignSignId = null;
  let draftTradeMy = null;
  let draftTradeTheir = null;

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

  function escapeHtml(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function logoMark(t) {
    if (!t) return `<div class="box-logo" style="background:#64748b">?</div>`;
    return `<div class="box-logo" style="background:${t.color || "#64748b"}">${escapeHtml(t.abbr || "?")}</div>`;
  }

  /** CFB-style box score card from a completed game object */
  function boxHtml(g) {
    if (!g || g.homeScore == null) {
      return `<div class="box-empty">Sim a week to see your box score.</div>`;
    }
    const home = state.teamsById[g.homeId];
    const away = state.teamsById[g.awayId];
    const homeWin = g.homeScore > g.awayScore;
    const hs = g.homeStats || (g.stats && g.stats.home ? {
      passYds: g.stats.home.pass, rushYds: g.stats.home.rush, totalYds: (g.stats.home.pass||0)+(g.stats.home.rush||0),
      completions: "—", passAtt: "—", rushAtt: "—", turnovers: "—", thirdDownConv: "—", thirdDownAtt: "—", timeOfPoss: "—"
    } : null);
    const as = g.awayStats || (g.stats && g.stats.away ? {
      passYds: g.stats.away.pass, rushYds: g.stats.away.rush, totalYds: (g.stats.away.pass||0)+(g.stats.away.rush||0),
      completions: "—", passAtt: "—", rushAtt: "—", turnovers: "—", thirdDownConv: "—", thirdDownAtt: "—", timeOfPoss: "—"
    } : null);
    if (!hs || !as) return `<div class="box-empty">Box stats unavailable for this game.</div>`;

    const rows = [
      ["Total yards", as.totalYds, hs.totalYds],
      ["Pass yards", as.passYds, hs.passYds],
      ["Rush yards", as.rushYds, hs.rushYds],
      ["Pass C/A", `${as.completions}/${as.passAtt}`, `${hs.completions}/${hs.passAtt}`],
      ["Rush att", as.rushAtt, hs.rushAtt],
      ["Turnovers", as.turnovers, hs.turnovers],
      ["3rd downs", `${as.thirdDownConv}/${as.thirdDownAtt}`, `${hs.thirdDownConv}/${hs.thirdDownAtt}`],
      ["Time of poss", as.timeOfPoss, hs.timeOfPoss],
    ];
    const midParts = [];
    if (g.kind === "SB") midParts.push("Super Bowl");
    else if (g.kind === "CONF") midParts.push("Conference");
    else if (g.kind === "DIV" && g.week >= 19) midParts.push("Divisional");
    else if (g.kind === "WC") midParts.push("Wild Card");
    else midParts.push("Week " + (g.week || ""));
    if (g.ot) midParts.push("OT");
    const mid = midParts.filter(Boolean).join(" · ");

    function leadersBlock(label, leaders) {
      if (!leaders || !leaders.passing) return "";
      const p = leaders.passing;
      const r = (leaders.rushing && leaders.rushing[0]) || { name: "—", att: 0, yds: 0, td: 0 };
      const wr = (leaders.receiving && leaders.receiving[0]) || { name: "—", rec: 0, yds: 0, td: 0 };
      return `
        <div class="stat-block">
          <h3>${escapeHtml(label)} leaders</h3>
          <div class="leader-line"><strong>Pass</strong> ${escapeHtml(p.name)} ${p.comp}/${p.att}, ${p.yds} yds, ${p.td} TD, ${p.int} INT</div>
          <div class="leader-line"><strong>Rush</strong> ${escapeHtml(r.name)} ${r.att} car, ${r.yds} yds, ${r.td} TD</div>
          <div class="leader-line"><strong>Rec</strong> ${escapeHtml(wr.name)} ${wr.rec} rec, ${wr.yds} yds, ${wr.td} TD</div>
        </div>`;
    }

    return `
      <div class="box-card card">
        <div class="box-scoreline">
          <div class="box-team ${!homeWin ? "winner" : ""}">
            ${logoMark(away)}
            <div class="tname">${escapeHtml(away ? away.abbr : "AWAY")}</div>
            <div class="tscore">${g.awayScore}</div>
          </div>
          <div class="box-mid">${escapeHtml(mid)}<br/>FINAL</div>
          <div class="box-team ${homeWin ? "winner" : ""}">
            ${logoMark(home)}
            <div class="tname">${escapeHtml(home ? home.abbr : "HOME")}</div>
            <div class="tscore">${g.homeScore}</div>
          </div>
        </div>
        <div class="stat-grid">
          <div class="stat-block">
            <h3>Team stats</h3>
            ${rows.map(([label, a, h]) => `
              <div class="stat-row">
                <div class="l">${a}</div>
                <div class="c">${label}</div>
                <div class="r">${h}</div>
              </div>`).join("")}
            <div class="stat-row" style="margin-top:6px">
              <div class="l muted">${escapeHtml(away ? away.abbr : "AWAY")}</div>
              <div class="c"></div>
              <div class="r muted">${escapeHtml(home ? home.abbr : "HOME")}</div>
            </div>
          </div>
          ${leadersBlock(away ? away.abbr : "AWAY", g.awayLeaders)}
          ${leadersBlock(home ? home.abbr : "HOME", g.homeLeaders)}
        </div>
      </div>`;
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
    const chip = $("#capChip");
    chip.className = "chip chip-cap" + (room < 0 ? " is-over" : "");
    chip.innerHTML = `<span class="cap-label">Cap</span><span class="cap-figures"><strong>${moneyShort(hit)}</strong><span class="cap-sep">/</span>${moneyShort(state.salaryCap)}</span><span class="${roomCls}">${room < 0 ? "" : "+"}${moneyShort(room)}</span>`;
    const year = $("#yearChip");
    year.className = "chip chip-year";
    year.textContent = String(state.year);
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
  function syncTabPanels() {
    $$(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === activeTab));
    ["schedule", "box", "roster", "standings", "cap", "history"].forEach((t) => {
      const p = $(`#panel-${t}`);
      if (p) p.hidden = t !== activeTab;
    });
  }

  function setTab(tab) {
    activeTab = tab;
    syncTabPanels();
    renderActivePanel();
  }

  /** Live pointer to latest completed user game (matches CFB renderBox). */
  function resolveLastBox() {
    if (!state) return null;
    const live = E.latestUserGame(state);
    if (live) {
      state.lastBox = live;
      return live;
    }
    return state.lastBox && state.lastBox.homeScore != null ? state.lastBox : null;
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
    syncTabPanels();
    renderActivePanel();
  }

  function renderActivePanel() {
    if (activeTab === "schedule") renderSchedule();
    if (activeTab === "box") renderBoxPanel();
    if (activeTab === "roster") renderRoster();
    if (activeTab === "standings") renderStandings();
    if (activeTab === "cap") renderCap();
    if (activeTab === "history") renderHistory();
  }

  function renderBoxPanel() {
    const panel = $("#panel-box");
    if (!panel) return;
    panel.innerHTML = boxHtml(resolveLastBox());
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

  let rosterSort = { key: "ovr", dir: -1 };
  let rosterFilter = "ALL"; // ALL | bucket code | POS:XX

  function playerRowHtml(p) {
    return `<tr>
      <td>${p.pos}</td>
      <td>${p.n}${p.j ? ` <span class="muted small">#${p.j}</span>` : ""}</td>
      <td>${ovrBadge(p.ovr)}</td>
      <td>${p.age}</td>
      <td>${p.yearsLeft}</td>
      <td>${E.money(p.salary)}</td>
    </tr>`;
  }

  function sortPlayers(list) {
    const k = rosterSort.key;
    const dir = rosterSort.dir;
    return list.slice().sort((a, b) => {
      if (k === "pos") {
        const bi = (p) => E.BUCKET_ORDER.indexOf(p.bucket);
        return dir * (bi(a) - bi(b) || b.ovr - a.ovr || a.n.localeCompare(b.n));
      }
      if (k === "n") return dir * a.n.localeCompare(b.n);
      if (k === "ovr") return dir * (a.ovr - b.ovr) || a.n.localeCompare(b.n);
      if (k === "age") return dir * (a.age - b.age) || b.ovr - a.ovr;
      if (k === "yearsLeft") return dir * (a.yearsLeft - b.yearsLeft) || b.ovr - a.ovr;
      if (k === "salary") return dir * (a.salary - b.salary) || b.ovr - a.ovr;
      return b.ovr - a.ovr;
    });
  }

  function renderRoster() {
    const t = E.userTeam(state);
    const panel = $("#panel-roster");
    const limit = state.rosterLimit || E.ROSTER_LIMIT || 53;
    const positions = [...new Set(t.roster.map((p) => p.pos))].sort((a, b) => a.localeCompare(b));
    const bucketsPresent = E.BUCKET_ORDER.filter((b) => t.roster.some((p) => p.bucket === b));

    let filtered = t.roster;
    if (rosterFilter.startsWith("POS:")) {
      const pos = rosterFilter.slice(4);
      filtered = t.roster.filter((p) => p.pos === pos);
    } else if (rosterFilter !== "ALL") {
      filtered = t.roster.filter((p) => p.bucket === rosterFilter);
    }

    const mark = (key) => rosterSort.key === key ? (rosterSort.dir > 0 ? " ▲" : " ▼") : "";
    const th = () => `<thead><tr>
      <th data-sort="pos">Pos${mark("pos")}</th>
      <th data-sort="n">Player${mark("n")}</th>
      <th data-sort="ovr">OVR${mark("ovr")}</th>
      <th data-sort="age">Age${mark("age")}</th>
      <th data-sort="yearsLeft">Yrs${mark("yearsLeft")}</th>
      <th data-sort="salary">Salary${mark("salary")}</th>
    </tr></thead>`;

    let html = `<div class="card roster-card">
      <div class="roster-toolbar">
        <div>
          <h3 style="margin:0">Roster · ${t.roster.length}/${limit}</h3>
          <p class="muted small" style="margin:4px 0 0">Grouped by position. Filter with the dropdown.</p>
        </div>
        <label class="roster-filter">
          <span class="muted small">Position</span>
          <select id="rosterPosFilter">
            <option value="ALL"${rosterFilter === "ALL" ? " selected" : ""}>All groups</option>
            <optgroup label="Groups">
              ${bucketsPresent.map((b) => `<option value="${b}"${rosterFilter === b ? " selected" : ""}>${b}</option>`).join("")}
            </optgroup>
            <optgroup label="Exact position">
              ${positions.map((p) => `<option value="POS:${p}"${rosterFilter === "POS:" + p ? " selected" : ""}>${p}</option>`).join("")}
            </optgroup>
          </select>
        </label>
      </div>`;

    if (rosterFilter === "ALL") {
      for (const bucket of bucketsPresent) {
        const group = sortPlayers(filtered.filter((p) => p.bucket === bucket));
        if (!group.length) continue;
        html += `<div class="pos-group">
          <div class="pos-group-head"><strong>${bucket}</strong><span class="muted small">${group.length}</span></div>
          <div class="table-wrap"><table class="table sortable">${th()}<tbody>`;
        for (const p of group) html += playerRowHtml(p);
        html += `</tbody></table></div></div>`;
      }
    } else {
      const group = sortPlayers(filtered);
      const label = rosterFilter.startsWith("POS:") ? rosterFilter.slice(4) : rosterFilter;
      html += `<div class="pos-group">
        <div class="pos-group-head"><strong>${label}</strong><span class="muted small">${group.length}</span></div>
        <div class="table-wrap"><table class="table sortable">${th()}<tbody>`;
      if (!group.length) html += `<tr><td colspan="6" class="muted">No players at this position.</td></tr>`;
      for (const p of group) html += playerRowHtml(p);
      html += `</tbody></table></div></div>`;
    }
    html += `</div>`;

    const needs = E.rosterNeeds(t.roster);
    if (needs.gaps.length) {
      html += `<div class="card"><h3>Depth gaps</h3><p class="muted small">${needs.gaps.map((g) => `${g.bucket} ${g.have}/${g.need}`).join(" · ")}</p></div>`;
    }
    panel.innerHTML = html;

    const sel = $("#rosterPosFilter");
    if (sel) sel.addEventListener("change", () => {
      rosterFilter = sel.value;
      renderRoster();
    });
    panel.querySelectorAll("th[data-sort]").forEach((el) => {
      el.style.cursor = "pointer";
      el.addEventListener("click", () => {
        const key = el.dataset.sort;
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
    const userBox = E.simWeek(state);
    if (state.phase === "offseason") {
      show("offseason");
      renderOffseason();
    } else {
      // CFB behavior: sim → show latest box on Box tab (schedule on bye)
      activeTab = userBox ? "box" : "schedule";
      show("season");
      renderSeason();
      if (userBox) {
        toast(`Week ${userBox.week} final · ${teamLabel(userBox.awayId)} ${userBox.awayScore}–${userBox.homeScore} ${teamLabel(userBox.homeId)}`);
      }
    }
    E.save(state);
  }

  /* -------- Offseason -------- */
  function rosterLimit() {
    return (state && state.rosterLimit) || E.ROSTER_LIMIT || 53;
  }

  function spotsLeft() {
    return rosterLimit() - E.userTeam(state).roster.length;
  }

  function capacityBanner(extra) {
    const team = E.userTeam(state);
    const limit = rosterLimit();
    const left = limit - team.roster.length;
    const room = state.salaryCap - E.teamCapHit(team);
    const full = left <= 0;
    return `<div class="capacity-banner ${full ? "is-full" : ""}">
      <div><strong>${team.roster.length}/${limit}</strong> roster · <span class="${left <= 0 ? "bad" : ""}">${left} open</span></div>
      <div class="muted small">Cap room ${E.money(room)}${extra ? " · " + extra : ""}</div>
    </div>`;
  }

  function yearPickerHtml(p, selectedYears, dataAttr) {
    const opts = E.yearOptionsFor(p);
    const suggested = E.contractYears(p.ovr, p.age);
    const y = selectedYears || suggested;
    const terms = E.contractTerms(p, y);
    const buttons = opts.map((n) => {
      const t = E.contractTerms(p, n);
      const active = n === y ? " active" : "";
      return `<button type="button" class="year-chip${active}" data-years="${n}" ${dataAttr}>${n}y · ${E.money(t.aav)}/yr</button>`;
    }).join("");
    return `<div class="contract-picker">
      <div class="muted small">Deal terms · suggested ${suggested}y</div>
      <div class="year-row">${buttons}</div>
      <div class="contract-summary"><strong>${terms.years} yrs</strong> · ${E.money(terms.aav)}/yr · total ${E.money(terms.total)}</div>
    </div>`;
  }

  function ensureExpiredCollected() {
    if (state._contractsYear !== state.year) {
      E.tickContracts(state);
      state._contractsYear = state.year;
      state._expiredReady = false;
      state._userExpired = null;
    }
    if (!state._expiredReady) {
      const expired = E.collectExpired(state);
      state._userExpired = expired.filter((p) => p.fromTeamId === state.userTeamId);
      E.cpuResign(state, E.mulberry32(E.hashSeed(state.rngSeed + ":resign" + state.year)));
      state._expiredReady = true;
      E.save(state);
    }
  }

  function syncOsTabs() {
    $$("#osTabs .tab").forEach((b) => b.classList.toggle("active", b.dataset.osTab === osTab));
  }

  function renderOffseason() {
    renderTeamChip($("#osTeamChip"));
    refreshMeta();
    const step = state.offseasonStep || "resign";
    $("#osStepLabel").textContent = ({
      resign: "Re-sign",
      fa: "Free agency",
      draft: "Draft",
      progress: "Progression",
      done: "Ready"
    })[step] || step;
    const team = E.userTeam(state);
    $("#osCapLabel").textContent = `${team.roster.length}/${rosterLimit()} · Room ${E.money(state.salaryCap - E.teamCapHit(team))}`;
    const btn = $("#btnOsPrimary");
    btn.disabled = false;
    syncOsTabs();

    if (osTab === "roster") {
      renderOsRoster();
      btn.textContent = stepContinueLabel(step);
      return;
    }
    if (osTab === "cap") {
      renderOsCap();
      btn.textContent = stepContinueLabel(step);
      return;
    }

    if (step === "resign") return renderResignStep(btn);
    if (step === "fa") return renderFaStep(btn);
    if (step === "draft") return renderDraftStep(btn);
    if (step === "progress") return renderProgressStep(btn);

    $("#osBody").innerHTML = `<div class="card"><p class="muted">Unknown offseason step.</p></div>`;
    btn.textContent = "Continue";
  }

  function stepContinueLabel(step) {
    return ({
      resign: "Continue to free agency",
      fa: "Continue to draft",
      draft: state.draft && state.draft.pickIndex >= (state.draft.picksTotal || 0) ? "Run progression" : "Sim to my pick",
      progress: `Start ${state.year + 1} season`
    })[step] || "Continue";
  }

  function renderOsRoster() {
    const body = $("#osBody");
    const team = E.userTeam(state);
    const limit = rosterLimit();
    let html = capacityBanner("Cut anyone to open a roster spot — they’ll hit free agency.");
    html += `<div class="card"><h3>My roster · cut to make room</h3>
      <p class="muted small">Sorted by OVR (lowest first). Cutting frees a spot immediately.</p>`;
    const sorted = team.roster.slice().sort((a, b) => a.ovr - b.ovr || b.salary - a.salary);
    for (const p of sorted) {
      html += `<div class="list-actions" style="padding:8px 0;border-top:1px solid var(--line)">
        <div><strong>${escapeHtml(p.n)}</strong> ${escapeHtml(p.pos)} ${ovrBadge(p.ovr)} · age ${p.age}
          <div class="muted small">${E.money(p.salary)} · ${p.yearsLeft}y left</div></div>
        <button type="button" class="btn btn-sm btn-ghost danger" data-cut="${p.id}">Cut</button>
      </div>`;
    }
    if (!sorted.length) html += `<p class="muted">Roster empty.</p>`;
    html += `</div>`;
    body.innerHTML = html;
    body.querySelectorAll("[data-cut]").forEach((b) => b.addEventListener("click", () => {
      const id = +b.dataset.cut;
      const cut = E.releasePlayer(state, state.userTeamId, id, true);
      if (!cut) return;
      E.save(state);
      refreshMeta();
      renderOffseason();
      toast(`Cut ${cut.n} · ${spotsLeft()} spots open`);
    }));
  }

  function renderOsCap() {
    const body = $("#osBody");
    const t = E.userTeam(state);
    const hit = E.teamCapHit(t);
    const room = state.salaryCap - hit;
    const pct = Math.min(100, Math.round((hit / state.salaryCap) * 100));
    let html = capacityBanner();
    html += `<div class="card"><h3>Salary cap</h3>
      <div>${E.money(hit)} of ${E.money(state.salaryCap)} · room ${E.money(room)}</div>
      <div class="bar"><span style="width:${pct}%;background:${room < 0 ? "var(--danger)" : "var(--accent)"}"></span></div></div>`;
    html += `<div class="card"><h3>Contracts</h3><table class="table"><thead><tr><th>Player</th><th>OVR</th><th>Age</th><th>Left</th><th>AAV</th></tr></thead><tbody>`;
    for (const p of t.roster.slice().sort((a, b) => b.salary - a.salary)) {
      html += `<tr><td>${escapeHtml(p.n)}</td><td>${ovrBadge(p.ovr)}</td><td>${p.age}</td><td>${p.yearsLeft}y</td><td>${E.money(p.salary)}</td></tr>`;
    }
    html += `</tbody></table></div>`;
    body.innerHTML = html;
  }

  function renderResignStep(btn) {
    ensureExpiredCollected();
    const body = $("#osBody");
    const list = state._userExpired || [];
    let html = capacityBanner("Pick a contract length before re-signing.");
    html += `<div class="card"><h3>Re-sign your free agents</h3>
      <p class="muted small">Contract years hit zero. Choose length, then re-sign — or let them walk into free agency. Use the <strong>Roster</strong> tab anytime to cut.</p>`;
    let pending = 0;
    for (const p of list) {
      const still = (state.freeAgents || []).some((x) => x.id === p.id);
      if (!still) continue;
      pending++;
      const open = resignSignId === p.id;
      const suggested = E.contractYears(p.ovr, p.age);
      const chosen = (state._resignYears && state._resignYears[p.id]) || suggested;
      html += `<div class="sign-row" style="padding:10px 0;border-top:1px solid var(--line)">
        <div class="list-actions">
          <div><strong>${escapeHtml(p.n)}</strong> ${escapeHtml(p.pos)} ${ovrBadge(p.ovr)} · age ${p.age}
            <div class="muted small">Asking ~${E.money(p.asking)}</div></div>
          <div class="actions">
            <button type="button" class="btn btn-sm btn-primary" data-resign-open="${p.id}">${open ? "Hide" : "Re-sign…"}</button>
            <button type="button" class="btn btn-sm btn-ghost" data-release="${p.id}">Let walk</button>
          </div>
        </div>`;
      if (open) {
        html += yearPickerHtml(p, chosen, `data-resign-years="${p.id}"`);
        html += `<div class="actions" style="margin-top:8px">
          <button type="button" class="btn btn-sm btn-primary" data-resign-confirm="${p.id}">Confirm re-sign</button>
        </div>`;
      }
      html += `</div>`;
    }
    if (!pending) {
      html += `<p class="muted">No pending re-signs. Hit Continue for free agency (${(state.freeAgents || []).length} players).</p>`;
    }
    html += `</div>`;
    body.innerHTML = html;
    btn.textContent = "Continue to free agency";

    body.querySelectorAll("[data-resign-open]").forEach((b) => b.addEventListener("click", () => {
      const id = +b.dataset.resignOpen;
      resignSignId = resignSignId === id ? null : id;
      renderOffseason();
    }));
    body.querySelectorAll("[data-resign-years]").forEach((b) => b.addEventListener("click", () => {
      const id = +b.dataset.resignYears;
      const years = +b.dataset.years;
      const p = state.freeAgents.find((x) => x.id === id);
      if (!p) return;
      // stash chosen years on pending map
      state._resignYears = state._resignYears || {};
      state._resignYears[id] = years;
      resignSignId = id;
      renderOffseason();
    }));
    // re-apply selected year highlight via _resignYears when rendering - fix yearPicker to use stored
    body.querySelectorAll("[data-resign-confirm]").forEach((b) => b.addEventListener("click", () => {
      const id = +b.dataset.resignConfirm;
      doResign(id);
    }));
    body.querySelectorAll("[data-release]").forEach((b) => b.addEventListener("click", () => {
      const id = +b.dataset.release;
      state._userExpired = (state._userExpired || []).filter((x) => x.id !== id);
      resignSignId = null;
      E.save(state);
      renderOffseason();
      toast("Player will hit free agency");
    }));

    // If year chips need stored years, re-render picker correctly:
    // patch: when opening, use state._resignYears[id]
  }

  function doResign(id) {
    const p = state.freeAgents.find((x) => x.id === id);
    if (!p) return;
    const team = E.userTeam(state);
    if (team.roster.length >= rosterLimit()) {
      osTab = "roster";
      toast("Roster full — cut someone on the Roster tab first");
      renderOffseason();
      return;
    }
    const years = (state._resignYears && state._resignYears[id]) || E.contractYears(p.ovr, p.age);
    const terms = E.contractTerms(p, years);
    if (E.teamCapHit(team) + terms.aav > state.salaryCap) {
      toast("Over the cap for that deal");
      return;
    }
    team.roster.push({ ...p, salary: terms.aav, yearsLeft: terms.years, asking: undefined, fromTeamId: undefined });
    team.roster = E.sortRoster(team.roster);
    E.recomputeRatings(team);
    state.freeAgents = state.freeAgents.filter((x) => x.id !== id);
    state._userExpired = (state._userExpired || []).filter((x) => x.id !== id);
    resignSignId = null;
    E.save(state);
    renderOffseason();
    toast(`Re-signed ${p.n} · ${terms.years}y / ${E.money(terms.aav)}`);
  }

  function renderFaStep(btn) {
    if (!Array.isArray(state.freeAgents)) state.freeAgents = [];
    const body = $("#osBody");
    const team = E.userTeam(state);
    const left = spotsLeft();
    let html = capacityBanner(left <= 0
      ? "Roster full — open Roster tab and cut before signing."
      : "Choose contract length when you sign.");
    html += `<div class="card"><h3>Free agency</h3>
      <p class="muted small">${state.freeAgents.length} on the market. Sign under the 53-man limit and salary cap.
        <button type="button" class="btn btn-sm btn-ghost" id="btnOsGotoRoster">Manage roster</button></p>
      <div class="filters">
        <input id="faSearch" placeholder="Search FA…" />
        <select id="faBucket"><option value="">All positions</option>${E.BUCKET_ORDER.map((b) => `<option value="${b}">${b}</option>`).join("")}</select>
      </div>
      <div id="faList"></div></div>`;

    // Quick-cut strip of lowest OVRs when full or nearly full
    if (left <= 2) {
      const lowest = team.roster.slice().sort((a, b) => a.ovr - b.ovr).slice(0, 8);
      html += `<div class="card"><h3>Quick cuts</h3><p class="muted small">Free a spot without leaving FA.</p>`;
      for (const p of lowest) {
        html += `<div class="list-actions" style="padding:6px 0;border-top:1px solid var(--line)">
          <div><strong>${escapeHtml(p.n)}</strong> ${escapeHtml(p.pos)} ${ovrBadge(p.ovr)} · ${E.money(p.salary)}</div>
          <button type="button" class="btn btn-sm btn-ghost danger" data-cut="${p.id}">Cut</button>
        </div>`;
      }
      html += `</div>`;
    }

    body.innerHTML = html;
    btn.textContent = "Continue to draft";

    const goto = $("#btnOsGotoRoster");
    if (goto) goto.addEventListener("click", () => { osTab = "roster"; renderOffseason(); });

    body.querySelectorAll("[data-cut]").forEach((b) => b.addEventListener("click", () => {
      const cut = E.releasePlayer(state, state.userTeamId, +b.dataset.cut, true);
      if (!cut) return;
      E.save(state);
      refreshMeta();
      renderOffseason();
      toast(`Cut ${cut.n}`);
    }));

    const draw = () => {
      const q = (($("#faSearch") && $("#faSearch").value) || "").toLowerCase();
      const bucket = ($("#faBucket") && $("#faBucket").value) || "";
      let listHtml = "";
      let shown = 0;
      for (const p of state.freeAgents) {
        if (bucket && p.bucket !== bucket) continue;
        if (q && !(p.n || "").toLowerCase().includes(q)) continue;
        shown++;
        if (shown > 100) break;
        const open = faSignId === p.id;
        const years = (state._faYears && state._faYears[p.id]) || E.contractYears(p.ovr, p.age);
        listHtml += `<div class="sign-row" style="padding:10px 0;border-top:1px solid var(--line)">
          <div class="list-actions">
            <div><strong>${escapeHtml(p.n)}</strong> ${escapeHtml(p.pos)} ${ovrBadge(p.ovr)} · ${p.age} yrs
              <div class="muted small">${E.money(p.asking || p.salary)} ask · ${escapeHtml(p.bucket)}</div></div>
            <button type="button" class="btn btn-sm btn-primary" data-sign-open="${p.id}">${open ? "Hide" : (spotsLeft() <= 0 ? "Need room" : "Sign…")}</button>
          </div>`;
        if (open) {
          if (spotsLeft() <= 0) {
            listHtml += `<p class="muted small" style="margin:8px 0">Roster full. Cut someone above (Quick cuts) or use the Roster tab, then come back.</p>`;
          } else {
            listHtml += yearPickerHtml(Object.assign({}, p, { asking: p.asking || p.salary }), years, `data-fa-years="${p.id}"`);
            listHtml += `<div class="actions" style="margin-top:8px">
              <button type="button" class="btn btn-sm btn-primary" data-sign-confirm="${p.id}">Confirm sign</button>
            </div>`;
          }
        }
        listHtml += `</div>`;
      }
      $("#faList").innerHTML = listHtml || `<p class="muted">No players match.</p>`;
      $("#faList").querySelectorAll("[data-sign-open]").forEach((b) => b.addEventListener("click", () => {
        const id = +b.dataset.signOpen;
        if (spotsLeft() <= 0 && faSignId !== id) {
          toast("Roster full — cut a player first");
        }
        faSignId = faSignId === id ? null : id;
        draw();
        refreshMeta();
        // update capacity without full re-render of search
        const ban = body.querySelector(".capacity-banner");
        if (ban) ban.outerHTML = capacityBanner(spotsLeft() <= 0
          ? "Roster full — cut before signing."
          : "Choose contract length when you sign.");
      }));
      $("#faList").querySelectorAll("[data-fa-years]").forEach((b) => b.addEventListener("click", () => {
        const id = +b.dataset.faYears;
        state._faYears = state._faYears || {};
        state._faYears[id] = +b.dataset.years;
        faSignId = id;
        draw();
      }));
      $("#faList").querySelectorAll("[data-sign-confirm]").forEach((b) => b.addEventListener("click", () => {
        doFaSign(+b.dataset.signConfirm);
      }));
    };
    $("#faSearch").addEventListener("input", draw);
    $("#faBucket").addEventListener("change", draw);
    draw();
  }

  function doFaSign(id) {
    const p = state.freeAgents.find((x) => x.id === id);
    if (!p) return;
    const team = E.userTeam(state);
    if (team.roster.length >= rosterLimit()) {
      toast("Roster full — cut someone first");
      osTab = "roster";
      renderOffseason();
      return;
    }
    const years = (state._faYears && state._faYears[id]) || E.contractYears(p.ovr, p.age);
    const terms = E.contractTerms(p, years);
    if (E.teamCapHit(team) + terms.aav > state.salaryCap) {
      toast("Over the cap for that deal");
      return;
    }
    team.roster.push({ ...p, salary: terms.aav, yearsLeft: terms.years, asking: undefined, fromTeamId: undefined });
    team.roster = E.sortRoster(team.roster);
    E.recomputeRatings(team);
    state.freeAgents = state.freeAgents.filter((x) => x.id !== id);
    faSignId = null;
    E.save(state);
    refreshMeta();
    renderOffseason();
    toast(`Signed ${p.n} · ${terms.years}y / ${E.money(terms.aav)}`);
  }

  function beginDraft() {
    const rng = E.mulberry32(E.hashSeed(state.rngSeed + ":draft" + state.year));
    state.draft = E.initDraftState(state, rng, 3);
    draftTradeMy = null;
    draftTradeTheir = null;
  }

  function renderDraftStep(btn) {
    if (!state.draft) beginDraft();
    // migrate old draft saves without picks/stage
    if (!state.draft.picks) {
      beginDraft();
    }
    const d = state.draft;
    const body = $("#osBody");

    if (d.stage === "preview") {
      let html = capacityBanner("Browse the board, trade picks, then start the draft.");
      html += `<div class="card"><h3>Draft preview · ${d.rounds} rounds</h3>
        <p class="muted small">Your picks are highlighted. Trade up/down before the show starts.</p>`;
      html += draftPicksStrip(d);
      html += draftTradePanel(d);
      html += `<div class="actions" style="margin-top:12px">
        <button type="button" class="btn btn-primary" id="btnStartDraft">Start draft show</button>
      </div></div>`;
      html += prospectBoardHtml(d, 60, false);
      body.innerHTML = html;
      btn.textContent = "Start draft show";
      wireDraftTrade(body);
      const start = $("#btnStartDraft");
      if (start) start.addEventListener("click", () => {
        d.stage = "live";
        E.save(state);
        renderOffseason();
      });
      return;
    }

    if (d.pickIndex >= d.picksTotal) {
      d.stage = "done";
      let html = `<div class="card"><h3>Draft complete</h3>
        <p class="muted">${d.rounds} rounds in the books. Review the board, then run progression.</p>`;
      html += draftLogHtml(d, 40);
      html += `</div>`;
      body.innerHTML = html;
      btn.textContent = "Run progression";
      return;
    }

    const slot = E.currentDraftSlot(d);
    const onClock = slot.ownerId;
    const mine = onClock === state.userTeamId;
    let html = capacityBanner(`Round ${slot.round}, pick ${slot.pickInRound} (overall #${slot.overall})`);
    html += `<div class="card draft-clock">
      <div class="eyebrow">On the clock</div>
      <strong>${escapeHtml(teamName(onClock))}</strong>
      <div class="muted small">R${slot.round} · Pick ${slot.pickInRound} · Overall ${slot.overall}
        ${slot.originalTeamId !== slot.ownerId ? ` · via ${escapeHtml(teamLabel(slot.originalTeamId))}` : ""}</div>
    </div>`;

    html += draftPicksStrip(d);
    html += `<div class="card"><h3>Recent picks</h3>${draftLogHtml(d, 12)}</div>`;

    if (!mine) {
      const next = d.log.length ? d.log[d.log.length - 1] : null;
      html += `<div class="card"><p class="muted">Waiting on ${escapeHtml(teamLabel(onClock))}. Reveal picks one at a time, or jump to yours.</p>
        <div class="actions">
          <button type="button" class="btn btn-primary" id="btnRevealPick">Reveal next pick</button>
          <button type="button" class="btn btn-ghost" id="btnSimToMine">Sim to my pick</button>
        </div></div>`;
      html += prospectBoardHtml(d, 25, false);
      body.innerHTML = html;
      btn.textContent = "Sim to my pick";
      $("#btnRevealPick").addEventListener("click", () => revealNextPick());
      $("#btnSimToMine").addEventListener("click", () => simToMyPick());
      return;
    }

    html += draftTradePanel(d);
    html += `<div class="card"><h3>You're on the clock</h3>
      <p class="muted small">Draft a prospect below, auto-pick best need, or trade this pick away.</p>
      <div class="actions">
        <button type="button" class="btn btn-ghost" id="btnAutoPick">Auto-pick best need</button>
      </div></div>`;
    html += prospectBoardHtml(d, 40, true);
    body.innerHTML = html;
    btn.textContent = "Auto-pick best need";
    wireDraftTrade(body);
    const auto = $("#btnAutoPick");
    if (auto) auto.addEventListener("click", () => autoPickUser());
    body.querySelectorAll("[data-draft]").forEach((b) => b.addEventListener("click", () => {
      draftPlayer(+b.dataset.draft);
    }));
  }

  function draftPicksStrip(d) {
    const uid = state.userTeamId;
    const upcoming = d.picks.filter((p) => p.overall > d.pickIndex).slice(0, 16);
    let html = `<div class="card"><h3>Upcoming picks</h3><div class="pick-strip">`;
    for (const p of upcoming) {
      const mine = p.ownerId === uid;
      html += `<div class="pick-chip ${mine ? "mine" : ""}" title="${escapeHtml(teamName(p.ownerId))}">
        <span class="pk">#${p.overall}</span>
        <span class="tm">${escapeHtml(teamLabel(p.ownerId))}</span>
      </div>`;
    }
    html += `</div>`;
    const mine = d.picks.filter((p) => p.ownerId === uid && !p.playerId && p.overall > d.pickIndex);
    html += `<p class="muted small" style="margin-top:8px">Your remaining picks: ${mine.map((p) => `#${p.overall} (R${p.round})`).join(", ") || "none"}</p></div>`;
    return html;
  }

  function draftLogHtml(d, n) {
    const rows = d.log.slice(-n).reverse();
    if (!rows.length) return `<p class="muted small">No picks yet.</p>`;
    let html = `<div class="draft-log">`;
    for (const e of rows) {
      const p = e.player;
      html += `<div class="draft-log-row">
        <span class="pk">#${e.pick}</span>
        <span class="tm">${escapeHtml(teamLabel(e.teamId))}</span>
        <span class="pl"><strong>${escapeHtml(p.n)}</strong> ${escapeHtml(p.pos)} ${ovrBadge(p.ovr)}</span>
      </div>`;
    }
    html += `</div>`;
    return html;
  }

  function prospectBoardHtml(d, limit, canDraft) {
    let html = `<div class="card"><h3>Prospect board</h3>
      <p class="muted small">Top available by overall.</p>`;
    const board = d.pool.slice(0, limit);
    for (const p of board) {
      html += `<div class="list-actions" style="padding:8px 0;border-top:1px solid var(--line)">
        <div><strong>#${p.draftRank}</strong> ${escapeHtml(p.n)} · ${escapeHtml(p.pos)} ${ovrBadge(p.ovr)} · age ${p.age}
          <div class="muted small">${escapeHtml(p.bucket)}</div></div>
        ${canDraft ? `<button type="button" class="btn btn-sm btn-primary" data-draft="${p.id}">Draft</button>` : `<span class="muted small">Available</span>`}
      </div>`;
    }
    html += `</div>`;
    return html;
  }

  function draftTradePanel(d) {
    const uid = state.userTeamId;
    const myPicks = d.picks.filter((p) => p.ownerId === uid && !p.playerId && p.overall > d.pickIndex);
    const theirPicks = d.picks.filter((p) => p.ownerId !== uid && !p.playerId && p.overall > d.pickIndex).slice(0, 48);
    let html = `<div class="card"><h3>Trade picks</h3>
      <p class="muted small">Swap one of your picks for another team’s pick (1-for-1).</p>
      <div class="trade-grid">
        <label>Your pick<select id="tradeMy"><option value="">—</option>`;
    for (const p of myPicks) {
      const sel = draftTradeMy === p.overall ? " selected" : "";
      html += `<option value="${p.overall}"${sel}>#${p.overall} R${p.round} (was ${escapeHtml(teamLabel(p.originalTeamId))})</option>`;
    }
    html += `</select></label><label>Their pick<select id="tradeTheir"><option value="">—</option>`;
    for (const p of theirPicks) {
      const sel = draftTradeTheir === p.overall ? " selected" : "";
      html += `<option value="${p.overall}"${sel}>#${p.overall} R${p.round} · ${escapeHtml(teamLabel(p.ownerId))}</option>`;
    }
    html += `</select></label></div>
      <div class="actions"><button type="button" class="btn btn-sm btn-primary" id="btnDoTrade">Confirm trade</button></div>
    </div>`;
    return html;
  }

  function wireDraftTrade(body) {
    const my = $("#tradeMy");
    const their = $("#tradeTheir");
    if (my) my.addEventListener("change", () => { draftTradeMy = +my.value || null; });
    if (their) their.addEventListener("change", () => { draftTradeTheir = +their.value || null; });
    const btn = $("#btnDoTrade");
    if (btn) btn.addEventListener("click", () => {
      const a = +($("#tradeMy") && $("#tradeMy").value);
      const b = +($("#tradeTheir") && $("#tradeTheir").value);
      if (!a || !b) return toast("Pick both sides of the trade");
      const err = E.tradeDraftPicks(state, a, b);
      if (err) return toast(err);
      draftTradeMy = null;
      draftTradeTheir = null;
      E.save(state);
      renderOffseason();
      toast(`Traded #${a} for #${b}`);
    });
  }

  function revealNextPick() {
    const rng = E.mulberry32(E.hashSeed(state.rngSeed + ":d" + state.draft.pickIndex));
    const entry = E.cpuDraftOnePick(state, rng);
    E.save(state);
    renderOffseason();
    if (entry) toast(`${teamLabel(entry.teamId)} select ${entry.player.n} (${entry.player.pos} ${entry.player.ovr})`);
  }

  function simToMyPick() {
    const rng = E.mulberry32(E.hashSeed(state.rngSeed + ":d" + state.draft.pickIndex));
    E.runCpuDraftPicks(state, rng, true);
    E.save(state);
    renderOffseason();
    toast("On the clock" );
  }

  function autoPickUser() {
    const d = state.draft;
    const needs = E.rosterNeeds(E.userTeam(state).roster).gaps.map((g) => g.bucket);
    let pick = needs.length ? d.pool.find((p) => needs.includes(p.bucket)) : null;
    if (!pick) pick = d.pool[0];
    if (pick) draftPlayer(pick.id);
  }

  function renderProgressStep(btn) {
    const body = $("#osBody");
    const log = state.offseasonLog || [];
    let html = `<div class="card"><h3>Offseason progression</h3>
      <p class="muted small">Young players (≤28) improve · older players (31+) regress · some retire.</p>`;
    const mine = log.filter((x) => x.teamId === state.userTeamId);
    if (!mine.length) html += `<p class="muted">No notable changes on your roster.</p>`;
    for (const x of mine.slice(0, 40)) {
      if (x.retired) html += `<div class="muted small">${escapeHtml(x.name)} retired (age ${x.age}, OVR ${x.ovr})</div>`;
      else html += `<div class="muted small">${escapeHtml(x.name)}: ${x.before} → <strong>${x.after}</strong> (age ${x.age})</div>`;
    }
    html += `</div>`;
    body.innerHTML = html;
    btn.textContent = `Start ${state.year + 1} season`;
  }

  function advanceOffseason() {
    if (!state || state.phase !== "offseason") return;
    const step = state.offseasonStep || "resign";
    try {
      if (step === "resign") {
        E.cpuFreeAgency(state, E.mulberry32(E.hashSeed(state.rngSeed + ":fa" + state.year)));
        state.offseasonStep = "fa";
        faSignId = null;
        osTab = "step";
        E.save(state);
        renderOffseason();
        toast(`Free agency open · ${(state.freeAgents || []).length} players`);
        return;
      }
      if (step === "fa") {
        beginDraft();
        state.offseasonStep = "draft";
        osTab = "step";
        E.save(state);
        renderOffseason();
        toast("Draft board is open — trade or start the show");
        return;
      }
      if (step === "draft") {
        const d = state.draft;
        if (!d) { beginDraft(); E.save(state); renderOffseason(); return; }
        if (d.stage === "preview") {
          d.stage = "live";
          E.save(state);
          renderOffseason();
          return;
        }
        if (d.pickIndex >= d.picksTotal) {
          const rng = E.mulberry32(E.hashSeed(state.rngSeed + ":age" + state.year));
          state.offseasonLog = E.ageAndProgress(state, rng);
          state.offseasonStep = "progress";
          osTab = "step";
          E.save(state);
          renderOffseason();
          return;
        }
        if (!E.userOwnsCurrentPick(state)) {
          simToMyPick();
          return;
        }
        autoPickUser();
        return;
      }
      if (step === "progress") {
        E.startNextSeason(state);
        delete state._expiredReady;
        delete state._userExpired;
        delete state._resignYears;
        delete state._faYears;
        faSignId = null;
        resignSignId = null;
        E.save(state);
        show("season");
        activeTab = "schedule";
        renderSeason();
        toast(`${state.year} season underway`);
        return;
      }
    } catch (err) {
      console.error(err);
      toast("Offseason error — see console");
    }
  }

  function draftPlayer(pid) {
    const d = state.draft;
    if (!d || d.stage === "preview") return toast("Start the draft first");
    if (!E.userOwnsCurrentPick(state)) return toast("Not your pick");
    const p = d.pool.find((x) => x.id === pid);
    if (!p) return;
    const team = E.userTeam(state);
    if (team.roster.length >= rosterLimit()) {
      // auto-cut lowest same-bucket or overall lowest
      const cut = E.ensureRosterRoom(state, team, 1);
      if (cut) toast(`Cut ${cut.n} to make room`);
      if (team.roster.length >= rosterLimit()) {
        osTab = "roster";
        renderOffseason();
        return toast("Roster full — cut someone first");
      }
    }
    const slot = E.currentDraftSlot(d);
    E.assignDraftPick(state, team.id, p);
    d.pool = d.pool.filter((x) => x.id !== pid);
    slot.playerId = p.id;
    d.log.push({
      pick: slot.overall,
      round: slot.round,
      pickInRound: slot.pickInRound,
      teamId: team.id,
      originalTeamId: slot.originalTeamId,
      player: { id: p.id, n: p.n, pos: p.pos, ovr: p.ovr, bucket: p.bucket, draftRank: p.draftRank }
    });
    d.pickIndex++;
    E.save(state);
    renderOffseason();
    toast(`Drafted ${p.n}`);
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
    $("#btnOsPrimary").addEventListener("click", advanceOffseason);
    $("#btnFullReset").addEventListener("click", () => {
      if (!confirm("Full reset? This clears your dynasty save.")) return;
      E.clearSave();
      state = null;
      show("mode");
      toast("Dynasty cleared");
    });
    $$("#view-season .tab").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));
    $$("#osTabs .tab").forEach((b) => b.addEventListener("click", () => {
      osTab = b.dataset.osTab;
      renderOffseason();
    }));

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
