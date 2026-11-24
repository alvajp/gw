// Raid > Simulation, the same way as War > Simulation: 1. a boss (a line for the bosses, a line for the primes), 2. the map it is played on (shown once a boss is picked), 3. the team (once a map is
// picked): the attacks we already have on that boss and that map (level, damage, who dealt it, and the replay when the game's was kept), or a custom team: the dialog asks for the difficulty and
// the five characters and the machine of one's own roster. The preview at the right shows the map and the boss. Each step shows the next one and scrolls to it. The choice is kept in the address (#b=<boss>&m=<map>).
(function () {
  const root = document.getElementById("rsim");
  if (!root) return;
  const $ = function (id) { return document.getElementById(id); };
  const all = function (sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); };
  const esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  const state = { b: "", m: "", mode: "rec", row: 0, lvl: null };
  let picked = { units: [], mow: null };
  const LEVELS = ["L4", "L5", "M1", "M2", "M3"].map(function (l) { return { key: l, n: l, sub: "" }; });
  const mine = function () { return RosterPicker.me(); };
  const pressed = function (el, on) { el.setAttribute("aria-pressed", String(!!on)); };
  const label = function (el) { const s = el && el.querySelector("span:last-child"); return s ? s.textContent : ""; };

  const slotHtml = function (it, i, mow) {  // the same avatars (and "?") as the war page; the sixth slot is the machine of war
    const title = mow ? "Machine de guerre" : "Personnage " + (i + 1);
    return it ? '<img class="unit sim-q' + (mow ? " mow" : "") + '" data-slot="' + i + '" src="assets/units/' + esc(it.id) + '.webp" alt="" title="' + title + '">'
      : '<span class="unit unit-q sim-q' + (mow ? " mow" : "") + '" data-slot="' + i + '" title="' + title + '">?</span>';
  };
  function renderCustom() {
    const m = mine();
    $("rs-custom").innerHTML = '<table class="attacks-table sim-table"><thead><tr><th class="a-lvl">Niveau</th><th class="a-who">Joueur</th><th class="a-comp">Attaque</th></tr></thead><tbody><tr class="is-picked"><td class="a-lvl"><b>' +
      (state.lvl ? esc(state.lvl) : "?") + '</b></td><td class="a-who"><b>' + (m ? esc(m.name) : "Mon équipe") + '</b></td><td class="a-comp">' + [0, 1, 2, 3, 4].map(function (i) { return slotHtml(picked.units[i], i); }).join("") + slotHtml(picked.mow, 5, true) + "</td></tr></tbody></table>";
  }
  const curRow = function () { return root.querySelectorAll('#rs-rec .rs-tbl[data-for="' + state.b + '"][data-map="' + state.m + '"] tbody tr')[state.row] || null; };
  function preview() {
    const boss = root.querySelector('.rs-boss[data-boss="' + state.b + '"]'), map = root.querySelector('.rs-maps[data-for="' + state.b + '"] .rs-map[data-map="' + state.m + '"]');
    const box = $("rs-s-team").querySelector(".sim-preview");
    if (!boss || !map) { box.innerHTML = ""; return; }
    const img = map.querySelector("img").getAttribute("src"), art = boss.querySelector("img").getAttribute("src"), row = state.mode === "rec" ? curRow() : null;
    const info = state.mode === "custom" ? (state.lvl ? esc(state.lvl) : "") : row ? esc(row.dataset.lvl) + " · " + esc(row.dataset.dmg) + " · " + esc(row.dataset.who) : "";
    box.innerHTML = '<div class="sim-pv-head"><b>' + esc(label(boss)) + "</b><small>" + esc(label(map)) + (info ? " · " + info : "") + "</small>" +
      (state.mode === "custom" ? '<button type="button" class="rp-btn sim-cu-pick">' + (picked.units.length ? "Modifier mon équipe" : "Choisir mon équipe") + "</button>" : "") + "</div>" +
      '<div class="pl-board"><img class="pl-map" src="' + esc(img) + '" alt="" draggable="false"><img class="rs-pv-boss" src="' + esc(art) + '" alt=""></div>' +
      (row && row.dataset.rid ? '<p class="rs-go-wrap"><a class="rs-go" href="r/' + esc(row.dataset.rid) + '.html"><span aria-hidden="true">▶</span> Rejouer le replay</a></p>' : "") +
      '<p class="rs-go-wrap"><a class="rs-link" href="metas/' + esc(state.b) + ".html#m=" + esc(state.m) + '">Meilleures attaques et records <span aria-hidden="true">→</span></a></p>';
  }
  function team() {
    $("rs-rec").hidden = state.mode !== "rec";
    $("rs-custom").hidden = state.mode !== "custom";
    all("#rs-rec .rs-tbl").forEach(function (t) { t.hidden = t.dataset.for !== state.b || t.dataset.map !== state.m; });
    all('#rs-rec .rs-tbl[data-for="' + state.b + '"][data-map="' + state.m + '"] td.a-comp[data-team]').forEach(function (td) {  // the avatars of the team, drawn once
      if (td.dataset.done) return;
      td.dataset.done = "1";
      td.innerHTML = td.dataset.team.split(",").filter(Boolean).map(function (u) { return '<img class="unit" src="assets/units/' + esc(u) + '.webp" alt="">'; }).join("") + (td.dataset.mow ? '<img class="unit mow" src="assets/units/' + esc(td.dataset.mow) + '.webp" alt="">' : "");
    });
    all(".sim-mode-btn").forEach(function (b) { pressed(b, b.dataset.mode === state.mode); });
    if (state.mode === "custom") renderCustom();
    else {
      const rows = all('#rs-rec .rs-tbl[data-for="' + state.b + '"][data-map="' + state.m + '"] tbody tr');
      if (state.row >= rows.length) state.row = 0;
      rows.forEach(function (tr, i) { tr.classList.toggle("is-picked", i === state.row); });
    }
    preview();
  }
  function steps(from) {  // what is shown: a step appears once the one before has a choice
    const hasB = !!state.b, hasM = hasB && !!state.m;
    $("rs-s-map").hidden = !hasB; $("rs-s-team").hidden = !hasM;
    all(".rs-boss").forEach(function (c) { pressed(c, c.dataset.boss === state.b); });
    all(".rs-maps").forEach(function (g) { g.hidden = g.dataset.for !== state.b; });
    all(".rs-map").forEach(function (c) { pressed(c, c.dataset.map === state.m && !c.closest("[hidden]")); });
    if (hasM) team();
    try { history.replaceState(null, "", "#b=" + state.b + "&m=" + state.m); } catch (e) { /* the address is only a convenience */ }
    const target = from === "b" ? "rs-s-map" : from === "m" ? "rs-s-team" : "";
    if (target && !$(target).hidden) $(target).scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const pick = function () {  // the dialog asks for the difficulty first, then the roster
    RosterPicker.open({ picked: picked, tier: state.lvl, machine: true, choice: { title: "Difficulté du boss", note: "obligatoire : le niveau auquel l'équipe est jouée", items: LEVELS },
      onDone: function (p, lvl) { picked = p; state.lvl = lvl; team(); } });
  };
  root.addEventListener("click", function (e) {
    const q = e.target.closest(".sim-q, .sim-cu-pick");
    if (q) { pick(); return; }
    const b = e.target.closest(".rs-boss"), m = e.target.closest(".rs-map"), md = e.target.closest(".sim-mode-btn"), tr = e.target.closest("#rs-rec tbody tr");
    if (b) { state.b = b.dataset.boss; state.m = ""; steps("b"); }
    else if (m) { state.m = m.dataset.map; state.row = 0; steps("m"); }
    else if (md) { state.mode = md.dataset.mode; team(); if (state.mode === "custom") pick(); }  // "Personnalisée" opens the dialog at once
    else if (tr) { state.row = Array.prototype.indexOf.call(tr.parentNode.children, tr); team(); }
  });
  const h = {};
  location.hash.replace(/^#/, "").split("&").forEach(function (kv) { const p = kv.split("="); if (p[0]) h[p[0]] = decodeURIComponent(p[1] || ""); });
  if (h.b && root.querySelector('.rs-boss[data-boss="' + h.b + '"]')) {
    state.b = h.b;
    if (h.m && root.querySelector('.rs-maps[data-for="' + h.b + '"] .rs-map[data-map="' + h.m + '"]')) state.m = h.m;
    steps("");
  }
})();
