// Simulation board (simulation-board.html, opened from the preview of the Simulation page): the guild war map with its real hex grid (the game's own picture and cells, see
// scripts/war_boards.py), the attacking team on its start hexes and the defending one on its numbered slots; the characters can be dragged onto other cells (a move only for now),
// every move is a step of a thread (like the replay's): the thread, the seek bar and the player step through them.
// The page address says what to show: #m=<board id>&n=<map name>&a=<our unit ids>&am=<our machine of war>&d=<defense unit ids, in lineup order>&dm=<their machine of war>&p=&g=&w=&s=&l=
(function () {
  const root = document.getElementById("sb");
  if (!root) return;
  const NS = "http://www.w3.org/2000/svg";
  const assets = "assets/", data = "data/";
  const esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  const $ = function (x) { return document.getElementById(x); };
  const q = new URLSearchParams(location.hash.replace(/^#/, ""));
  const list = function (k) { return (q.get(k) || "").split(",").filter(Boolean); };
  let UNITS = {};
  try { UNITS = JSON.parse($("sb-units").textContent); } catch (e) {}
  const R = 30, W = Math.sqrt(3) * R;
  const board = q.get("m");

  if (!board) { root.innerHTML = '<p class="mnone">Aucune simulation à afficher. <a href="simulation.html">Choisir une défense</a></p>'; return; }
  fetch(data + "war-boards.json").then(function (r) { return r.json(); }).then(function (all) {
    if (!all[board]) throw 0;
    start(all[board]);
  }).catch(function () { root.innerHTML = '<p class="mnone">Map introuvable. <a href="simulation.html">Retour à la simulation</a></p>'; });

  function start(d) {
    const mapName = q.get("n") || d.name || board.replace(/_/g, " ");
    document.title = "Simulation · " + mapName;
    // ---- geometry: the same lattice as the replay player (replay.js): flat-top hexagons, row 0 at the bottom, svg units = texture pixels x K ----
    const pic = d.pic, K = R / pic.R, SY = pic.sy, HS = SY * W, C0 = pic.c0, R0 = pic.r0, X0 = K * pic.ox + R, Y0 = K * pic.oy;
    const lower = function (c) { return (c + C0) % 2 === 0; };
    const cx = function (c) { return X0 + (c + C0) * 1.5 * R; };
    const cy = function (c, r) { return Y0 + (R0 - r + (lower(c) ? 0.5 : 0)) * HS + HS / 2; };
    const hexAt = function (x, y, k) {
      let p = "";
      for (let i = 0; i < 6; i++) p += (x + R * k * Math.cos(i * Math.PI / 3)).toFixed(1) + "," + (y + SY * R * k * Math.sin(i * Math.PI / 3)).toFixed(1) + " ";
      return p;
    };
    // distance in cells: even-q coordinates of the visual grid (the "lower" columns are the even ones), rows counted downwards
    const cube = function (t) { const cc = t[0] + C0, z = -t[1] - (cc + (cc & 1)) / 2; return [cc, z]; };
    const dist = function (a, b2) { const p = cube(a), r = cube(b2), dx = p[0] - r[0], dz = p[1] - r[1]; return (Math.abs(dx) + Math.abs(dz) + Math.abs(dx + dz)) / 2; };
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    d.cells.forEach(function (c) { const x = cx(c[0]), y = cy(c[0], c[1]); minX = Math.min(minX, x - R); maxX = Math.max(maxX, x + R); minY = Math.min(minY, y - HS / 2); maxY = Math.max(maxY, y + HS / 2); });
    const dock = function (side) { return side === 0 ? [minX + 1.9 * R, maxY + 1.6 * R] : [maxX - 1.9 * R, minY - 1.6 * R]; };  // the machines of war: ours under the cells, theirs above
    const vb = [pic.x0 * K, pic.y0 * K, pic.w * K, pic.h * K];

    // ---- who is on the board: ours (side 0) on the start hexes, theirs (side 1) on the numbered slots ----
    const mk = function (id, side, isMow) { const u = UNITS[id] || [id, "", {}]; return { id: id, side: side, mow: isMow, name: u[0], img: u[1], rules: u[2] || {}, t: null, t0: null }; };
    const units = [];
    list("a").forEach(function (id, i) { const u = mk(id, 0, false); u.t0 = (d.start.o || [])[i] || null; units.push(u); });
    list("d").forEach(function (id, i) { const u = mk(id, 1, false); u.t0 = (d.start.e || [])[i] || null; units.push(u); });
    list("am").forEach(function (id) { units.push(mk(id, 0, true)); });
    list("dm").forEach(function (id) { units.push(mk(id, 1, true)); });
    units.forEach(function (u, i) { u.i = i; u.t = u.t0 && u.t0.slice(); });
    const field = units.filter(function (u) { return !u.mow && u.t; });

    // ---- layout (the replay player's, moves only): the recap at the left, the board, the thread of the moves at the right, the player at the bottom ----
    const player = q.get("p") || "", score = q.get("s") || "";
    const back = document.referrer && document.referrer.indexOf(location.origin) === 0 && document.referrer.indexOf("simulation-board") < 0 ? [document.referrer, "Retour"] : ["simulation.html", "Simulation"];
    const ICO = function (d0) { return '<svg class="rp-ico" viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">' + d0 + "</svg>"; };
    const I_PREV = ICO('<path d="M17 5.5v13L7 12z"/>'), I_PLAY = ICO('<path d="M7 5.5v13L18 12z"/>'), I_PAUSE = ICO('<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>');
    root.innerHTML =
      '<div class="rp-main"><div class="rp-top"><a class="rp-back" href="' + esc(back[0]) + '">← ' + back[1] + '</a><div class="rp-sum"><img class="rp-boss" src="' + assets + "maps/" + esc(board) + '.webp" alt="">' +
      "<div><b>" + esc(mapName) + (q.get("l") ? ' <span class="rp-lvl">' + esc(q.get("l")) + "</span>" : "") + "</b><small>" +
      esc([player ? "Attaque de " + player : "", q.get("g") || "", q.get("w") || ""].filter(Boolean).join(" · ")) + "</small></div></div>" +
      (score ? '<div class="rp-dmg"><b>' + esc(score) + "</b><small>score de l'attaque d'origine</small></div>" : "") + "</div>" +
      '<div class="rp-left"><div class="rp-boardwrap"><div class="rp-board sb-board" id="sb-board"></div></div></div>' +
      '<div class="rp-logcol"><h3>Fil des déplacements</h3><ol class="rp-log" id="sb-log"></ol><div id="sb-zleg"></div></div></div>' +
      '<div class="rp-dock"><input type="range" class="rp-seek" id="sb-seek" min="0" max="0" value="0" aria-label="Position dans les déplacements">' +
      '<div class="rp-ctl"><button type="button" class="rp-btn" id="sb-prev" title="Déplacement précédent">' + I_PREV + '<span class="rp-lab"> Préc.</span></button>' +
      '<button type="button" class="rp-btn rp-play" id="sb-play" title="Lecture / pause">' + I_PLAY + '<span class="rp-lab"> Lecture</span></button>' +
      '<button type="button" class="rp-btn" id="sb-next" title="Déplacement suivant"><span class="rp-lab">Suiv. </span>' + I_PLAY + "</button>" +
      '<button type="button" class="rp-btn" id="sb-undo" title="Supprimer le dernier déplacement" disabled>Annuler</button><button type="button" class="rp-btn" id="sb-reset" title="Remettre tout le monde au départ" disabled>Réinitialiser</button>' +
      '<button type="button" class="rp-btn rp-tog" id="sb-zones" aria-pressed="true" title="Pour le personnage choisi : où il peut aller et où l\'adversaire peut le toucher">Zones</button><button type="button" class="rp-btn rp-tog" id="sb-starts" aria-pressed="true" title="Marquer les cases de départ">Départs</button>' +
      '<button type="button" class="rp-btn rp-tog" id="sb-el" aria-pressed="false" title="Afficher l\'altitude de chaque case">Altitude</button>' +
      '<button type="button" class="rp-btn rp-tog" id="sb-grid" aria-pressed="true" title="Afficher le quadrillage">Quadrillage</button>' +
      '<label class="rp-speed">Vitesse <select id="sb-speed"><option value="1">×1</option><option value="2">×2</option><option value="4">×4</option></select></label></div></div>';
    const chrome = function () { const tb = document.querySelector(".topbar"); if (tb) document.documentElement.style.setProperty("--rp-chrome", tb.getBoundingClientRect().height + "px"); };
    chrome();
    window.addEventListener("resize", chrome);

    // ---- the board ----
    const tint = function (c) {
      const t = c[2], el = c[3], l = 24 + Math.min(el, 4) * 5;
      if (c[4] === 1) return t === "Water" ? "hsl(210 45% 30%)" : "hsl(25 12% " + (30 + el * 3) + "%)";
      if (t === "Swamp") return "hsl(85 28% " + (l - 2) + "%)";
      if (t === "DryBush") return "hsl(42 30% " + (l + 2) + "%)";
      if (c[4] === 2) return "hsl(140 12% " + (l - 6) + "%)";
      return "hsl(140 22% " + l + "%)";
    };
    let cells = "";
    d.cells.forEach(function (c) {
      cells += '<polygon class="rp-cell" data-c="' + c[0] + '" data-r="' + c[1] + '" data-k="' + c[4] + '" points="' + hexAt(cx(c[0]), cy(c[0], c[1]), 0.97) + '" fill="' + tint(c) + '" stroke="rgba(0,0,0,.35)" stroke-width="1"/>' +
        '<text class="rp-el" x="' + (cx(c[0]) - R * 0.55).toFixed(1) + '" y="' + (cy(c[0], c[1]) - R * 0.45).toFixed(1) + '">' + c[3] + "</text>";
    });
    const svgBox = $("sb-board");
    svgBox.innerHTML = '<svg viewBox="' + vb.map(function (v) { return v.toFixed(1); }).join(" ") + '" role="img" aria-label="Plateau">' +
      '<image x="' + vb[0].toFixed(1) + '" y="' + vb[1].toFixed(1) + '" width="' + vb[2].toFixed(1) + '" height="' + vb[3].toFixed(1) + '" preserveAspectRatio="none" href="' + assets + esc(pic.src) + '"/>' +
      cells + '<g id="sb-mk" class="sb-starts"></g><g id="sb-zone"></g><g id="sb-tok"></g><g id="sb-nums" class="sb-starts"></g></svg>';
    svgBox.classList.add("has-map");
    svgBox.style.setProperty("--ar", (vb[2] / vb[3]).toFixed(4));
    const svg = svgBox.querySelector("svg"), tokLayer = $("sb-tok");
    // the start hexes: ours ringed in teal, theirs numbered (the numbers of the map pictures of the game)
    let marks = "";
    (d.start.o || []).forEach(function (t) { marks += '<polygon points="' + hexAt(cx(t[0]), cy(t[0], t[1]), 0.86) + '" fill="rgba(74,209,192,.10)" stroke="#4ad1c0" stroke-width="1.6" stroke-dasharray="4 3"/>'; });
    let nums = "";
    (d.start.e || []).forEach(function (t, i) {
      marks += '<polygon points="' + hexAt(cx(t[0]), cy(t[0], t[1]), 0.86) + '" fill="rgba(240,107,107,.10)" stroke="#f06b6b" stroke-width="1.6" stroke-dasharray="4 3"/>';
      // the slot's number sits over the character (a layer above the tokens), at the top of the hexagon
      nums += '<g class="sb-num" transform="translate(' + cx(t[0]).toFixed(1) + "," + (cy(t[0], t[1]) - SY * R * 0.8).toFixed(1) + ')"><circle r="9" fill="#10151c" stroke="#f06b6b" stroke-width="1.6"/><text dy="3.8">' + (i + 1) + "</text></g>";
    });
    $("sb-mk").innerHTML = marks;
    $("sb-nums").innerHTML = nums;

    // ---- the tokens ----
    const pos = function (g, xy) { g.style.transform = "translate(" + xy[0].toFixed(1) + "px," + xy[1].toFixed(1) + "px)"; };
    const home = function (u) { return u.mow ? dock(u.side) : [cx(u.t[0]), cy(u.t[0], u.t[1])]; };
    units.forEach(function (u) {
      if (!u.mow && !u.t) return;
      const col = u.side === 0 ? "#4ad1c0" : "#f06b6b", r = u.mow ? R * 0.88 : R * 0.72;
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", "tk " + (u.side === 0 ? "tk-us" : "tk-them") + (u.mow ? " tk-mow" : " sb-drag"));
      g.dataset.i = u.i;
      g.innerHTML = '<g class="tk-body"><circle r="' + r.toFixed(1) + '" fill="#10151c" stroke="' + col + '" stroke-width="2"/>' +
        (u.img ? '<clipPath id="sbc' + u.i + '"><circle r="' + (r - 1.5).toFixed(1) + '"/></clipPath><image href="' + esc(u.img) + '" x="' + (-r).toFixed(1) + '" y="' + (-r).toFixed(1) + '" width="' + (2 * r).toFixed(1) + '" height="' +
          (2 * r).toFixed(1) + '" clip-path="url(#sbc' + u.i + ')" preserveAspectRatio="xMidYMid slice"/>' : '<text text-anchor="middle" dy="4" fill="#fff">?</text>') +
        '<circle class="tk-ring" r="' + (r + 3).toFixed(1) + '" fill="none"/></g><title>' + esc(u.name) + "</title>";
      u.g = g;
      pos(g, home(u));
      tokLayer.appendChild(g);
    });

    // ---- the moves: a timeline (cur = how many are applied); the board always shows the position after `cur` of them ----
    let sel = null, timer = null, speed = 1, cur = 0;
    const moves = [];
    const settle = function (k) {  // everybody on the hexes they have after k moves
      field.forEach(function (u) { u.t = u.t0.slice(); });
      for (let i = 0; i < k; i++) { const m = moves[i]; m.u.t = m.to.slice(); if (m.swap) m.swap.t = m.from.slice(); }
    };
    function render() {
      units.forEach(function (u) { if (u.g) { u.g.classList.toggle("tk-sel", u === sel); if (!u.mow) pos(u.g, home(u)); } });
      zones();
      $("sb-log").innerHTML = '<li data-k="0" class="' + (cur === 0 ? "is-cur" : "") + '"><button type="button">Mise en place</button></li>' + moves.map(function (m, i) {
        return '<li data-k="' + (i + 1) + '" class="' + (cur === i + 1 ? "is-cur" : "") + (i >= cur ? " sb-later" : "") + '"><button type="button">' + esc(m.u.name) + " se déplace</button></li>";
      }).join("");
      const on = $("sb-log").querySelector("li.is-cur"), box = $("sb-log");
      if (on) box.scrollTop = on.offsetTop - box.clientHeight / 2 + on.clientHeight / 2;
      const sk = $("sb-seek");
      sk.max = moves.length; sk.value = cur;
      $("sb-undo").disabled = !moves.length;
      $("sb-reset").disabled = !moves.length;
      $("sb-prev").disabled = cur === 0;
      $("sb-next").disabled = cur >= moves.length;
    }
    const go = function (k) { cur = Math.max(0, Math.min(moves.length, k)); settle(cur); render(); };
    const stop = function () { if (timer) { clearInterval(timer); timer = null; } $("sb-play").innerHTML = I_PLAY + '<span class="rp-lab"> Lecture</span>'; };

    // ---- the zones of the chosen character (rules in hex-rules.js): the hexes it can reach, and those the other side can hit after moving ----
    const RULES = window.HexRules ? window.HexRules(d.cells) : null;
    let zonesOn = true;
    function zones() {
      const layer = $("sb-zone"), leg = $("sb-zleg");
      layer.innerHTML = ""; leg.innerHTML = "";
      if (!RULES || !zonesOn || !sel || sel.mow) return;
      const occ = {};
      field.forEach(function (u) { occ[u.t[0] + "," + u.t[1]] = u; });
      const reachOf = function (u) {
        const r = u.rules;
        return RULES.reach({ from: u.t, mov: r.mv || 0, fly: !!r.fl, free: !!r.us,
          enemy: function (c, rr) { const o = occ[c + "," + rr]; return !!o && o.side !== u.side; },
          any: function (c, rr) { const o = occ[c + "," + rr]; return !!o && o !== u; }, stop: function () { return false; } });
      };
      const go = reachOf(sel), danger = {};
      field.forEach(function (u) {
        if (u.side === sel.side) return;
        const rng = Math.max.apply(null, u.rules.rg && u.rules.rg.length ? u.rules.rg : [1]);
        reachOf(u).forEach(function (p) { RULES.hits([p.c, p.r], rng, !!u.rules.id).forEach(function (t) { danger[t[0] + "," + t[1]] = 1; }); });
      });
      let html = "", exposed = 0, n = 0;
      d.cells.forEach(function (c) { if (danger[c[0] + "," + c[1]] && c[4] !== 2) html += '<polygon class="rp-z rp-z-dg" points="' + hexAt(cx(c[0]), cy(c[0], c[1]), 0.94) + '"/>'; });
      go.forEach(function (p) {
        const hot = !!danger[p.c + "," + p.r], own = p.k === 0;
        if (!own) { n++; if (hot) exposed++; }
        html += '<polygon class="rp-z rp-z-mv' + (hot ? " rp-z-hot" : "") + (own ? " rp-z-own" : "") + '" points="' + hexAt(cx(p.c), cy(p.c, p.r), 0.94) + '"/>';
      });
      layer.innerHTML = html;
      const nd = Object.keys(danger).length;
      leg.innerHTML = '<div class="rp-zleg"><b>' + esc(sel.name) + "</b><span><i class=\"rp-zk rp-zk-mv\"></i>Déplacement : <b>" + n + "</b> case" + (n > 1 ? "s" : "") + (n ? " (" + exposed + " exposée" + (exposed > 1 ? "s" : "") + ")" : "") +
        '</span><span><i class="rp-zk rp-zk-dg"></i>Zone de danger : <b>' + nd + "</b> cases</span>" +
        (sel.rules.fl ? "<small>Vol : traverse obstacles, unités et dénivelés.</small>" : "") + (sel.rules.us ? "<small>Implacable : les fils barbelés ne l'arrêtent pas.</small>" : "") + "</div>";
    }

    // ---- dragging ----
    const toSvg = function (ev) { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
    const cellAt = function (p) {  // the playable cell whose centre is the closest to the point (within a hexagon's reach)
      let best = null;
      d.cells.forEach(function (c) { if (c[4]) return; const k = Math.hypot(cx(c[0]) - p.x, cy(c[0], c[1]) - p.y); if (k < R * 1.1 && (!best || k < best.k)) best = { c: [c[0], c[1]], k: k }; });
      return best && best.c;
    };
    const lit = function (c) {
      svg.querySelectorAll(".rp-cell.sb-drop").forEach(function (p) { p.classList.remove("sb-drop"); });
      if (c) { const p = svg.querySelector('.rp-cell[data-c="' + c[0] + '"][data-r="' + c[1] + '"]'); if (p) p.classList.add("sb-drop"); }
    };
    tokLayer.addEventListener("pointerdown", function (ev) {
      const g = ev.target.closest(".tk");
      if (!g || ev.button > 0) return;
      const u = units[+g.dataset.i];
      ev.preventDefault();
      if (u.mow) { sel = sel === u ? null : u; render(); return; }
      stop();
      const p0 = toSvg(ev), c0 = home(u), dx = c0[0] - p0.x, dy = c0[1] - p0.y, x0 = ev.clientX, y0 = ev.clientY;
      let moved = false;
      g.setPointerCapture(ev.pointerId);
      function move(e2) {
        if (!moved && Math.hypot(e2.clientX - x0, e2.clientY - y0) < 5) return;
        if (!moved) { moved = true; g.classList.add("dragging"); tokLayer.appendChild(g); }
        const p = toSvg(e2);
        pos(g, [p.x + dx, p.y + dy]);
        lit(cellAt({ x: p.x + dx, y: p.y + dy }));
      }
      function up(e2) {
        g.removeEventListener("pointermove", move); g.removeEventListener("pointerup", up); g.removeEventListener("pointercancel", up);
        g.classList.remove("dragging");
        lit(null);
        if (!moved) { sel = sel === u ? null : u; render(); return; }
        const p = toSvg(e2), target = e2.type === "pointercancel" ? null : cellAt({ x: p.x + dx, y: p.y + dy });
        if (target && (target[0] !== u.t[0] || target[1] !== u.t[1])) {
          const other = field.filter(function (o) { return o !== u && o.t[0] === target[0] && o.t[1] === target[1]; })[0];
          moves.length = cur;  // a new move cuts the moves that came after the one on screen
          moves.push({ u: u, from: u.t.slice(), to: target, swap: other || null });
          sel = u;
          go(moves.length);
        } else render();
      }
      g.addEventListener("pointermove", move); g.addEventListener("pointerup", up); g.addEventListener("pointercancel", up);
    });
    svg.addEventListener("click", function (ev) { if (!ev.target.closest(".tk") && sel) { sel = null; render(); } });
    $("sb-log").onclick = function (e) { const li = e.target.closest("li[data-k]"); if (li) { stop(); go(+li.dataset.k); } };
    $("sb-seek").oninput = function (e) { stop(); go(+e.target.value); };
    $("sb-prev").onclick = function () { stop(); go(cur - 1); };
    $("sb-next").onclick = function () { stop(); go(cur + 1); };
    $("sb-speed").onchange = function (e) { speed = +e.target.value; if (timer) { stop(); $("sb-play").click(); } };
    $("sb-play").onclick = function () {
      if (timer) return stop();
      if (!moves.length) return;
      if (cur >= moves.length) go(0);
      $("sb-play").innerHTML = I_PAUSE + '<span class="rp-lab"> Pause</span>';
      timer = setInterval(function () { if (cur >= moves.length) return stop(); go(cur + 1); }, 900 / speed);
    };
    $("sb-undo").onclick = function () { stop(); if (!moves.length) return; moves.pop(); go(Math.min(cur, moves.length)); };
    $("sb-reset").onclick = function () { stop(); moves.length = 0; go(0); };
    // the toggles: classes on the board (altitude figures, grid lines, start hexes), see style.css
    const toggle = function (id, cls, shownWhenOn) {
      $(id).onclick = function () { const on = svgBox.classList.toggle(cls); $(id).setAttribute("aria-pressed", String(shownWhenOn ? on : !on)); };
    };
    $("sb-zones").onclick = function () { zonesOn = !zonesOn; $("sb-zones").setAttribute("aria-pressed", String(zonesOn)); zones(); };
    toggle("sb-el", "show-el", true);
    toggle("sb-grid", "no-grid", false);
    toggle("sb-starts", "no-starts", false);
    document.addEventListener("keydown", function (e) {
      if (/INPUT|SELECT|TEXTAREA/.test((e.target.tagName || "")) && e.target.type !== "range") return;
      if (e.key === "Escape" && sel) { sel = null; render(); }
      else if (e.key === "ArrowRight") { stop(); go(cur + 1); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { stop(); go(cur - 1); e.preventDefault(); }
      else if ((e.key === "z" || e.key === "Z") && (e.metaKey || e.ctrlKey)) { $("sb-undo").click(); e.preventDefault(); }
    });
    render();
  }
})();
