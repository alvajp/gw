// Raid > Simulation: pick a boss (or prime), the map it is played on and a level; the recommended meta of that boss is shown (the metas of every boss are in the page), with a link to
// the boss's page (best attacks of that map and level, records). The choice is kept in the address (#b=<boss>&m=<map>&l=<level>).
(function () {
  const root = document.getElementById("rsim");
  if (!root) return;
  const state = { b: "", m: "", l: "" };
  const all = function (sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); };
  const pressed = function (el, on) { el.setAttribute("aria-pressed", String(!!on)); };
  function render() {
    all(".rs-boss").forEach(function (c) { pressed(c, c.dataset.boss === state.b); });
    all(".rs-maps").forEach(function (g) { g.hidden = g.dataset.for !== state.b; });
    const maps = all('.rs-maps[data-for="' + state.b + '"] .rs-map');
    if (maps.length && !maps.some(function (c) { return c.dataset.map === state.m; })) state.m = maps[0].dataset.map;
    all(".rs-map").forEach(function (c) { pressed(c, c.dataset.map === state.m && !c.closest("[hidden]")); });
    all(".rs-lvl").forEach(function (c) { pressed(c, c.dataset.lvl === state.l); });
    all(".rs-meta").forEach(function (g) { g.hidden = g.dataset.for !== state.b; });
    const go = document.getElementById("rs-go");
    go.href = "metas/" + state.b + ".html#" + (state.m ? "m=" + state.m + "&" : "") + "l=" + state.l;
    try { history.replaceState(null, "", "#b=" + state.b + "&m=" + state.m + "&l=" + state.l); } catch (e) { /* the address is only a convenience */ }
  }
  root.addEventListener("click", function (e) {
    const b = e.target.closest(".rs-boss"), m = e.target.closest(".rs-map"), l = e.target.closest(".rs-lvl");
    if (b) { state.b = b.dataset.boss; state.m = ""; }
    else if (m) state.m = m.dataset.map;
    else if (l) state.l = l.dataset.lvl;
    else return;
    render();
  });
  const h = {};
  location.hash.replace(/^#/, "").split("&").forEach(function (kv) { const p = kv.split("="); if (p[0]) h[p[0]] = decodeURIComponent(p[1] || ""); });
  const first = root.querySelector(".rs-boss");
  state.b = h.b && root.querySelector('.rs-boss[data-boss="' + h.b + '"]') ? h.b : first ? first.dataset.boss : "";
  state.m = h.m || "";
  state.l = h.l || "L5";
  if (state.b) render();
})();
