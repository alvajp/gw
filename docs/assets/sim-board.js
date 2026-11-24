// Simulation board (simulation-board.html, opened from the preview of the Simulation page): the guild war map with its real hex grid (the game's own picture and cells, see
// scripts/war_boards.py), the attacking team on its start hexes and the defending one on its numbered slots; a click on a hex a character can reach moves it there,
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
    // the picture is a view from above at a slant: a hex at a higher elevation is drawn higher (pic.ke texture pixels per level, 2 being the level the lattice was fitted on)
    const KE = K * (pic.ke || 0), elev = {};
    d.cells.forEach(function (c) { elev[c[0] + "," + c[1]] = c[3]; });
    const cy = function (c, r) { return Y0 + (R0 - r + (lower(c) ? 0.5 : 0)) * HS + HS / 2 - KE * ((elev[c + "," + r] || 0) - 2); };
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
    const vb = [pic.x0 * K, pic.y0 * K, pic.w * K, pic.h * K];
    // the machines of war: ours against the left edge of the picture (under the cells), theirs against the right edge (above them), always inside the picture (the token and its ring are 0.88 R + 5 wide)
    const dock = function (side) {
      const m = 0.88 * R + 5, y = side === 0 ? maxY + 1.6 * R : minY - 1.6 * R;
      return [side === 0 ? vb[0] + m : vb[0] + vb[2] - m, Math.min(Math.max(y, vb[1] + m), vb[1] + vb[3] - m)];
    };

    // ---- who is on the board: ours (side 0) on the start hexes, theirs (side 1) on the numbered slots ----
    // every character is at the top of its rarity (the line's rarity of the defense, also given to the attackers): level, rank and stars below, stats from data/unit_rules.json (scripts/unit_rules.py)
    const RAR = { m: { n: "Mythique", c: "mythic", lv: 60, rank: 19, stars: 14 }, l: { n: "Légendaire", c: "legendary", lv: 50, rank: 17, stars: 11 }, e: { n: "Épique", c: "epic", lv: 35, rank: 12, stars: 8 }, r: { n: "Rare", c: "rare", lv: 26, rank: 9, stars: 6 } };
    const rar = RAR[q.get("r")] ? q.get("r") : "l";
    const mk = function (id, side, isMow) { const u = UNITS[id] || [id, "", {}]; return { id: id, side: side, mow: isMow, name: u[0], img: u[1], rules: u[2] || {}, relic: u[3] || null, t: null, t0: null }; };
    const units = [];
    list("a").forEach(function (id, i) { const u = mk(id, 0, false); u.t0 = (d.start.o || [])[i] || null; units.push(u); });
    list("d").forEach(function (id, i) { const u = mk(id, 1, false); u.t0 = (d.start.e || [])[i] || null; units.push(u); });
    list("am").forEach(function (id) { units.push(mk(id, 0, true)); });
    list("dm").forEach(function (id) { units.push(mk(id, 1, true)); });
    let CUST = {};  // a custom team: for each of our characters, its rank, its stars and its items, as the player's roster has them (capped to the line): id -> [rank (0-based), stars, [[item, level] ...]]
    try { CUST = JSON.parse(q.get("ad") || "{}") || {}; } catch (e) { CUST = {}; }
    const itemsOf = function (c) {  // the crit / block items, the boosters and the defensive items of a roster's unit, as {c, b, cb, bb, d}
      const res = { c: [], b: [], cb: [0, 0], bb: [0, 0], d: [0, 0] }, table = UNITS._items || {};
      (c[2] || []).forEach(function (x) {
        const it = table[x[0]];
        if (!it) return;
        const lv = it[2][Math.max(0, Math.min(it[2].length, +x[1] || 1) - 1)] || [0, 0];
        if (it[0] === "c" || it[0] === "b") res[it[0]].push(lv.slice());
        else { res[it[0]][0] += lv[0]; res[it[0]][1] += lv[1]; }
      });
      return res;
    };
    const initUnit = function (u) {
      u.t = u.t0 && u.t0.slice();
      let st = u.rules.st && u.rules.st[rar];
      const cu = !u.mow && !u.summon && u.side === 0 && CUST[u.id];
      u.itc = null;
      if (cu && u.rules.bs && u.rules.ic) {  // the roster's data: the stats of its rank and stars, and its own items
        u.itc = itemsOf(cu);
        st = u.rules.bs.map(function (b, i) { return Math.round((b + u.rules.ic.slice(0, cu[0]).reduce(function (a, x) { return a + x[i]; }, 0)) * (100 + 10 * cu[1]) / 100); });
        st[0] += u.itc.d[0]; st[2] += u.itc.d[1];
      }
      u.max = st ? st[0] : 0; u.max0 = u.max; u.atk = st ? st[1] : 0; u.arm = st ? st[2] : 0;  // health, damage, armour at the top of the rarity
      u.hp = u.max; u.alive = true; u.spent = 0; u.acted = false; u.nAtk = 0; u.hitNow = false; u.termUsed = false; u.advStart = false; u.startAdj = [];
      u.ambush = false; u.fallen = false;
      u.tset = {};
      (u.rules.tr || []).forEach(function (t) { u.tset[t[0]] = 1; });  // its traits
    };
    units.forEach(function (u, i) { u.i = i; initUnit(u); });
    units.forEach(function (u) { if (u.mow) u.t = [-9, -9]; });  // a machine of war is off the board: a position that is on no hex, so the damage code can treat it like any attacker
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
      '<div class="rp-left"><div class="rp-boardwrap"><div class="sb-turn sb-turn-map"><div class="sb-turnbtns"><button type="button" class="rp-btn rp-play" id="sb-end" title="Passer la main à l\'autre camp">Fin de tour</button><button type="button" class="rp-btn" id="sb-auto" title="Le camp adverse joue tout seul (disponible à son tour)">Auto</button></div><div class="sb-turnlab" id="sb-turnlab"></div></div><div class="rp-board sb-board" id="sb-board"></div></div></div>' +
      '<div class="rp-right"><div class="rp-ledger sb-unit" id="sb-unit"></div><div class="rp-ledger sb-stats" id="sb-stats"></div></div>' +
      '<div class="rp-logcol"><h3>Fil du combat</h3><ol class="rp-log" id="sb-log"></ol></div></div>' +
      '<div class="rp-dock"><input type="range" class="rp-seek" id="sb-seek" min="0" max="0" value="0" aria-label="Position dans le combat">' +
      '<div class="rp-ctl"><button type="button" class="rp-btn" id="sb-prev" title="Action précédente">' + I_PREV + '<span class="rp-lab"> Préc.</span></button>' +
      '<button type="button" class="rp-btn rp-play" id="sb-play" title="Lecture / pause">' + I_PLAY + '<span class="rp-lab"> Lecture</span></button>' +
      '<button type="button" class="rp-btn" id="sb-next" title="Action suivante"><span class="rp-lab">Suiv. </span>' + I_PLAY + "</button>" +
      '<button type="button" class="rp-btn" id="sb-reset" title="Remettre tout le monde au départ" disabled>Réinitialiser</button>' +
      '' +
      '<button type="button" class="rp-btn rp-tog" id="sb-el" aria-pressed="false" title="Afficher l\'altitude de chaque case">Altitude</button>' +
      '<button type="button" class="rp-btn rp-tog" id="sb-grid" aria-pressed="true" title="Afficher le quadrillage">Quadrillage</button>' +
      '<button type="button" class="rp-btn rp-speed" id="sb-speed" data-v="1" title="Vitesse de lecture : cliquer pour changer (×1, ×2, ×4)">Vitesse ×1</button></div></div>';
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
    // the hexes at the back are drawn first, and of each one the part a higher neighbour covers is hidden (a raised hex stands in front of the lower hex behind it)
    const hexes = d.cells.slice().sort(function (a, b) { return a[3] - b[3] || b[1] - a[1]; });
    let defs = "";
    const mv = vb.map(function (v) { return v.toFixed(1); });
    const maskOf = {};
    if (KE > 0) hexes.forEach(function (c) {
      const x = cx(c[0]), y = cy(c[0], c[1]);
      const up = d.cells.filter(function (o) { return o[3] > c[3] && Math.hypot(cx(o[0]) - x, cy(o[0], o[1]) - y) < 2.4 * R; });
      if (!up.length) return;
      maskOf[c[0] + "," + c[1]] = "hm" + c[0] + "_" + c[1];
      defs += '<mask id="hm' + c[0] + "_" + c[1] + '" maskUnits="userSpaceOnUse" x="' + mv[0] + '" y="' + mv[1] + '" width="' + mv[2] + '" height="' + mv[3] + '"><rect x="' + mv[0] + '" y="' + mv[1] + '" width="' + mv[2] + '" height="' + mv[3] + '" fill="#fff"/>' +
        up.map(function (o) { return '<polygon points="' + hexAt(cx(o[0]), cy(o[0], o[1]), 1) + '" fill="#000"/>'; }).join("") + "</mask>";
    });
    let cells = "<defs>" + defs + "</defs>";
    const maskAttr = function (c, r) { return maskOf[c + "," + r] ? ' mask="url(#' + maskOf[c + "," + r] + ')"' : ""; };  // the colour layers (zones, hex effects) are cut by the same masks as the grid: a raised hex stays in front of the lower one
    hexes.forEach(function (c) {
      cells += '<polygon class="rp-cell" data-c="' + c[0] + '" data-r="' + c[1] + '" data-k="' + c[4] + '" points="' + hexAt(cx(c[0]), cy(c[0], c[1]), 0.97) + '" fill="' + tint(c) + '" stroke="rgba(0,0,0,.35)" stroke-width="1"' +
        (maskOf[c[0] + "," + c[1]] ? ' mask="url(#' + maskOf[c[0] + "," + c[1]] + ')"' : "") + "/>";
    });
    let elevNums = "";  // the altitude figures are in a layer above the tokens (they show over the characters)
    d.cells.forEach(function (c) { elevNums += '<text class="rp-el" x="' + (cx(c[0]) - R * 0.55).toFixed(1) + '" y="' + (cy(c[0], c[1]) - R * 0.45).toFixed(1) + '">' + c[3] + "</text>"; });
    const svgBox = $("sb-board");
    svgBox.innerHTML = '<svg viewBox="' + vb.map(function (v) { return v.toFixed(1); }).join(" ") + '" role="img" aria-label="Plateau">' +
      '<image x="' + vb[0].toFixed(1) + '" y="' + vb[1].toFixed(1) + '" width="' + vb[2].toFixed(1) + '" height="' + vb[3].toFixed(1) + '" preserveAspectRatio="none" href="' + assets + esc(pic.src) + '"/>' +
      cells + '<defs><linearGradient id="sbBandG" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#34d399" stop-opacity="0.55"/><stop offset="1" stop-color="#34d399" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="sbBandR" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f06b6b" stop-opacity="0.55"/><stop offset="1" stop-color="#f06b6b" stop-opacity="0"/></linearGradient></defs><g id="sb-turnband" pointer-events="none"></g><g id="sb-mk" class="sb-starts"></g><g id="sb-tiles"></g><g id="sb-zone"></g><g id="sb-hexes"></g><g id="sb-tok"></g><g id="sb-over" pointer-events="none"></g><g id="sb-fx"></g><g id="sb-nums" class="sb-starts"></g><g id="sb-elv" pointer-events="none">' + elevNums + '</g></svg>';
    svgBox.classList.add("has-map");
    const tipEl = document.createElement("div");  // the tooltip of the chosen action sits over the top of the map
    tipEl.className = "sb-tip"; tipEl.id = "sb-tip"; tipEl.hidden = true;
    svgBox.appendChild(tipEl);
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
    const home = function (u) {  // a big stationary unit stands in the middle of its three hexes (like a raid boss)
      if (u.mow) return dock(u.side);
      const hs = u.foot ? [u.t].concat(u.foot) : [u.t];
      return [hs.reduce(function (a, h) { return a + cx(h[0]); }, 0) / hs.length, hs.reduce(function (a, h) { return a + cy(h[0], h[1]); }, 0) / hs.length];
    };
    const makeToken = function (u) {  // the token of a character, a summon or a decoy
      if (!u.mow && !u.t) return;
      const col = u.side === 0 ? "#4ad1c0" : "#f06b6b", r = u.mow ? R * 0.88 : u.decoy ? R * 0.42 : u.summon && u.tset && u.tset.BigTarget ? R * 0.88 : R * 0.72;  // a 3-hex summon is as big as a machine of war's icon; only the 7-hex raid bosses are bigger
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", "tk " + (u.side === 0 ? "tk-us" : "tk-them") + (u.mow ? " tk-mow" : " sb-drag") + (u.decoy ? " tk-decoy" : ""));
      g.dataset.i = u.i;
      g.innerHTML = '<g class="tk-body"><circle r="' + r.toFixed(1) + '" fill="#10151c" stroke="' + col + '" stroke-width="2"/>' +
        (u.img ? '<clipPath id="sbc' + u.i + '"><circle r="' + (r - 1.5).toFixed(1) + '"/></clipPath><image href="' + esc(u.img) + '" x="' + (-r).toFixed(1) + '" y="' + (-r).toFixed(1) + '" width="' + (2 * r).toFixed(1) + '" height="' +
          (2 * r).toFixed(1) + '" clip-path="url(#sbc' + u.i + ')" preserveAspectRatio="xMidYMid slice"/>' : '<text text-anchor="middle" dy="4" fill="#fff">?</text>') +
        '<circle class="tk-ring" r="' + (r + 3).toFixed(1) + '" fill="none"/></g>' +
        (u.mow || u.decoy ? "" : '<g class="tk-bar" transform="translate(' + (-r * 0.65).toFixed(1) + "," + (r * 0.34).toFixed(1) + ')"><rect width="' + (1.3 * r).toFixed(1) + '" height="6" rx="3" fill="#0b0e12" stroke="rgba(255,255,255,.4)" stroke-width="0.8"/>' +
          '<rect class="tk-hp" x="1" y="1" width="' + (1.3 * r - 2).toFixed(1) + '" height="4" rx="2" fill="#34d399"/></g><g class="tk-sts" transform="translate(0,' + (r * 0.34 + 11.6).toFixed(1) + ')"></g>') + "<title>" + esc(u.name) + "</title>";
      u.g = g;
      const bar = g.querySelector(".tk-bar"), sts = g.querySelector(".tk-sts");
      u.ov = null;
      if (bar && sts) {  // the health bar, the shield bar and the states of a character sit in a layer above every avatar: they stay readable when two characters overlap
        const w = 1.3 * r - 2, sh = document.createElementNS(NS, "rect");
        sh.setAttribute("class", "tk-sh"); sh.setAttribute("x", "1"); sh.setAttribute("y", "7.6"); sh.setAttribute("width", w.toFixed(1)); sh.setAttribute("height", "2.6"); sh.setAttribute("rx", "1.3"); sh.setAttribute("fill", "#60a5fa"); sh.style.display = "none";
        bar.appendChild(sh);
        ["tk-pvg", "tk-pvo", "tk-pvy"].forEach(function (cls, i) {  // the damage preview on the health bar, from the left: yellow (the damage that is certain), orange (what may come on top), green (the health left even in the best case)
          const r2 = document.createElementNS(NS, "rect");
          r2.setAttribute("class", cls); r2.setAttribute("x", "1"); r2.setAttribute("y", "1"); r2.setAttribute("width", "0"); r2.setAttribute("height", "4"); r2.setAttribute("rx", "2"); r2.setAttribute("fill", ["#34d399", "#fb923c", "#facc15"][i]); r2.style.display = "none";
          bar.appendChild(r2);
        });
        const ov = document.createElementNS(NS, "g");
        ov.setAttribute("class", "tk-ov"); ov.dataset.i = u.i;
        ov.appendChild(bar); ov.appendChild(sts);
        $("sb-over").appendChild(ov); u.ov = ov; pos(ov, home(u));
      }
      u.hpEl = (u.ov || g).querySelector(".tk-hp");
      u.shEl = (u.ov || g).querySelector(".tk-sh");
      u.pvG = (u.ov || g).querySelector(".tk-pvg"); u.pvO = (u.ov || g).querySelector(".tk-pvo"); u.pvY = (u.ov || g).querySelector(".tk-pvy"); u.pvW = 1.3 * r - 2;
      u.stG = (u.ov || g).querySelector(".tk-sts"); u.stShown = {};
      pos(g, home(u));
      tokLayer.appendChild(g);
    };
    units.forEach(makeToken);

    // ---- the fight: a timeline of steps (a move, an attack, the end of a turn); cur = how many are applied; the board always shows the position after `cur` of them ----
    let sel = null, act = null, timer = null, speed = 1, cur = 0, round = 1, active = 0;  // active: the side whose turn it is (0 = ours, 1 = theirs); act: the chosen action of the character
    const steps = [];
    let zmarks = [];  // zones marked for later: a bombardment at the start of the owner's next turn, a mine that goes off when an enemy steps on it
    let pending = [];  // hits that land later (a Seeker missile at the start of its owner's next turn)
    // an active ability can be used once per battle, unless its text gives a recharge: "initial recharge N" = not before round N + 1, "recharge N" = N rounds after a use
    const abReady = function (u, a) {
      if (a[0] === "CalibaniteGreatsword" || a[0] === "DoctrinaImperatives") return u.stTurn !== turnNo;  // once per turn, it only switches the stance
      const cd = a[11] || [0, null], used = u.used && u.used[a[0]];
      if (u.deployed) return false;  // a machine of war whose unit has been put on the board cannot be used any more
      return used === undefined ? round >= cd[0] + 1 : cd[1] !== null ? round >= used + cd[1] + 1 : u.mow && round > used;  // a machine of war has no ammunition here: with no recharge it can be used again next turn
    };
    const abWait = function (u, a) {  // why it cannot be used, "" when it can
      if (abReady(u, a)) return "";
      if (u.deployed) return "Cette machine de guerre est déjà sur le plateau.";
      const cd = a[11] || [0, null], used = u.used && u.used[a[0]];
      return used === undefined ? "Rechargement initial : disponible au round " + (cd[0] + 1) + "." : cd[1] === null ? "Déjà utilisée : une seule fois par bataille." : "En rechargement : disponible au round " + (used + cd[1] + 1) + ".";
    };
    const live = function () { return field.filter(function (u) { return u.alive && !u.decoy; }); };  // the characters and summons on the board (a decoy is not one: it cannot be targeted nor does it block)
    const decoys = function () { return field.filter(function (u) { return u.alive && u.decoy; }); };
    const footOf = function (x) { return x.foot ? [x.t].concat(x.foot) : [x.t]; };  // the hexes a unit stands on (Boudicari and Galatian take 3)
    const occupant = function (c, r, but) { return live().filter(function (o) { return o !== but && footOf(o).some(function (h) { return h[0] === c && h[1] === r; }); })[0]; };
    const turnStart = function () {  // a turn begins: nobody has moved or acted; the fallen of the side that plays come back on a decoy (Ambush); who stood next to an enemy is noted
      psyCount = [0, 0];
      live().forEach(function (c) { const tm = abOf(c, "TimesplinterMantle"); if (tm) live().forEach(function (x) { if (x.side === c.side && x.tset.Mechanical && (x === c || RULES.dist(x.t, c.t) === 1)) x.cloak = tm.dmgReduction || 0; }); });  // Timesplinter Mantle at the start of every turn
      units.forEach(function (u) { if (u.side === active) { u.ow = false; u.owCut = 0; u.owForce = false; u.smasha = false; u.stillPrev = u.moves === 0; u.outr = {}; }  // Sentinelle ends as its owner's turn begins
        u.endDone = false; u.spent = 0; u.relocated = false; u.moves = 0; u.moveExtra = 0; u.moveAfter = false; u.acted = false; u.noRanged = false; u.hitNow = false; u.termUsed = false; u.usedActive = false; if (u.markedBy === active) { if (u.markFresh) u.markFresh = false; else { u.marked = false; u.markedBy = -1; } } });  // a mark lasts until its owner's next turn (a drone's markerlight: until the end of it)
      field.filter(function (u) { return u.fallen && u.side === active; }).forEach(function (u) {
        const mine = decoys().filter(function (x) { return x.side === u.side; });
        if (!mine.length) return;  // no decoy left: it stays down
        const dd = mine.indexOf(u.dd) >= 0 ? u.dd : mine[0];
        u.t = dd.t.slice(); u.hp = u.max; u.alive = true; u.fallen = false; dd.alive = false;
      });
      field.forEach(function (u) { if (u.jetFor && u.jetFor.side === active && u.jetFor.alive && u.alive) u.alive = false; });  // Mataneo's jump-pack Intercessors leave at the start of his turn
      field.forEach(function (u) { u.advStart = u.alive && !u.decoy && nextTo(u); u.startAdj = u.alive && !u.decoy ? live().filter(function (e) { return e.side !== u.side && footOf(e).some(function (h) { return RULES.dist(u.t, h) === 1; }); }) : []; });
      field.filter(function (u) { return u.side === active; }).forEach(function (u) {  // the auras that act as the turn begins: +1 movement, the shroud of Nightshroud (until its next turn)
        u.moveBonus = 0; u.shroud = 0;
        if (!u.alive || u.decoy) return;
        aurasOn(u, u.t).forEach(function (a) {
          if (a.id === "RelentlessMarch") u.moveBonus += 1;
          else if (a.id === "CursedPlagueBell") u.moveBonus += parseInt(a.v.extraMovement, 10) || 1;
          else if (a.id === "Nightshroud") u.shroud = a.v.dmgReduction || 0;
        });
        if ((u.rules.ab || []).some(function (a) { return a[0] === "DestroyTheWitch"; }) && foes(u).some(function (e) { return e.tset.Psyker; })) u.moveBonus += 1;  // Helbrecht: a Psyker on the field
        u.shun = null;  // Serene Unifier: the buff of the last round ends as Aun'Shi's turn begins, he gives the next one below
      });
      live().filter(function (e) { return e.side === active && (e.rules.ab || []).some(function (a) { return a[0] === "SereneUnifier"; }); }).forEach(function (e) {
        const v = (e.rules.ab.filter(function (a) { return a[0] === "SereneUnifier"; })[0][8] || {})[rar] || {}, kind = (round - 1) % 3 + 1;  // 1: -50 % damage taken, 2: +1 movement, 3: +1044 damage
        live().filter(function (x) { return x.side === active && (x === e || RULES.dist(e.t, x.t) <= 1 || (x.rules.fa === "Tau" && RULES.dist(e.t, x.t) <= 2)); }).forEach(function (x) {
          x.shun = { kind: kind, v: v };
          if (kind === 2) x.moveBonus += parseInt(v.extraMovement, 10) || 1;
        });
      });
    };
    // ---- the summons play by themselves: at the start of their side's turn (before the characters), or at once when the ability that makes them says so ----
    // Each one looks at the hexes it can reach and wants, in this order: to be able to attack, not to stand where it would be hurt (razor wire), to stand next to an ally whose ability helps it,
    // the higher ground (a normal attack from higher ground deals more), tall grass; then the hardest hit, then the shortest walk. With nothing to attack it walks toward the nearest enemy.
    // Hexes marked by an enemy ability for the next turn (a raid boss's zone) are to be avoided as well: none exist in this simulation yet.
    // a summon whose passive protects its neighbours (Savior Protocols of the T'au drones, Watched Over, Draw Fire, Twisted Mirage) first wants to stand next to someone it protects (u.t is the hex being tried)
    const guardAt = function (u) {
      const pa = u.rules.pa || [];
      if (!pa.length) return false;
      return live().some(function (x) {
        if (x === u || x.side !== u.side || RULES.dist(x.t, u.t) !== 1) return false;
        return (pa.indexOf("SaviorProtocols") >= 0 && x.rules.fa === "Tau" && !x.summon) || pa.indexOf("WatchedOver") >= 0 || pa.indexOf("DrawFire") >= 0 || (pa.indexOf("TwistedMirage") >= 0 && x.rules.fa === "ThousandSons" && !x.summon);
      });
    };
    const buffedAt = function (u, c) { return aurasOn(u, c).length > 0; };  // an ally nearby whose ability helps it, at the radius that ability gives (u.t is the hex being tried)
    const mineTurn = function (u, force) {
      const goal = force && force.alive ? force : foes(u).sort(function (a, b2) { return RULES.dist(u.t, a.t) - RULES.dist(u.t, b2.t); })[0];
      if (!goal) return null;
      const occ = {};
      live().forEach(function (x) { if (x !== u) footOf(x).forEach(function (h) { occ[h[0] + "," + h[1]] = x; }); });
      const cells = RULES.reach({ from: u.t, mov: u.spent < 99 ? Math.max(0, mvOf(u) - u.spent) : 0, fly: true, free: true, enemy: function (c, r) { return false; }, any: function (c, r) { return !!occ[c + "," + r]; }, stop: stopFor(u) });
      const best = cells.sort(function (a, b2) { return RULES.dist([a.c, a.r], goal.t) - RULES.dist([b2.c, b2.r], goal.t) || a.k - b2.k; })[0];
      const rec = { u: u, to: null, tgt: null, dmg: 0, hits: 0, per: 0, label: "Mort flottante" };
      if (best && (best.c !== u.t[0] || best.r !== u.t[1])) { rec.to = [best.c, best.r]; u.t = [best.c, best.r]; u.spent += best.k; rec.trig = checkMarks(u).concat(owReact(u)); }
      if (u.alive && foes(u).some(function (e) { return RULES.dist(e.t, u.t) === 1; })) {
        const hits = explode(u);
        boomLog = boomLog.filter(function (x) { return hits.indexOf(x) < 0; });  // they are in the record of the mine itself
        if (hits.length) { rec.tgt = hits[0].tgt; rec.dmg = hits[0].dmg; rec.hits = hits[0].hits; rec.per = hits[0].per; rec.more = hits.slice(1); }
      }
      return rec.to || rec.tgt ? rec : null;
    };
    const playSummon = function (u, force) {  // force: the target it was ordered to shoot (Yarrick's wave)
      if (isMine(u)) return mineTurn(u, force);
      if (u.tset.InstinctiveBehaviour && !live().some(function (x) { return x.side === u.side && x.tset.Synapse && RULES.dist(x.t, u.t) <= 2; })) {  // Instinctive Behaviour: it goes for the nearest enemy and does not move if it can already hit something
        const nearest = foes(u).sort(function (a, b2) { return RULES.dist(u.t, a.t) - RULES.dist(u.t, b2.t); })[0];
        if (nearest) force = nearest;
        if (targetsOf(u, { id: "atk", ok: true }).length) u.spent = Math.max(u.spent, 99);  // something is in range: it stays
      }
      const home = u.t.slice(), occ = {}, canMove = u.spent < 99;
      live().forEach(function (x) { if (x !== u) footOf(x).forEach(function (h) { occ[h[0] + "," + h[1]] = x; }); });
      const reachWith = function (extra) { return RULES.reach({ from: u.t, mov: (canMove ? Math.max(0, mvOf(u) - u.spent) : 0) + extra, fly: !!u.rules.fl, free: !!u.rules.us || !!fxOn(u, "howl"),
        enemy: function (c, r) { const o = occ[c + "," + r]; return !!o && o.side !== u.side; }, any: function (c, r) { return !!occ[c + "," + r]; }, stop: stopFor(u) }); };
      let cells = reachWith(0);
      const adrG = abOf(u, "AdrenalGlands");
      if (adrG && canMove) { const base = cells; cells = base.concat(reachWith(parseInt(adrG.extraMovement, 10) || 1).filter(function (p) { return !base.some(function (q) { return q.c === p.c && q.r === p.r; }) && foes(u).some(function (e) { return RULES.dist([p.c, p.r], e.t) === 1; }); })); }  // Hormagaunt: one more movement if the move ends next to an enemy
      const foesNow = foes(u), atk = { id: "atk", ok: true };
      const scored = cells.map(function (p) {
        u.t = [p.c, p.r];
        const all = targetsOf(u, atk), cell = RULES.cell(p.c, p.r) || {};
        const near = foesNow.length ? Math.min.apply(null, foesNow.map(function (e) { return RULES.dist(u.t, e.t); })) : 0;
        return { guard: guardAt(u), p: p, all: all, safe: !(cell.tile === "Swamp" && !u.rules.us && !u.rules.fl), buff: buffedAt(u, u.t), el: cell.el || 0, grass: cell.tile === "DryBush" && !u.tset.BigTarget, near: near };
      });
      u.t = home;
      // the victim: the enemy it can hit hardest from anywhere it can reach, a kill first
      const worth = {};
      scored.forEach(function (x) { x.all = x.all.filter(function (r) { return r.u.side !== u.side && !r.heal; }); x.all.forEach(function (r) { const w = worth[r.u.i] = worth[r.u.i] || { u: r.u, dmg: 0 }; w.dmg = Math.max(w.dmg, r.dmg); }); });
      const victim = (force && worth[force.i]) || Object.keys(worth).map(function (k) { return worth[k]; }).sort(function (a, b2) { return ((b2.dmg >= b2.u.hp) - (a.dmg >= a.u.hp)) || b2.dmg - a.dmg; })[0];
      scored.forEach(function (x) { x.best = victim ? x.all.filter(function (r) { return r.u === victim.u; })[0] || null : null; });
      const key = function (x) { return [x.guard ? 1 : 0, x.best ? 1 : 0, x.safe ? 1 : 0, x.best ? 0 : -x.near, x.buff ? 1 : 0, x.el, x.grass ? 1 : 0, x.best ? x.best.dmg : 0, -x.p.k]; };
      scored.sort(function (a, b2) { const ka = key(a), kb = key(b2); for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i]; return 0; });
      const pick = scored[0];
      if (!pick) return null;
      const rec = { u: u, to: null, tgt: null, dmg: 0, hits: 0, per: 0, label: "Attaque" };
      if (pick.p.c !== home[0] || pick.p.r !== home[1]) { rec.to = [pick.p.c, pick.p.r]; u.t = [pick.p.c, pick.p.r]; u.spent += pick.p.k; rec.trig = checkMarks(u).concat(owReact(u)); }
      let abBest = null;  // an active ability that deals damage (Stikkbomb, Plasma Grenade, Hellfire ...) replaces the normal attack when it hits harder
      if (!fxOn(u, "stun")) (u.rules.ab || []).forEach(function (a2, i) {
        if (a2[2] !== "a" || !(a2[3] && a2[3][rar]) || !abReady(u, a2)) return;
        const o2 = { id: "ab" + i, ab: a2, name: a2[1], ok: true }, r2 = targetsOf(u, o2).filter(function (x) { return x.dmg > 0 && !x.heal; }).sort(function (p1, p2) { return ((p2.dmg >= p2.u.hp) - (p1.dmg >= p1.u.hp)) || p2.dmg - p1.dmg; })[0];
        if (r2 && (!abBest || r2.dmg > abBest.r.dmg)) abBest = { o: o2, r: r2 };
      });
      if (abBest && (!pick.best || abBest.r.dmg > pick.best.dmg * 1.05)) {
        const o3 = abBest.o, tgt3 = abBest.r.u, v3 = (o3.ab[8] && o3.ab[8][rar]) || {};
        u.acted = true; u.nAtk++; u.used[o3.ab[0]] = round;
        rec.label = o3.name; rec.tgt = tgt3; rec.dmg = abBest.r.dmg; rec.hits = abBest.r.hits; rec.per = abBest.r.per;
        curAtk++; guardLog = []; hurt(tgt3, abBest.r.dmg, u, abBest.r.per, o3.ab[5]); rec.guards = guardLog;
        const area = AOE[o3.ab[0]] ? AOE[o3.ab[0]](u, o3, tgt3, v3) : [];
        rec.more = area;
        area.forEach(function (x) { curAtk++; hurt(x.tgt, x.dmg, u, x.per, x.prof); });
        battleFocus(u);
        return rec;
      }
      if (pick.best) {
        u.acted = true; u.nAtk++;
        rec.tgt = pick.best.u; rec.dmg = pick.best.dmg; rec.hits = pick.best.hits; rec.per = pick.best.per;
        curAtk++; guardLog = []; hurt(pick.best.u, pick.best.dmg, u, pick.best.per); rec.guards = guardLog;
        battleFocus(u);
      }
      return rec.to || rec.tgt ? rec : null;
    };
    const summonsPlay = function () {
      const out = [];
      field.filter(function (u) { return (u.summon || u.auto) && !u.decoy && u.alive && u.side === active; }).sort(function (a, b2) { return a.i - b2.i; }).forEach(function (u) {
        const r = playSummon(u);
        if (r) out.push(r);
        if (u.zkar && u.alive) {  // Hunter of Souls: Z'Kar attacks at the start of his turn, then leaves the field and comes back as a machine of war
          u.alive = false; if (u.mowOf) u.mowOf.deployed = false;
          if (r) r.leaves = true; else out.push({ u: u, to: null, tgt: null, dmg: 0, hits: 0, per: 0, label: "Chasseur d'âmes", leaves: true });
        }
      });
      return out;
    };
    // Khârn's Betrayer: once he has killed an enemy, at the start of his turn he moves up to 2 hexes toward the nearest unit, then hits an adjacent one (an enemy if there is one, else an ally); then he can be played
    const betray = function () {
      const out = [];
      field.filter(function (u) { return u.alive && !u.decoy && u.side === active && u.kills > 0 && (u.rules.ab || []).some(function (a) { return a[0] === "TheBetrayer"; }); }).forEach(function (u) {
        const a = u.rules.ab.filter(function (x) { return x[0] === "TheBetrayer"; })[0], v = (a[8] && a[8][rar]) || {}, n = parseInt(v.nrOfHits, 10) || a[6] || 1;
        const others = live().filter(function (x) { return x !== u; }), nearest = function (list) { return list.sort(function (x, y) { return RULES.dist(u.t, x.t) - RULES.dist(u.t, y.t); })[0]; };
        const goal = nearest(others.slice());
        if (!goal) return;
        const occ = {};
        others.forEach(function (x) { footOf(x).forEach(function (h) { occ[h[0] + "," + h[1]] = x; }); });
        const cells = RULES.reach({ from: u.t, mov: 2, fly: !!u.rules.fl, free: !!u.rules.us || !!fxOn(u, "howl"), enemy: function (c, r) { const o = occ[c + "," + r]; return !!o && o.side !== u.side; }, any: function (c, r) { return !!occ[c + "," + r]; }, stop: stopFor(u) });
        const best = cells.sort(function (x, y) { return RULES.dist([x.c, x.r], goal.t) - RULES.dist([y.c, y.r], goal.t) || x.k - y.k; })[0];
        const rec = { u: u, to: null, tgt: null, dmg: 0, hits: 0, per: 0, label: a[1] };
        if (best && (best.c !== u.t[0] || best.r !== u.t[1])) { rec.to = [best.c, best.r]; u.t = [best.c, best.r]; u.spent += best.k; }
        const adjacent = others.filter(function (x) { return RULES.dist(u.t, x.t) === 1; }).sort(function (x, y) { return x.hp - y.hp; });
        const tg = adjacent.filter(function (x) { return x.side !== u.side; })[0] || adjacent[0];
        if (tg) { const r = abilityHit(u, tg, avgOf(v, ""), a[5], n); rec.tgt = tg; rec.dmg = Math.round(r.tot); rec.hits = r.hits; rec.per = Math.round(r.per); curAtk++; hurt(tg, rec.dmg, u); }
        out.push(rec);
      });
      return out;
    };
    let curAtk = 0;  // one number per attack (an action, a summon's attack ...), so that several hits of one attack count as one attack suffered
    // the guards: Celestine's Geminae Superia (Lifewards: the damage after armour goes to the Geminae as direct damage, up to 2 summoned in a battle) and Creed's Sergeant Kell (once; he swaps hexes with
    // Creed and takes the hit). While one is next to its charge, every hit aimed at the charge lands on the guard; with none next to it, a free pooled one appears on a free adjacent hex first.
    // Spore mines (Biovore): a flying mine with 1 movement walks toward the nearest enemy (or the one it is ordered at) and, when it ends next to an enemy, explodes (Floating Death): toxic hits on every adjacent
    // enemy, and the mine is gone. A mine that is defeated explodes too, and so do the allied mines next to it.
    const isMine = function (x) { return x.id === "tyranSmnSporeMine" && !!x.boom; };
    let boomLog = [], overLog = [];  // overLog: the units exterminated by an overkill in this step
    const explode = function (m) {
      if (m.exploded) return [];
      m.exploded = true;
      const out = [];
      live().filter(function (e) { return e.side !== m.side && !e.ds && RULES.dist(e.t, m.t) === 1; }).forEach(function (e) {
        const r = abilityHit(m, e, m.boom.raw, m.boom.prof, m.boom.n);
        curAtk++; hurt(e, Math.round(r.tot), m, r.per);
        const rec = { tgt: e, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), from: m }; out.push(rec); boomLog.push(rec);
      });
      m.alive = false; m.hp = 0; deadLog.push(m);
      return out;
    };
    const mineChain = function (m) {  // a defeated mine and the allied mines next to it
      const list = [m].concat(live().filter(function (x) { return isMine(x) && x.side === m.side && !x.exploded && RULES.dist(x.t, m.t) === 1; }));
      list.forEach(function (x) { if (x === m || x.alive) explode(x); });
    };
    let guardLog = [];
    // an attack on a character that has guards (Celestine's Geminae, Kell): the WHOLE attack goes to the guard that stands (or appears) for it, and if the guard falls the attack is spent: what is left of it is lost.
    // The next attack meets the next guard; when none is left it is the owner's. Each attack leaves its line in guardLog (the guard that took it, or the owner).
    const hurtHits = function (t, dmg, by, per, prof) {
      const before = guardLog.length;
      hurt(t, dmg, by, per, prof);
      if (t.pool && by && by.side !== t.side && dmg > 0 && guardLog.length === before) guardLog.push({ from: t, g: t, own: true, hit: true, n: 1, dmg: dmg });  // no guard took it: it is the owner's
    };
    function guardOf(t) {
      if (!t.pool || !t.alive) return null;
      const near = t.pool.filter(function (g) { return g.alive && RULES.dist(g.t, t.t) === 1; })[0];
      if (near) return { g: near, hex: null };
      const next = t.pool.filter(function (g) { return !g.came; })[0];
      if (!next) return null;
      const hs = freeAround(t).sort(function (a, b2) { return RULES.cell(b2[0], b2[1]).el - RULES.cell(a[0], a[1]).el; });
      return hs.length ? { g: next, hex: hs[0] } : null;
    }
    // regeneration and revival: a heal also ends a stun, a pin and a markerlight; every event goes in the log of the step that caused it
    let deadLog = [];  // the units defeated during a step, for the log
    let psyCount = [0, 0];  // psychic attacks made by each side this turn
    let regenLog = [], turnNo = 0, meleeDead = 0, activeUses = [0, 0];  // activeUses: abilities used by each side's characters (Titus)  // meleeDead: the units defeated in melee in this battle (Blessings of Khorne)
    const abOf = function (u, id) { const a = (u.rules.ab || []).filter(function (x) { return x[0] === id; })[0]; return a ? ((a[8] && a[8][rar]) || {}) : null; };
    const heal = function (u, amt, label) {
      if (fxOn(u, "noheal")) return 0;  // Fury of the Ancients: no healing for 2 rounds
      if (amt > 0) u.neuro = 0;  // a heal clears the Neuroparasite
      const vgf = abOf(u, "VoltagheistField"); if (vgf) { amt *= 1 - (parseInt(vgf.healthPct, 10) || 50) / 100; u.vh = turnNo; }  // Electro-priest: less health restored, and a hit more this turn
      const tcz = fxOn(u, "terror"); if (tcz) amt *= 1 - (tcz.v.healPct || 0) / 100;  // Terrorchem Poison: less health restored
      amt = Math.max(0, Math.min(u.max - u.hp, Math.round(amt + (u.nano ? u.nanoBonus || 0 : 0))));
      if (!amt || !u.alive) return 0;
      u.hp += amt; delete u.fx.stun; delete u.fx.pin; u.marked = false; u.markedBy = -1;
      regenLog.push({ u: u, amt: amt, label: label });
      return amt;
    };
    const mech = function (x) { return !!(x.tset.Mechanical || x.tset.LivingMetal); };
    const reviveBy = function (t, ext) {  // Narthecium (an adjacent non-mechanical ally comes back with up to 7 830 health, once per turn), Tainted Narthecium (Chaos, 75 %)
      const near = live().filter(function (e) { return e.side === t.side && e !== t && RULES.dist(e.t, t.t) === 1 && e.narthAt !== turnNo; });
      for (let i = 0; i < near.length; i++) {
        const e = near[i], a = abOf(e, "Narthecium"), b2 = abOf(e, "TaintedNarthecium");
        if (mech(t)) continue;
        if (a && !ext) { e.narthAt = turnNo; return { by: e, hp: a.hp || 1 }; }  // Narthecium: not for an exterminated unit
        if (b2 && t.rules.al === "Chaos") { e.narthAt = turnNo; if (stepRng() * 100 < (parseInt(b2.chance, 10) || 75)) return { by: e, hp: b2.hp || 1 }; }
      }
      return null;
    };
    // reactions to a hit during the enemy turn: Tyrith (Unwavering Sentinel) answers the attacker within 2 (1 if an enemy is next to her); Sarquael (Grim Retribution) fires back once per turn, at the first attacker in
    // range, when he or an adjacent Dark Angel is attacked and no enemy is next to him
    const fireBack = function (a, tg, v, prof, label) {
      const r = abilityHit(a, tg, avgOf(v, ""), prof, parseInt(v.nrOfHits, 10) || 1);
      curAtk++; hurt(tg, Math.round(r.tot), a, r.per, prof);
      if (prof === "Psychic") tg.psyTurn = turnNo;  // psychic damage this turn (Fury of the Ancients ...)
      boomLog.push({ tgt: tg, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), from: a, label: label });
    };
    const riposte = function (t, by) {
      if (RULES.dist(t.t, by.t) === 1) {
        const ww = abOf(t, "WireweaveNet"), ms = abOf(t, "MartialSuperiority");
        if (ww && t.wwTurn !== turnNo) { t.wwTurn = turnNo; fireBack(t, by, ww, "Piercing", "Filet tissé"); }  // the first melee attack of the enemy turn
        if (ms && t.msAtk !== curAtk && by.alive) { t.msAtk = curAtk; fireBack(t, by, ms, "Power", "Supériorité martiale"); }  // every melee attack against Jaeger
      }
      const us = abOf(t, "UnwaveringSentinel");
      if (us && t.ripAtk !== curAtk && RULES.dist(t.t, by.t) <= (nextTo(t) ? 1 : parseInt(us.range, 10) || 2)) { t.ripAtk = curAtk; fireBack(t, by, us, "Bolter", "riposte"); }
      live().filter(function (h) { return h.side === t.side && h.grimTurn !== turnNo && abOf(h, "GrimRetribution") && (h === t || (t.rules.fa === "DarkAngels" && RULES.dist(h.t, t.t) === 1)) && !nextTo(h); }).forEach(function (h) {
        const w = mainWeapon(h, false), dd = RULES.dist(h.t, by.t);
        if (by.alive && w && w[0] > 1 && dd >= 2 && dd <= w[0] && RULES.sight(h.t, by.t)) { h.grimTurn = turnNo; fireBack(h, by, abOf(h, "GrimRetribution"), "Plasma", "tir Sentinelle"); }
      });
    };
    // watchers, drones and mirrors: the passives of some summons that take the hits of the units next to them
    let protecting = false;
    const watcherFlee = function (w) {  // No Hiding from the Watchers: the Watcher steps 1 hex away from every other unit; with no other Dark Angel on the field (but Watchers) it leaves
      if (!live().some(function (x) { return x.side === w.side && x !== w && x.rules.fa === "DarkAngels" && (x.rules.pa || []).indexOf("NoHidingFromTheWatchers") < 0; })) { w.alive = false; return; }
      const others = live().filter(function (x) { return x !== w; }), spots = freeAround(w).sort(function (a, b2) {
        const f = function (h) { return others.length ? Math.min.apply(null, others.map(function (x) { return RULES.dist(h, x.t); })) : 0; };
        return f(b2) - f(a);
      });
      if (spots.length) w.t = spots[0].slice();
    };
    const wrathShield = function (by, wd) {  // Wrask: a shield for him and the Chaos units next to him
      [by].concat(live().filter(function (x) { return x !== by && x.side === by.side && x.rules.al === "Chaos" && RULES.dist(x.t, by.t) === 1; })).forEach(function (x) { x.shield = { amt: wd.shieldHp || 0, until: by.side === 0 ? round : round + 1, src: "WrathfulDevotion" }; regenLog.push({ u: x, amt: wd.shieldHp || 0, label: "bouclier", shield: true }); });
    };
    const hurt = function (t, dmg, by, per, prof) {  // a hit lands: its health, the kill of the one who struck, and the decoy a fallen Ambush unit leaves
      if (t.lastAtk !== curAtk) { t.lastAtk = curAtk; t.attacked++; }
      t.hitNow = true;
      if (dmg > 0 && !(prof && String(TV.terminatorArmourExcludedDmgProfiles || "Psychic,DirectDamage").split(",").indexOf(prof) >= 0)) t.termUsed = true;  // Terminator Armour: a psychic or direct hit does not use it up
      if (!protecting && by && by.side !== t.side && dmg > 0 && !t.decoy) {  // Savior Protocols (a T'au drone takes 50 % of each hit aimed at an adjacent T'au unit), Draw Fire (half of the hits go to the Terminator)
        const one = per || dmg;
        let left = Math.max(1, Math.round(dmg / Math.max(1, one)));
        protecting = true;
        live().forEach(function (x) {
          const pa = x.rules.pa || [];
          if (x === t || x.side !== t.side || !pa.length || RULES.dist(x.t, t.t) !== 1 || left <= 0) return;
          let k = 0;
          if (pa.indexOf("SaviorProtocols") >= 0 && t.rules.fa === "Tau") { for (let i = 0; i < left; i++) if (stepRng() * 100 < 50) k++; }
          else if (pa.indexOf("DrawFire") >= 0) k = Math.floor(left / 2);
          if (k > 0) { left -= k; const ge2 = { from: t, g: x, fresh: false, hit: true, dmg: Math.round(k * one) }; guardLog.push(ge2); hurt(x, Math.round(k * one), by, per); if (!x.alive) ge2.died = true; }
        });
        protecting = false;
        dmg = Math.round(left * one);
        if (dmg <= 0) return;
      }
      if (by && by.side !== t.side && dmg > 0 && t.rules.fa === "ThousandSons" && !t.summon) {  // Twisted Mirage: the adjacent Yazaghor loses the health instead
        const tm = live().filter(function (x) { return x !== t && x.side === t.side && (x.rules.pa || []).indexOf("TwistedMirage") >= 0 && RULES.dist(x.t, t.t) === 1; })[0];
        if (tm) { guardLog.push({ from: t, g: tm, fresh: false, hit: true }); t = tm; }
      }
      if ((t.rules.pa || []).indexOf("NoHidingFromTheWatchers") >= 0) { if (dmg > 0) watcherFlee(t); return; }  // a Watcher takes no damage at all
      const gp = by && by.side !== t.side && dmg > 0 ? guardOf(t) : null;
      let ge = null;
      if (gp) {
        const g = gp.g;
        if (gp.hex) { g.t = gp.hex.slice(); g.alive = true; g.came = true; g.hp = g.max; g.acted = false; g.spent = 0; }
        if (t.guardSwap) { const a = g.t; g.t = t.t; t.t = a; }  // Kell takes Creed's hex and Creed his
        ge = { from: t, g: g, fresh: !!gp.hex, hit: true, dmg: dmg, n: 1 };
        guardLog.push(ge);
        t = g;
      }
      if (t.cloak && by && by.side !== t.side && dmg > 0) { const cl = t.cloak; t.cloak = 0; dmg = Math.max(0, dmg - cl); if (dmg <= 0) { regenLog.push({ u: t, amt: cl, label: "son manteau d'instantanéité absorbe", shielded: true }); return; } }  // Timesplinter Mantle: the first attack against it hurts less
      let hyp = null;
      if (by && by.side !== t.side && dmg > 0 && active !== t.side && t.hypTurn !== turnNo && abOf(t, "HypersensoryAbilities")) { hyp = abOf(t, "HypersensoryAbilities"); t.hypTurn = turnNo; dmg = Math.min(dmg, Math.max(0, t.hp - Math.ceil(t.hp * (hyp.hpPct || 50) / 100))); if (dmg <= 0) hyp = hyp; }  // Judh: the first hit of each enemy turn cannot take her below half of her current health
      if (t.shield && round <= t.shield.until && t.shield.amt > 0 && dmg > 0) {  // a shield (Arcane Shield, Wrathful Devotion) takes the damage first
        const ab2 = Math.min(t.shield.amt, dmg); t.shield.amt -= ab2; dmg -= ab2;
        if (dmg <= 0) { regenLog.push({ u: t, amt: ab2, label: "son bouclier absorbe", shielded: true }); return; }
      }
      const hp0 = t.hp, ext = dmg - hp0 >= t.max;  // exterminated: the overkill is at least its whole health
      t.hp = healthAfter(t, dmg); t.lastPer = per || dmg;
      if (ge && t.hp <= 0) ge.died = true;  // the guard that appeared and fell in the same hit
      if (by && by.side !== t.side && t.fx && t.fx.chrono) delete t.fx.chrono;  // the extra damage of Chronometron goes to the first attack only
      if (t.hp > 0 && dmg > 0) live().forEach(function (e) {  // Medicus Ministorum: an adjacent non-mechanical ally that took damage and stands regenerates
        const a = e.side === t.side && e !== t && RULES.dist(e.t, t.t) === 1 && !mech(t) ? abOf(e, "MedicusMinistorum") : null;
        if (a) heal(t, a.hpToHeal || 0, "Medicus Ministorum");
      });
      if (t.hp > 0 && dmg > 0 && by && by.side !== t.side) battleFocus(t);
      if (t.hp > 0 && hyp && by && by.alive) {  // she then steps to a free adjacent hex and, if the attacker is within 2, shoots it
        const sp2 = prio(t, freeAround(t), t.t), from2 = t.t.slice();
        if (sp2.length) { t.t = sp2[0].slice(); if (putDecoy(t, from2)) regenLog.push({ u: t, amt: 0, label: "laisse un leurre sur sa case de départ", flee: true }); }  // Judh leaves a decoy on the hex she started from
        if (RULES.dist(t.t, by.t) <= (parseInt(hyp.range, 10) || 2)) fireBack(t, by, hyp, "Projectile", "Sens hyper-aiguisés");
      }
      if (dmg > 0 && by && by.alive && by.side !== t.side) live().forEach(function (e) {  // Exitor-Rho: an enemy next to him that another allied mechanical unit attacks takes his energy hits
        if (e.side === by.side && e !== by && by.tset.Mechanical && !e.ogBusy && abOf(e, "OptimizedGait") && RULES.dist(e.t, t.t) === 1) { e.ogBusy = true; fireBack(e, t, abOf(e, "OptimizedGait"), "Energy", "Allure optimisée"); e.ogBusy = false; }
      });
      if (dmg > 0 && by && by !== t && by.side !== t.side) live().forEach(function (lv) {  // Laviscus: the allies that hit an enemy next to him raise his Outrage with their biggest hit of the turn
        if (lv.side === by.side && lv !== by && abOf(lv, "RefusalToBeOutdone") && RULES.dist(lv.t, t.t) === 1) { lv.outr = lv.outr || {}; lv.outr[by.i] = Math.max(lv.outr[by.i] || 0, per || dmg); }
      });
      if (t.hp > 0 && dmg > 0 && by && by.alive && by.side !== t.side && active !== t.side) riposte(t, by);
      if (t.hp <= 0) {
        if (by && by.side !== t.side) { by.kills++; if (!t.summon) by.charKills = (by.charKills || 0) + 1; }
        live().forEach(function (hx2) {  // Hascule: an enemy next to him is defeated -> he hits another adjacent enemy, which is taunted if it survives
          const es = abOf(hx2, "EcstaticSlaughter");
          if (!es || hx2.side === t.side || RULES.dist(hx2.t, t.t) !== 1 || hx2 === t || hx2.esBusy) return;
          const tg2 = foes(hx2).filter(function (e) { return e !== t && RULES.dist(hx2.t, e.t) === 1; }).sort(function (a2, b2) { return a2.hp - b2.hp; })[0];
          if (!tg2) return;
          hx2.esBusy = true; fireBack(hx2, tg2, es, "Eviscerate", "Massacre extatique"); hx2.esBusy = false;
          if (tg2.alive) tg2.fx.taunt = { id: "taunt", taunt: hx2, until: stunUntil(tg2) + (parseInt(es.nrOfRounds, 10) || 1) - 1, v: {} };
        });
        const chz = by && by.side !== t.side ? abOf(by, "CosmicHorror") : null;
        if (chz && !t.decoy) {  // the Patriarch's kill leaves a decoy on the hex; the other enemies around have a chance to be pinned
          putDecoy(by, t.t);
          live().filter(function (x) { return x !== t && x.side === t.side && RULES.dist(x.t, t.t) === 1; }).forEach(function (x) { if (stepRng() * 100 < (chz.chance || 0)) x.fx.pin = { id: "pin", until: stunUntil(x) }; });
        }
        if (t.zkar && t.mowOf) t.mowOf.deployed = false;  // Z'Kar defeated: his machine of war can be used again
        if (t.aug && t.aug.by) delete t.aug.by.used.PrimeTestSubject;  // Prime Test Subject can be used again
        if (t.ghost && !t.tfUsed && abOf(t, "TimeFlux")) {  // Toth: the first time he is defeated, if his time ghost is on the field he comes back there (even if exterminated)
          t.tfUsed = true; t.t = t.ghost.slice(); t.ghost = null; t.hp = Math.min(t.max, abOf(t, "TimeFlux").hp || 1);
          regenLog.push({ u: t, amt: t.hp, label: "revient par son fantôme temporel", revive: true }); return;
        }
        if (!ext && fxOn(t, "reanim")) { const rz = fxOn(t, "reanim"); delete t.fx.reanim; t.hp = Math.min(t.max, rz.hp || 1); regenLog.push({ u: t, amt: t.hp, label: "réanimé par le faisceau", revive: true }); return; }  // Reanimation Beam
        const rpz = abOf(t, "ReanimationProtocols");
        if (rpz && !ext && live().some(function (x) { return x !== t && x.side === t.side && x.id === t.id; }) && stepRng() * 100 < (parseInt(rpz.chance, 10) || 35)) {  // Necrons: another of its kind on the field -> a chance to get up again
          t.hp = Math.max(1, Math.round(t.max * (parseInt(rpz.hpPct, 10) || 25) / 100)); regenLog.push({ u: t, amt: t.hp, label: "réanimé par Protocole de Réanimation", revive: true }); return;
        }
        const rv = reviveBy(t, ext);
        if (rv) { t.hp = Math.min(t.max, rv.hp); regenLog.push({ u: t, amt: t.hp, label: "réanimé par " + rv.by.name, revive: true }); return; }
        if (by && by !== t && by.t && by.side !== t.side && RULES.dist(by.t, t.t) === 1) {
          meleeDead++;
          const wd = abOf(by, "WrathfulDevotion");
          if (wd) wrathShield(by, wd);  // Wrask: a shield for him and the Chaos units next to him
        }
        if (abOf(t, "ArmourOfShriekingSouls") && by && by.side !== t.side && by.alive) by.euph = t;  // Lucius: whoever kills him becomes euphoric
        if (t.euph && !t.euph.alive) { const lu = t.euph; lu.alive = true; lu.t = t.t.slice(); lu.hp = Math.min(lu.max, (abOf(lu, "ArmourOfShriekingSouls") || {}).hp || 1); lu.fx = {}; lu.acted = true; lu.spent = 99; regenLog.push({ u: lu, amt: lu.hp, label: "ressuscite là où son bourreau est tombé", revive: true }); t.euph = null; }  // ... and Lucius comes back where it falls
        if (by && by.alive && by.side !== t.side) { const ob = fxOn(by, "observed"), tn = fxOn(t, "taunt"); if (ob && tn && tn.taunt === by) { ob.kill = true; delete by.used.DaemonicPatrons; } }  // Hascule killed a taunted enemy: he may use the ability again
        if (t.tset.FinalJustice && !t.fjDone && !ext) {  // Final Justice: one last normal attack before it is gone
          t.fjDone = true; t.acted = false;
          const tg = targetsOf(t, { id: "atk", ok: true }).sort(function (a, b2) { return ((b2.dmg >= b2.u.hp) - (a.dmg >= a.u.hp)) || b2.dmg - a.dmg; })[0];
          if (tg && tg.dmg > 0) { boomLog.push({ tgt: tg.u, dmg: tg.dmg, hits: tg.hits, per: tg.per, from: t, label: "porte un dernier coup" }); curAtk++; hurt(tg.u, tg.dmg, t, tg.per); }
        }
        t.alive = false; deadLog.push(t); if (ext) overLog.push(t);
        live().filter(function (x) { return x.side === t.side && x.tset.BattleFatigue && RULES.dist(x.t, t.t) === 1 && !live().some(function (y) { return y.side === x.side && y.tset.Synapse && RULES.dist(y.t, x.t) <= 2; }); }).forEach(function (x) {  // Battle Fatigue: 10 % to flee when an adjacent ally falls, 50 % when it was exterminated
          if (stepRng() * 100 < (ext ? 50 : 10)) {
            const yr = live().filter(function (p) { return p.side === x.side && abOf(p, "SummaryExecution"); })[0];
            if (yr && yr.yexec) return;  // Yarrick: after the first execution his units ignore Battle Fatigue
            if (yr) yr.yexec = true;
            x.alive = false; x.hp = 0; regenLog.push({ u: x, amt: 0, label: yr ? "exécuté par " + yr.name + " (Exécution sommaire)" : "fuit le combat", flee: !yr });
          }
        });
        if (t.tset.Explodes || t.tset.PutridExplosion) {  // explosions: 25 % of its maximum health to every adjacent unit (direct; toxic for Putrid Explosion, which spares the Death Guard)
          live().filter(function (x) { return x !== t && RULES.dist(x.t, t.t) === 1; }).forEach(function (x) {
            let dmg;
            if (t.tset.Explodes) dmg = Math.round(t.max * (TV.explodesDmg || 25) / 100);
            else if (x.rules.fa === "DeathGuard") return;
            else dmg = Math.round(abilityHit(t, x, t.max * (TV.putridExplosionDmgPct || 25) / 100, TV.putridExplosionDamageProfile || "Toxic", 1).tot);
            boomLog.push({ tgt: x, dmg: dmg, hits: 1, per: dmg, from: t, label: "explose" }); curAtk++; hurt(x, dmg, t, dmg);
          });
        }
        if (isMine(t) && !t.exploded) mineChain(t);
        if (t.ambush && t.dd) { t.ambush = false; t.fallen = true; t.dd.t = t.t.slice(); t.dd.alive = true; }
        if (abOf(t, "FlamesOfMutation") && !ext) hexfx[t.t[0] + "," + t.t[1]] = hexCover(t.t, "fire");  // Blue Horror: its hex catches fire
        if (t.kids && abOf(t, "Split") && !ext) prio(t, freeAround(t), t.t).slice(0, 2).forEach(function (h, i) { const k = t.kids[i]; if (k) { k.t = h.slice(); k.alive = true; k.hp = k.max; k.acted = false; k.spent = 99; k.arrRound = round; } });  // Pink Horror: 2 Blue Horrors
        if (by && by.kids && abOf(by, "CursedOfTheWalkingPox") && by.side !== t.side && !mech(t) && !t.decoy) { by.kidIdx = by.kidIdx || 0; const k = by.kids[by.kidIdx++]; if (k) { k.t = t.t.slice(); k.alive = true; k.hp = k.max; k.acted = false; k.spent = 99; k.arrRound = round; } }  // Poxwalker: its kill raises another one
      }
    };
    // what lands at the start of this turn: the Seeker missiles fired at the end of the owner's last turn
    const resolvePending = function () {
      const out = [], keep = [];
      pending.forEach(function (p) {
        if (p.by.side !== active) { keep.push(p); return; }
        p.tgt.marked = false; p.tgt.markedBy = -1;
        if (!p.by.alive || !p.tgt.alive) return;
        const v = (p.ab[8] && p.ab[8][rar]) || {}, r = p.calc ? p.calc(p) : abilityHit(p.by, p.tgt, avgOf(v, ""), p.ab[5], 1);
        curAtk++; hurt(p.tgt, Math.round(r.tot), p.by);
        out.push({ u: p.by, to: null, tgt: p.tgt, dmg: Math.round(r.tot), hits: r.hits || 1, per: Math.round(r.per), label: p.ab[1] });
      });
      pending = keep;
      return out;
    };
    // ---- the zones marked for later (a machine of war's bombardment at the start of its side's next turn; a mine that goes off the first time an enemy ends a move on it) ----
    const sameHex = function (a, b2) { return a[0] === b2[0] && a[1] === b2[1]; };
    const enemiesOn = function (side, hexes) { return live().filter(function (x) { return x.side !== side && !x.ds && hexes.some(function (h) { return sameHex(h, x.t); }); }); };
    const BOMB = {  // what a marked zone does when its turn comes: [{tgt, dmg, hits, per, pin}]
      OverwhelmingWrath: function (mk) {  // Azkor: the enemies next to him at the start of his turn
        const v = (mk.ab[8] && mk.ab[8][rar]) || {};
        return foes(mk.by).filter(function (e) { return RULES.dist(e.t, mk.by.t) === 1; }).map(function (e) { const r = abilityHit(mk.by, e, avgOf(v, ""), mk.ab[5] || "Chain", parseInt(v.nrOfHits, 10) || 2); return { tgt: e, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per) }; });
      },
      DevastatingRefrain: function (mk) {
        const v = (mk.ab[8] && mk.ab[8][rar]) || {};
        return enemiesOn(mk.by.side, mk.hexes).map(function (e) { const r = abilityHit(mk.by, e, avgOf(v, ""), mk.ab[5], parseInt(v.nrOfHits, 10) || 1); return { tgt: e, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per) }; });
      },
      MalleusRocketLauncher: function (mk) {  // 3 missiles on the marked hex, 9 shared around it (at most 3 impacts per unit); +dmg per impact near an Astra Militarum ally; the units hit are pinned
        const v = (mk.ab[8] && mk.ab[8][rar]) || {}, c = mk.hexes[0], ring = RULES.around(c[0], c[1]).filter(function (h) { const x = RULES.cell(h[0], h[1]); return x && x.kind !== 2; });
        const cap = parseInt(v.nrOfProjectiles_3, 10) || 3, share = {}, out = [];
        ring.forEach(function (h, i) { share[h[0] + "," + h[1]] = Math.floor((parseInt(v.nrOfProjectiles_2, 10) || 9) / Math.max(1, ring.length)) + (i < (parseInt(v.nrOfProjectiles_2, 10) || 9) % Math.max(1, ring.length) ? 1 : 0); });
        const allOn = function (hexes) { return live().filter(function (x) { return !x.ds && hexes.some(function (h) { return sameHex(h, x.t); }); }); };  // the missiles hit every unit, allies too
        allOn([c].concat(ring)).forEach(function (e) {
          const n = Math.min(cap, sameHex(e.t, c) ? parseInt(v.nrOfProjectiles, 10) || 3 : share[e.t[0] + "," + e.t[1]] || 0);
          if (!n) return;
          const near = e.side !== mk.by.side && live().some(function (x) { return x.side === mk.by.side && x.rules.fa === "AstraMilitarum" && RULES.dist(x.t, e.t) <= (parseInt(v.range, 10) || 2); });  // the extra damage is for the enemies
          const r = abilityHit(mk.by, e, avgOf(v, "") + (near ? v.extraDmg || 0 : 0), mk.ab[5], n);
          out.push({ tgt: e, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), pin: true });
        });
        return out;
      },
    };
    const resolveMarks = function () {  // the start of a turn: the bombardments of the side that plays land, its mines of the last turn are gone
      const out = [], keep = [];
      zmarks.forEach(function (mk) {
        if (mk.by.side !== active || mk.perm) { keep.push(mk); return; }
        if (mk.kind !== "bomb" || !mk.by.alive) return;
        (BOMB[mk.ab[0]](mk) || []).forEach(function (r) {
          curAtk++; hurt(r.tgt, r.dmg, mk.by);
          if (r.pin && r.tgt.alive) r.tgt.fx.pin = { id: "pin", until: stunUntil(r.tgt) };
          out.push({ u: mk.by, to: null, tgt: r.tgt, dmg: r.dmg, hits: r.hits, per: r.per, label: mk.ab[1] });
        });
      });
      zmarks = keep;
      return out;
    };
    const checkMarks = function (u) {  // a unit ends a move: an enemy on a mined hex sets it off, an ally takes the mine away
      const out = [];
      if (!u.alive) return out;
      zmarks.forEach(function (mk) {
        if (mk.kind === "zone" && mk.hexes.length && round <= mk.until && u.side !== mk.by.side && mk.hexes.some(function (h) { return sameHex(h, u.t); })) {  // Macro-Plasma: the first enemy to end a move in the zone sets it off
          enemiesOn(mk.by.side, mk.hexes).forEach(function (e) {
            const r = abilityHit(mk.by, e, mk.raw, mk.prof, mk.n);
            curAtk++; hurt(e, Math.round(r.tot), mk.by, r.per);
            out.push({ u: mk.by, to: null, tgt: e, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: mk.ab[1] });
          });
          mk.hexes = [];
          return;
        }
        if (mk.kind !== "mine") return;
        const i = mk.hexes.findIndex(function (h) { return sameHex(h, u.t); });
        if (i < 0) return;
        mk.hexes.splice(i, 1);
        if (u.side === mk.by.side) return;
        const r = abilityHit(mk.by, u, mk.raw, mk.prof, mk.n);
        curAtk++; hurt(u, Math.round(r.tot), mk.by);
        out.push({ u: mk.by, to: null, tgt: u, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: mk.ab[1] });
        if (u.alive && u.tset.Mechanical && mk.raw2) { const r2 = abilityHit(mk.by, u, mk.raw2, mk.prof, mk.n2); curAtk++; hurt(u, Math.round(r2.tot), mk.by, r2.per); out.push({ u: mk.by, to: null, tgt: u, dmg: Math.round(r2.tot), hits: r2.hits, per: Math.round(r2.per), label: mk.ab[1] + " (mécanique)" }); }
      });
      zmarks = zmarks.filter(function (mk) { return mk.hexes.length; });
      return out;
    };
    // regenerations that are not hits: after a move (Sanguinary Priest: the adjacent non-mechanical allies get 1 958-2 872; Fabricator Claw Array: a random adjacent mechanical ally gets 5 220), the same at the end of
    // the turn when the unit did not move; at the start of its turn Tough to Kill (Dreir) and Time Flux (Toth, plus the last hit he took, capped)
    // passives that strike after the unit moved (or at the end of its turn if it did not): Mephiston, Cezare, Thutmose, Godswyl
    const MOVE_AB = ["RadSaturation", "SpiritualLeader", "FuryOfTheAncients", "RedRampage", "LivingLightning", "ChampionOfTheFeast", "ArcaneShield", "HaywireMine"];
    const abName = function (u, id) { const a = (u.rules.ab || []).filter(function (x) { return x[0] === id; })[0]; return a ? a[1] : id; };
    const moveStrikes = function (u) {
      const adj = foes(u).filter(function (e) { return RULES.dist(u.t, e.t) === 1; }).sort(function (a, b2) { return a.hp - b2.hp; });
      let a;
      if ((a = abOf(u, "FuryOfTheAncients")) && adj.length) {  // an adjacent enemy and another one next to it: psychic hits, and they cannot be healed for 2 rounds
        const first = adj[0], second = foes(u).filter(function (e) { return e !== first && RULES.dist(e.t, first.t) === 1; }).sort(function (x, y) { return x.hp - y.hp; })[0];
        [first, second].forEach(function (e) { if (e && e.alive) { fireBack(u, e, a, "Psychic", abName(u, "FuryOfTheAncients")); if (e.alive) e.fx.noheal = { id: "noheal", until: round + 1 }; } });
      }
      if (abOf(u, "RadSaturation")) hexfx[u.t[0] + "," + u.t[1]] = hexCover(u.t, "contam");  // Skitarii Vanguard: after its move (else at the end of its turn) its hex is contaminated
      if ((a = abOf(u, "SpiritualLeader"))) {  // Xybia: after a move (else at the end of her turn) a decoy on a free adjacent hex (picked like a character's summon); with 2 decoys next to her, a Neophyte Hybrid takes the place of one of them
        const empty = prio(u, freeAround(u), u.t).filter(function (h) { return !decoys().some(function (x) { return sameHex(x.t, h); }); });
        if (empty.length) putDecoy(u, empty[0]);
        const near = decoys().filter(function (x) { return x.side === u.side && RULES.dist(u.t, x.t) === 1; });
        const neo = near.length >= 2 ? fromPool(u, "neo") : null;
        if (neo) { const dc = near[0]; neo.t = dc.t.slice(); dc.alive = false; neo.alive = true; neo.hp = neo.max; neo.acted = false; neo.spent = 0; regenLog.push({ u: neo, amt: neo.hp, label: "invoqué par Chef spirituel", spawn: true }); }
      }
      if ((a = abOf(u, "RedRampage")) && adj.length) {  // every adjacent enemy; a kill gives +1 movement through his next turn
        let kills = 0;
        adj.forEach(function (e) { fireBack(u, e, a, "Power", abName(u, "RedRampage")); if (!e.alive) kills++; });
        if (kills && u.alive) u.fx.mvup = { id: "mvup", src: "RedRampage", until: round + 1, mv: parseInt(a.extraMovement, 10) || 1 };
      }
      if ((a = abOf(u, "LivingLightning"))) {  // a random enemy within 2
        const c = foes(u).filter(function (e) { return RULES.dist(u.t, e.t) <= 2; });
        if (c.length) fireBack(u, c[Math.floor(stepRng() * c.length)], a, "DirectDamage", abName(u, "LivingLightning"));
      }
      if ((a = abOf(u, "ArcaneShield"))) {  // Thaumachus shields the nearest ally within 2 (Thousand Sons first, then Chaos, then anyone, else himself) for a round
        const near = live().filter(function (x) { return x.side === u.side && x !== u && RULES.dist(u.t, x.t) <= (parseInt(a.range, 10) || 2); }).sort(function (p1, p2) { const rk = function (x) { return x.rules.fa === "ThousandSons" ? 0 : x.rules.al === "Chaos" ? 1 : 2; }; return rk(p1) - rk(p2) || RULES.dist(u.t, p1.t) - RULES.dist(u.t, p2.t); })[0] || u;
        near.shield = { amt: a.shieldHp || 0, until: u.side === 0 ? round : round + 1, src: "ArcaneShield" }; regenLog.push({ u: near, amt: a.shieldHp || 0, label: "bouclier", shield: true });
      }
      if ((a = abOf(u, "HaywireMine"))) { const mh2 = u.mineHex || prio(u, freeAround(u), u.t)[0]; if (mh2) layMine(u, mh2, a); u.mineHex = null; }  // Cyrus: a mine on the hex he left, or next to him at the end of his turn if he did not move
      if ((a = abOf(u, "ChampionOfTheFeast")) && adj.length) {  // an adjacent enemy loses armour for the rest of the battle
        const e = adj[0]; fireBack(u, e, a, "Power", abName(u, "ChampionOfTheFeast"));
        if (e.alive) e.armCut = (e.armCut || 0) + (a.armorReduction || 0);
      }
    };
    const layMine = function (u, h, v) {  // a disruptor mine: it stays until someone steps on it; enemies that end a move on it take the blast (more for mechanical ones)
      zmarks.push({ kind: "mine", perm: true, hexes: [h.slice()], by: u, ab: (u.rules.ab || []).filter(function (x) { return x[0] === "HaywireMine"; })[0], raw: avgOf(v, ""), prof: "Blast", n: parseInt(v.nrOfHits, 10) || 1, raw2: avgOf(v, "_2"), n2: parseInt(v.nrOfHits_2, 10) || 2 });
    };
    const afterMove = function (u) {
      if (!u.alive) return;
      if (MOVE_AB.some(function (id) { return abOf(u, id); })) moveStrikes(u);
      const sp = abOf(u, "SanguinaryPriest"), fa = abOf(u, "FabricatorClawArray");
      if (sp) live().filter(function (x) { return x.side === u.side && x !== u && RULES.dist(x.t, u.t) === 1 && !mech(x); }).forEach(function (x) { heal(x, (sp.hpToHeal || 0) + stepRng() * ((sp.maxHpToHeal || 0) - (sp.hpToHeal || 0)), "Prêtre sanguinaire"); });
      if (fa) { const near = live().filter(function (x) { return x.side === u.side && x !== u && RULES.dist(x.t, u.t) === 1 && mech(x) && x.hp < x.max; }); if (near.length) heal(near[Math.floor(stepRng() * near.length)], fa.hpToRepair || 0, "Réseau de griffes"); }
    };
    const endRegen = function (only) {
      const pick = function (x) { return (!only || x === only) && !x.endDone; };
      field.forEach(function (g) {  // Grot: at the end of its turn, at full health, a chance to bring another Grot next to it (less for each Grot on the board)
        const pi = g.alive && g.side === active && pick(g) && g.kids ? abOf(g, "PileIn") : null;
        if (!pi || g.hp < g.max || g.born === turnNo) return;  // a Grot that has just appeared cannot copy itself in the turn it comes
        const chance = (parseInt(pi.chance, 10) || 75) - (parseInt(pi.chance_2, 10) || 5) * live().filter(function (x) { return x.side === g.side && x.id === "orksGrot"; }).length;
        g.kidIdx = g.kidIdx || 0;
        const reach = stepsOf(g, 1), k = g.kids[g.kidIdx], hs = prio(g, Object.keys(reach).filter(function (key) { return reach[key] === 1; }).map(function (key) { return key.split(",").map(Number); }), g.t);  // only a free adjacent hex it could walk onto (elevation, walls, bridges)
        if (k && hs.length && stepRng() * 100 < chance) { g.kidIdx++; k.t = hs[0].slice(); k.alive = true; k.hp = k.max; k.acted = false; k.spent = 0; k.arrRound = round; k.born = turnNo; regenLog.push({ u: k, amt: k.hp, label: "invoqué par Entassement", spawn: true }); }
      });
      field.forEach(function (u) { const tpz = u.alive && u.side === active && pick(u) ? fxOn(u, "terror") : null; if (tpz && tpz.by) { const r0 = abilityHit(tpz.by, u, avgOf(tpz.v, ""), "Toxic", parseInt(tpz.v.poisonedNrOfHits, 10) || 1), d0 = Math.round(r0.tot); boomLog.push({ tgt: u, dmg: d0, hits: r0.hits, per: Math.round(r0.per), from: tpz.by, label: "empoisonné" }); curAtk++; hurt(u, d0, tpz.by, Math.round(r0.per)); } });  // Poisoned: toxic damage at the end of its turn
      field.forEach(function (u) { if (u.alive && u.side === active && pick(u) && u.spent === 0 && !u.relocated && (abOf(u, "SanguinaryPriest") || abOf(u, "FabricatorClawArray") || MOVE_AB.some(function (id) { return abOf(u, id); }))) afterMove(u); }); };
    // the effects of the end of a character's turn: they come when it can do nothing more (it is greyed), not when the whole side ends its turn; the ones of the characters still able to act come with the end of the turn
    const endUnit = function (only) {
      const pick = function (x) { return (!only || x === only) && !x.endDone; };
          field.forEach(function (x) {  // Daemonic Patrons: at the end of his next turn Hascule loses 30 % of his health unless he killed a taunted enemy
            const ob = x.alive && x.side === active && pick(x) ? fxOn(x, "observed") : null;
            if (ob && ob.until === round && !ob.kill) { curAtk++; hurt(x, Math.round(x.hp * (ob.v.hpPct || 30) / 100), null); }
          });
          field.forEach(function (x) { const we = x.alive && x.side === active && pick(x) ? abOf(x, "WaaaghEnergy") : null; if (we && (x.waaaghLvl || 0) >= (parseInt(we.effectLevel, 10) || 7)) { curAtk++; hurt(x, Math.round(x.hp * (parseInt(we.hpPct, 10) || 25) / 100), null); } });  // too much Waaagh! energy burns him
          field.forEach(function (x) { if (x.alive && x.aug && x.side === active && pick(x)) { curAtk++; hurt(x, Math.round(x.max * (x.aug.pct || 20) / 100), null); } });  // augmented: it loses 20 % of its maximum health at the end of each of its turns
          field.forEach(function (x) {  // My Will Be Done: at the end of Anuphet's turn an adjacent mechanical ally attacks; if none could, he hits harder next turn
            const mw = x.alive && x.side === active && pick(x) ? abOf(x, "MyWillBeDoneOverlord") : null;
            if (!mw) return;
            let done = false;
            live().filter(function (y) { return y !== x && y.side === x.side && y.tset.Mechanical && RULES.dist(y.t, x.t) === 1; }).some(function (y) {
              y.acted = false;
              const best = targetsOf(y, { id: "atk", ok: true }).filter(function (z) { return z.dmg > 0; }).sort(function (a, b2) { return ((b2.dmg >= b2.u.hp) - (a.dmg >= a.u.hp)) || b2.dmg - a.dmg; })[0];
              if (!best) return false;
              const per = Math.min(best.per, mw.maxDmg || 7830); curAtk++; hurt(best.u, Math.round(per * best.hits), y, per);
              boomLog.push({ tgt: best.u, dmg: Math.round(per * best.hits), hits: best.hits, per: Math.round(per), from: y, label: "Ma volonté sera faite" }); done = true; return true;
            });
            if (!done) x.fx.will = { id: "will", extra: mw.extraDmg || 0, until: round + 1 };
          });
          endRegen(only);
      field.forEach(function (x) { if (x.side === active && (!only || x === only)) x.endDone = true; });
    };
    const startRegen = function () {
      live().filter(function (u) { return u.side === active; }).forEach(function (u) {
        const tk = abOf(u, "ToughToKill"), tf = abOf(u, "TimeFlux");
        if (u.euph) { const ev = abOf(u.euph, "ArmourOfShriekingSouls") || {}, lost = Math.round((ev.minHp || 0) + stepRng() * ((ev.maxHp || 0) - (ev.minHp || 0))); boomLog.push({ tgt: u, dmg: lost, hits: 1, per: lost, from: u.euph, label: "euphorie : perd de la santé" }); curAtk++; hurt(u, lost, null); }  // euphoric: it loses health at the start of each of its turns
        const tpz = fxOn(u, "terror"); if (tpz && tpz.by) { const r0 = abilityHit(tpz.by, u, avgOf(tpz.v, ""), "Toxic", parseInt(tpz.v.poisonedNrOfHits, 10) || 1), d0 = Math.round(r0.tot); boomLog.push({ tgt: u, dmg: d0, hits: r0.hits, per: Math.round(r0.per), from: tpz.by, label: "empoisonné" }); curAtk++; hurt(u, d0, tpz.by, Math.round(r0.per)); }  // Poisoned: toxic damage at the start of its turn
        const bl = fxOn(u, "balm"); if (bl) { heal(u, bl.amt || 0, "Baume guérisseur"); delete u.fx.balm; }
        const dh = abOf(u, "DestroyerHive");  // Typhus: a random adjacent enemy takes direct damage at the start of his turn
        if (dh) { const c = foes(u).filter(function (e) { return RULES.dist(u.t, e.t) === 1; }); if (c.length) fireBack(u, c[Math.floor(stepRng() * c.length)], dh, "DirectDamage", abName(u, "DestroyerHive")); }
        if (tk) heal(u, tk.hpToHeal || 0, "Dur à cuire");
        if (tf) { heal(u, Math.min(tf.maxHpToHeal || 1e9, (tf.hpToHeal || 0) + (u.lastPer || 0)), "Flux temporel"); u.lastPer = 0; }
      });
    };
    // Sentinelle: when an enemy moves (a step, a summon's walk, a dash) the watching units of the other side that reach it fire at once with their ranged weapon, the first mover only (they stay in the mode if
    // they kill with Imospekh's / Re'vas' abilities, with fewer hits). A unit with Infiltrate is not seen; a pinned one does not watch; a melee-only unit has nothing to fire. Only where the mover ends its move counts here.
    const owReact = function (mv) {
      const out = [];
      if (!mv.alive || mv.ds || mv.tset.Infiltrate) return out;
      field.filter(function (x) { return x.alive && x.ow && x.side !== mv.side; }).forEach(function (x) {
        if (!mv.alive || fxOn(x, "pin")) return;
        const dd = RULES.dist(x.t, mv.t);
        let w = null;  // an enemy that ends its move next to the watcher gets its melee weapon; further away its ranged one (not usable with an enemy next to the watcher)
        if (dd === 1) { const mw = mainWeapon(x, true); w = mw && mw[0] === 1 ? mw : null; }
        else { const rw = mainWeapon(x, false); if (rw && rw[0] > 1 && dd <= rw[0] && RULES.sight(x.t, mv.t) && !nextTo(x)) w = rw; }
        if (!w) return;
        const id = abOf(x, "InescapableDeath"), sn = fxOn(x, "sentinel"), hail = fxOn(x, "hail"), cutBy = (id ? parseInt(id.hitsReduction, 10) || 1 : 0) || (sn ? parseInt(sn.cut, 10) || 1 : 0) || ((abOf(x, "FiringPosition") || null) ? parseInt(abOf(x, "FiringPosition").hitsReduction, 10) || 2 : 0);  // Havoc: it stays on Overwatch after a kill, with fewer hits
        const w2 = [w[0], w[1], Math.max(1, w[2] - x.owCut)], r = damageOf(x, mv, { w: w2, sentinel: true, extra: (id ? id.extraDmg || 0 : 0) + (sn ? sn.extra || 0 : 0), pierce: hail ? (hail.v && hail.v.extraPierceRatio) || 0 : 0 }, dd);
        curAtk++; guardLog = []; hurtHits(mv, Math.round(r.tot), x, r.per, undefined, r.hits);  // hit by hit: a guard of the one who moved (Celestine's Geminae) takes them
        out.push({ u: x, to: null, tgt: mv, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: "Sentinelle", guards: guardLog });
        if (hail && hail.by) {  // the Storm Speeder fires at the same target
          const hv = hail.v || {}, r2 = abilityHit(hail.by, mv, avgOf(hv, ""), hail.by.rules.ab.filter(function (a) { return a[0] === "Hailstrike"; })[0][5], parseInt(hv.nrOfHits, 10) || 3);
          curAtk++; guardLog = []; hurtHits(mv, Math.round(r2.tot), hail.by, r2.per, undefined, r2.hits);
          out.push({ u: hail.by, to: null, tgt: mv, dmg: Math.round(r2.tot), hits: r2.hits, per: Math.round(r2.per), label: "Hailstrike", guards: guardLog });
        }
        if (!mv.alive && cutBy) x.owCut += cutBy; else x.ow = false;
      });
      return out;
    };
    // the start of a turn on the hex effects: at a new round the fire may spread into tall grass; the units of the side that plays standing in fire (20 % of their initial health) or on despoiled ground (6-9 %) take direct damage
    const tileTurn = function () {
      const out = [];
      if (active === 0) Object.keys(hexfx).forEach(function (k) {
        const f = hexfx[k];
        if (f.kind !== "fire" || round > f.until) return;
        RULES.around(f.h[0], f.h[1]).forEach(function (n) {
          const c = RULES.cell(n[0], n[1]);
          if (c && c.kind === 0 && c.tile === "DryBush" && !hexKind(n) && stepRng() * 100 < 10) { hexfx[n[0] + "," + n[1]] = hexCover(n, "fire"); out.push({ env: true, label: "Le feu se propage dans les hautes herbes" }); }
        });
      });
      live().filter(function (x) { return x.side === active; }).forEach(function (u) {
        const k = hexKind(u.t);
        if (k !== "fire" && k !== "despoiled") return;
        const dmg = Math.round(u.max0 * (k === "fire" ? 20 : 6 + 3 * stepRng()) / 100);
        curAtk++; hurt(u, dmg, null);
        out.push({ env: true, tgt: u, dmg: dmg, label: k === "fire" ? "Hexagone en feu" : "Terrain souillé" });
      });
      return out;
    };
    let settling = false, rollKey = 0, rollSalt = 0, previewForce = null;  // previewForce: {dv, crit, block} the damage preview asks the dice to give (the worst or the best case)
    const salts = {};  // going back to a step bumps its salt: the same action played again gets other dice (damage variation, critical hits, blocks)
    const diceSeed = function () { const idx = settling ? rollKey : cur; return ((idx + 1) * 2654435761) ^ ((settling ? rollSalt : (salts[idx] || 0)) * 1597334677); };  // the dice of the hits (damage variation, critical hits, blocks) are seeded by the step being replayed, or by the step about to be taken
    const settle = function (k) {  // everybody on the hexes, with the health, they have after k steps, and whose turn it is
      settling = true;
      field.forEach(function (u) { u.endDone = false; u.max = u.max0; u.fx = {}; u.twisted = false; u.twistDmg = 0; u.t = u.t0 ? u.t0.slice() : null; u.hp = u.max; u.alive = !u.summon; u.nAtk = 0; u.kills = 0; u.attacked = 0; u.lastAtk = -1; u.annBy = null; u.shun = null; u.used = {}; u.marked = false; u.markedBy = -1; u.markFresh = false; u.came = false; u.exploded = false; u.grim = 0; u.euph = null; u.neuro = 0; u.cloak = 0; u.hypTurn = -1; u.lcTurn = -1; u.miTurn = -1; u.atkTurns = 0; u.lastAtkTurn = -1; u.shield = null; u.waaaghLvl = 0; u.relocated = false; u.aug = null; u.dutyDmg = 0; u.armCut = 0; u.charKills = 0; u.smasha = false; u.auto = false; u.rage = false; u.chargedTurn = -1; u.psyTurn = -1; u.ghost = null; u.pi = {}; u.kidIdx = 0; u.born = -1; u.outr = {}; u.yexec = false; u.stillPrev = false; u.tfUsed = false; u.stance = 0; u.stTurn = -1; u.grimTurn = -1; u.ripAtk = -1; u.ow = false; u.owCut = 0; u.owForce = false; u.ds = !!u.tset.TeleportStrike && !u.summon; u.noRanged = false; u.lastSpent = 0; u.nano = false; u.moveBonus = 0; u.shroud = 0; u.ambush = !!u.tset.Ambush && !u.decoy; u.fallen = false; });
      round = 1; active = 0; pending = []; hexfx = {}; zmarks = []; turnNo = 0; meleeDead = 0; activeUses = [0, 0]; psyCount = [0, 0]; regenLog = []; boomLog = []; deadLog = []; overLog = [];
      units.forEach(function (u) { u.lastPer = 0; u.narthAt = -1; if (u.mow) { u.fx = {}; u.used = {}; u.acted = false; u.deployed = false; u.nAtk = 0; u.usedActive = false; } });
      turnStart();
      for (let i = 0; i < k; i++) {
        const m = steps[i];
        curAtk++; rollKey = i; rollSalt = m.salt || 0; stepRng = mulberry(((i + 1) * 2654435761) ^ 0x51ed270b); regenLog = []; boomLog = []; deadLog = []; overLog = [];
        if (m.k === "mv") {
          m.u.t = m.to.slice(); m.u.spent += m.cost; m.u.moves++; m.u.ds = false; if (abOf(m.u, "GrimEfficiency") && m.cost >= (parseInt(abOf(m.u, "GrimEfficiency").movement, 10) || 3)) m.u.grim = 1 - (m.u.grim || 0); if (abOf(m.u, "HaywireMine")) m.u.mineHex = m.from.slice(); if (abOf(m.u, "TimeFlux") && !m.u.tfUsed) m.u.ghost = m.from.slice(); if (m.tp && !m.tpm) m.u.noRanged = true;  // Deep Strike: it teleported, no ranged attack until the end of its turn  // (Deep Strike ends as soon as the unit has moved, not only at the end of the turn)
          decoys().forEach(function (x) {  // an enemy stepping on a decoy destroys it (and Decoys and Misdirection blasts it)
            if (x.side !== m.u.side && x.t[0] === m.to[0] && x.t[1] === m.to[1]) {
              const pr = live().filter(function (p) { return p.side === x.side && abOf(p, "DecoysAndMisdirection"); })[0];
              x.alive = false;
              if (pr && m.u.alive) { const dv = abOf(pr, "DecoysAndMisdirection"), r = abilityHit(pr, m.u, avgOf(dv, ""), "Blast", nI(dv.nrOfHits, 1)); boomLog.push({ tgt: m.u, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), from: pr, label: "Leurres et détours" }); curAtk++; hurt(m.u, Math.round(r.tot), pr, Math.round(r.per)); }
            }
          });
          if (m.u.alive) {
            const onDecoy = decoys().some(function (x) { return x.side === m.u.side && x.t[0] === m.to[0] && x.t[1] === m.to[1]; }), pr2 = live().filter(function (p) { return p.side === m.u.side && abOf(p, "DecoysAndMisdirection"); })[0];
            if (onDecoy && abOf(m.u, "CosmicHorror")) heal(m.u, abOf(m.u, "CosmicHorror").hp || 0, "Horreur cosmique");  // the Patriarch heals on a decoy
            if (onDecoy && pr2) { m.u.fx.decoyb = { id: "decoyb", until: m.u.side === 0 ? round : round + 1, extra: abOf(pr2, "DecoysAndMisdirection").extraDmg || 0 }; if (m.u.rules.fa === "Genestealers") { const hs = prio(m.u, freeAround(m.u), m.u.t).filter(function (h) { return !decoys().some(function (x) { return sameHex(x.t, h); }); }); if (hs.length) putDecoy(pr2, hs[0]); } }
          }
          if (m.u.summon && m.u.alive) field.forEach(function (x) { if (x.alive && x.side !== m.u.side && m.u.alive && abOf(x, "SavageKiller") && RULES.dist(x.t, m.to) === 1 && RULES.dist(x.t, m.from) > 1) fireBack(x, m.u, abOf(x, "SavageKiller"), "Power", "Tueur sauvage"); });  // a summon moves toward Ulf
          if (m.tp && m.u.alive && abOf(m.u, "WrathfulDevotion")) wrathShield(m.u, abOf(m.u, "WrathfulDevotion"));  // Wrask comes back from Deep Strike
          m.trig = checkMarks(m.u).concat(owReact(m.u));  // a mine under its feet, a unit that watches
          field.forEach(function (x) { const sh = x.alive && x.side !== m.u.side && m.u.alive ? fxOn(x, "shackle") : null; if (sh && RULES.dist(x.t, m.from) === 1) fireBack(x, m.u, sh.v, "Bolter", "Entrave du moment"); });  // Trajann's Moment Shackle: an enemy leaving a hex next to him is hit
          field.forEach(function (x) { if (x.alive && x.side !== m.u.side && m.u.alive && abOf(x, "HatefulAssault") && RULES.dist(x.t, m.from) === 1) fireBack(x, m.u, abOf(x, "HatefulAssault"), "Power", "Assaut haineux"); });  // it left a hex next to a Terminator
          afterMove(m.u);  // Sanguinary Priest, Fabricator Claw Array
        } else if (m.k === "atk") {
          if (m.tgt && m.tgt.side !== m.u.side && charges(m.u, m.tgt, (m.moves || []).some(function (x) { return x.u === m.u; }))) m.u.chargedTurn = turnNo;
          if (m.abId && !m.u.mow && !m.u.summon) activeUses[m.u.side]++;
          if (m.lcUsed) m.u.lcTurn = turnNo;
          if (m.abId && !m.u.mow && m.u.alive) field.forEach(function (x) { if (x.alive && x.side !== m.u.side && abOf(x, "SavageKiller") && RULES.dist(x.t, m.u.t) === 1 && m.u.alive) fireBack(x, m.u, abOf(x, "SavageKiller"), "Power", "Tueur sauvage"); });  // Ulf strikes an enemy that uses an active ability next to him, before it goes off
          if (m.abId && abOf(m.u, "GrimEfficiency")) m.u.grim = 1 - (m.u.grim || 0);  // each active ability use changes Uthar's posture
          if (m.abId === "MartialInspiration") m.u.miTurn = turnNo;
          if (!m.u.mow && m.u.lastAtkTurn !== turnNo) { m.u.lastAtkTurn = turnNo; m.u.atkTurns = (m.u.atkTurns || 0) + 1; }  // the turns in which he attacked
          if (m.stance) { m.u.stance = 1 - (m.u.stance || 0); m.u.stTurn = turnNo; } else if (!m.keep) m.u.acted = true;  // some abilities do not end the turn
          m.u.ds = false; m.u.nAtk++; if (m.abId) { m.u.usedActive = true; m.u.used[m.abId] = round; }
          if (MOVE_AGAIN[m.abId]) { m.u.moveAfter = true; if (m.u.moves >= 1) { m.u.moveExtra++; m.u.spent = 0; } }  // these abilities let the unit move again, even after a move this turn
          (m.moves || []).forEach(function (x) { x.u.t = x.to.slice(); if (x.u !== m.u || true) x.u.relocated = true; });  // the moves of the action (a pull, a dash, a swap)
          (m.fx || []).forEach(function (x) { x.u.fx[x.id] = x; if (x.id === "hide") x.u.ds = true; if (x.id === "web") field.forEach(function (y) { if (y !== x.u && y.fx.web && y.fx.web.by === x.by) delete y.fx.web; }); if (x.id === "sentinel") x.u.owForce = true; if (x.id === "armcut") x.u.armCut = (x.u.armCut || 0) + (x.amt || 0); });  // the states it puts on units
          (m.gone || []).forEach(function (g) { g.alive = false; });  // a drone sent away to make room (Sho'syl keeps 3)
          guardLog = [];
          if (!(m.dmg > 0) && m.tgt && m.tgt !== m.u && m.tgt.side !== m.u.side && m.tgt.alive && m.tgt.pool && !m.stance) {  // being attacked is enough: the guard appears even if the attack does no damage
            const gp0 = guardOf(m.tgt);
            if (gp0 && gp0.hex) { const g0 = gp0.g; g0.t = gp0.hex.slice(); g0.alive = true; g0.came = true; g0.hp = g0.max; g0.acted = false; g0.spent = 0; guardLog.push({ from: m.tgt, g: g0, fresh: true, hit: false }); }
          }
          if (m.dmg > 0) hurtHits(m.tgt, m.dmg, m.u, m.per, m.prof, m.hits);
          if (m.bl > 0 && m.tgt && m.tgt.alive) {  // a block: Deathwing's damage bonus for a round; Anvil Shield covers the attacker's hex with ice and stuns it after a melee block
            const dwB = abOf(m.tgt, "Deathwing") || abOf(m.tgt, "DeathwingKnight"), anB = abOf(m.tgt, "AnvilShield");
            if (dwB) m.tgt.fx.dwbuff = { id: "dwbuff", until: m.tgt.side === 0 ? round + 1 : round + 1, extra: (dwB.extraDmg || 0) * (m.u.rules.al === "Chaos" || live().some(function (x) { return x !== m.tgt && x.side === m.tgt.side && x.rules.fa === "DarkAngels" && RULES.dist(x.t, m.tgt.t) === 1; }) ? 2 : 1) };
            if (anB && m.u.alive) { hexfx[m.u.t[0] + "," + m.u.t[1]] = hexCover(m.u.t, "ice"); if (RULES.dist(m.u.t, m.tgt.t) === 1) m.u.fx.stun = { id: "stun", until: stunUntil(m.u) }; }
          }
          if (!m.abId && !m.u.mow && abOf(m.u, "RefusalToBeOutdone")) m.u.outr = {};  // Laviscus: his Outrage resets after his normal attack
          if (m.drT) m.drT.drTurn = turnNo;
          if (!m.abId && !m.u.mow && m.tgt && !m.tgt.alive && m.tgt.side !== m.u.side && abOf(m.u, "EmpyricAmbush") && m.u.t && RULES.dist(m.u.t, m.tgt.t) === 1) delete m.u.used.EmpyricAmbush;  // Lhykhis killed in melee with a normal attack: Empyric Ambush is available again
          (m.more || []).forEach(function (x) { hurt(x.tgt, x.dmg, x.by || m.u, x.per, x.prof); });  // the other hits of the action (splash, a second attack)
          m.guards = guardLog;  // who took a hit in the place of its owner (for the log)
          field.forEach(function (x) { if (x !== m.u && x.alive && abOf(x, "WaaaghEnergy") && RULES.dist(x.t, m.u.t) <= 2) x.waaaghLvl = (x.waaaghLvl || 0) + 1; });  // Zapspitta feeds on the attacks around him
          if (abOf(m.u, "WaaaghEnergy")) m.u.waaaghLvl = Math.floor((m.u.waaaghLvl || 0) * (1 - (parseInt(abOf(m.u, "WaaaghEnergy").effectLevelPct, 10) || 50) / 100));  // and loses half of it when he attacks
          if (m.prof === "Psychic" && !m.u.mow) psyCount[m.u.side]++;
          if (m.prof === "Psychic" && abOf(m.u, "Neuroparasite")) [m.tgt].concat((m.more || []).map(function (x) { return x.tgt; })).forEach(function (x) { if (x.side !== m.u.side) x.neuro = Math.min((abOf(m.u, "Neuroparasite").buffMaxLevel) || 15, (x.neuro || 0) + 1); });  // Neuroparasite
          if (m.prof === "Psychic") [m.tgt].concat((m.more || []).map(function (x) { return x.tgt; })).forEach(function (x) { x.psyTurn = turnNo; });  // took psychic damage this turn
          if (m.abId === "BlackRage" && !m.u.rage) { const br = abOf(m.u, "BlackRage") || {}; m.u.rage = true; m.u.auto = true; if (m.u.moves === 0) m.u.hp = Math.min(m.u.max, Math.round(m.u.max * (br.hpPct || 50) / 100)); }  // Lucien: his health drops to 50 %, he moves faster and hits harder when charging, and from now on he plays by himself (like a summon)
          (m.mk || []).forEach(function (x) { zmarks.push(Object.assign({}, x, { by: m.u, hexes: x.hexes.map(function (h) { return h.slice(); }) })); });  // the zones it marks
          (m.buff || []).forEach(function (x) {
            if (!x.u.alive) return;
            x.u.max += x.hp; x.u.hp += x.hp;
            if (x.aug) x.u.aug = x.aug;  // Prime Test Subject: augmented
            else if (x.dutyDmg !== undefined) x.u.dutyDmg = (x.u.dutyDmg || 0) + x.dutyDmg;  // Unbreakable Duty
            else { x.u.nano = true; x.u.nanoBonus = x.rep || 0; x.u.nanoHp = x.hp || 0; }
          });  // Nanoscarab protocols: health and maximum health
          if (m.deploy) m.u.deployed = true;
          (m.hx || []).forEach(function (x) { hexfx[x.h[0] + "," + x.h[1]] = x; });  // the hexes it covers with fire, ice ...
          (m.heals || []).forEach(function (h) { if (h.u.alive && !fxOn(h.u, "noheal")) { h.u.hp = Math.min(h.u.max, h.u.hp + h.amt + (h.u.nano ? h.u.nanoBonus || 0 : 0)); delete h.u.fx.stun; delete h.u.fx.pin; delete h.u.fx.brazier; h.u.marked = false; h.u.markedBy = -1; } });  // a heal ends a stun, a pin, a markerlight
          const tw = (m.u.rules.ab || []).filter(function (a) { return a[0] === "TwistedScience"; })[0];
          if (tw && m.heals) m.heals.forEach(function (h) {  // Twisted Science: a unit Hollan heals gets 3 916 health and maximum health for good, and the cult units hit harder
            const x = h.u, v = (tw[8] && tw[8][rar]) || {};
            if (x !== m.u && x.alive && !x.twisted) { x.twisted = true; x.twistDmg = v.extraDmg || 0; x.max += v.hp || 0; x.hp += v.hp || 0; }
          });
          if (m.label === "Attaque" && m.dmg > 0 && (m.u.rules.ab || []).some(function (a) { return a[0] === "MasterAnnihilator"; })) { field.forEach(function (x) { if (x.annBy === m.u) x.annBy = null; }); m.tgt.annBy = m.u; }  // Master Annihilator: its target is marked until it attacks another or falls
          if (m.mark && m.tgt.alive) { m.tgt.marked = true; m.tgt.markedBy = m.u.side; m.tgt.markFresh = true; }  // the markerlight of a drone attack lasts through the owner's next turn
          if (m.pend) { pending.push(m.pend); if (!m.pend.noMark) { m.tgt.marked = true; m.tgt.markedBy = m.u.side; } }  // the missile is on its way, the target is marked
          if (m.tgt !== m.u && (m.u.rules.ab || []).some(function (a) { return a[0] === "StructuralAnalyser"; }) && RULES.dist(m.u.t, m.tgt.t) > 1) { m.tgt.marked = true; m.tgt.markedBy = m.u.side; }  // Darkstrider's ranged hits mark
          (m.revive || []).forEach(function (r) { r.u.alive = true; r.u.t = r.hex.slice(); r.u.hp = Math.min(r.u.max, Math.round(r.u.max * r.pct / 100)); r.u.acted = true; r.u.spent = 99; r.u.fx = {}; });  // the fallen that come back (they cannot act this turn)
          (m.reuse || []).forEach(function (r) { r.u.used = {}; r.u.usedActive = false; });  // Inspired to Greatness: the ally can use its active ability again
          (m.setHp || []).forEach(function (r) { if (r.u.alive) r.u.hp = Math.min(r.u.max, Math.round(r.u.max * r.pct / 100)); });  // Blood Chalice
          const place = function (a) { a.arrRound = round; a.t = a.t0.slice(); a.hp = a.hpPct ? Math.round(a.max * a.hpPct / 100) : a.max; a.alive = true; a.acted = false; a.spent = a.noMove ? 99 : 0; if (a.replaces) a.replaces.alive = false; };
          (m.adds || []).forEach(function (a) { if (!a.seq) place(a); });  // what the action summoned (decoys, neophytes ...); the sequential ones come one by one below
          (m.adds || []).forEach(function (a) { if (a.alive && a.summon && !a.decoy) field.forEach(function (x) { if (x.alive && x.side !== a.side && a.alive && abOf(x, "SavageKiller") && RULES.dist(x.t, a.t) === 1) fireBack(x, a, abOf(x, "SavageKiller"), "Power", "Tueur sauvage"); }); });  // Ulf hits an enemy summon that appears next to him
          const now = (m.also || []).filter(function (a) { return a.alive && a !== m.u; }).map(function (a) { a.acted = false; a.spent = 0; return a; }).concat((m.adds || []).filter(function (a) { return a.immediate && !a.decoy; }));
          m.autoNow = now.map(function (a) { if (a.seq) { if (!m.force || !m.force.alive) return null; place(a); } return playSummon(a, m.force); }).filter(Boolean);
          m.autoNow.forEach(function (r) { if (r.u.grotTaunt && r.tgt && r.tgt.alive) r.tgt.fx.taunt = { id: "taunt", taunt: r.u, until: stunUntil(r.tgt), v: {} }; });  // the enemies a Grot hit are taunted for a round
          m.react = (m.moves || []).some(function (x) { return x.u === m.u; }) && m.u.alive && m.abId !== "TheQuickening" ? owReact(m.u) : [];  // (L'Accélération sets off no Sentinelle)  // a charge or a dash ends next to someone who watches  // they take their turn at once (the summoned ones, and the others the ability orders to play)
          if ((m.moves || []).some(function (x) { return x.u === m.u; }) && m.u.alive && !m.noAfter) afterMove(m.u);  // it moved by its ability (a charge, a dash ...): the "after the move" passives fire, once the Sentinels have shot (a unit they kill does not trigger its secondary)
        } else {  // end of turn: the other side plays
          field.forEach(function (x) { if (x.side === active) { x.ds = false; x.lastSpent = x.spent; } });
          field.forEach(function (x) {  // Sentinelle: a unit that did not attack this turn (Re'vas: when she says so; Sekhetar: next to a psyker) watches the enemy turn
            if (x.side !== active) return;
            x.smasha = x.alive && !!abOf(x, "SmashaEad") && x.spent >= 2;
            x.ow = x.alive && ((x.tset.Overwatch && !x.acted) || x.owForce || (!!abOf(x, "CalibaniteGreatsword") && !x.stance) || (!!abOf(x, "PurgeResponse") && live().some(function (y) { return y !== x && y.side === x.side && y.rules.fa === "LeaguesOfVotann" && !y.summon && RULES.dist(y.t, x.t) === 1; })) || (!!abOf(x, "PropheticSentinel") && live().some(function (y) { return y.side === x.side && y !== x && y.tset.Psyker && RULES.dist(y.t, x.t) === 1; })));
          });
          endUnit(null);  // the effects that come at the end of a character's turn (the ones that are not already over: a character that cannot act any more has had its own earlier)
          turnNo++;  // a unit in Deep Strike mode can be hit again once its side's turn is over
          if (active === 0) active = 1; else { active = 0; round++; }
          turnStart();
          startRegen();  // Tough to Kill, Time Flux
          m.auto = tileTurn().concat(resolveMarks(), resolvePending(), summonsPlay(), betray());  // what acts by itself at the start of this turn: the summons first, then the characters that do
        }
        if (m.k !== "end") field.forEach(function (x) {  // a character that can do nothing more this turn (it is greyed) ends its turn now: Xybia, Nicodemus, Mephiston standing still ...
          if (x.side === active && x.alive && !x.decoy && !x.summon && !x.auto && !x.mow && !x.endDone && isDone(x)) endUnit(x);
        });
        field.forEach(function (x) { if (x.ghost && live().some(function (y) { return y !== x && y.t[0] === x.ghost[0] && y.t[1] === x.ghost[1]; })) x.ghost = null; });  // Toth's time ghost vanishes when another unit stands on it
        m.deaths = deadLog.filter(function (x, k, a) { return a.indexOf(x) === k; }); m.regen = regenLog; m.booms = boomLog; m.over = overLog;  // the heals, the revivals and the mine blasts this step caused
      }
      settling = false;
    };
    const diceText = function (m) {  // the dice of an attack: the damage variation of a normal attack, the critical hits, the blocks
      const bits = [];
      if (m.dv !== null && m.dv !== undefined) bits.push("DAMVAR " + (m.dv > 0 ? "+" : "") + m.dv + " %");
      if (m.cr) bits.push(m.cr + " critique" + (m.cr > 1 ? "s" : ""));
      if (m.bl) bits.push(m.bl + " blocage" + (m.bl > 1 ? "s" : ""));
      return bits.length ? ' <span class="sb-dice">[' + bits.join(" · ") + "]</span>" : "";
    };
    const turnText = function (r, side) { return "Round " + r + " · " + (side === 0 ? "votre tour" : "tour de l'adversaire"); };
    const num = function (n) { return Math.round(n).toLocaleString("fr-FR"); };
    // the game's own icons, like the replay's tooltip: stars (1-5 gold, 6-10 red, 11-13 blue, 14 the winged skull) and ranks
    const starsHtml = function (n) {
      const ui = assets + "ui/";
      if (n >= 14) return '<img class="st-img st-wings" src="' + ui + 'star_mythic.png" alt="">';
      const ic = n <= 5 ? "star_gold" : n <= 10 ? "star_red" : "star_blue", k = n <= 5 ? n : n <= 10 ? n - 5 : n - 10;
      return new Array(k + 1).join('<img class="st-img' + (n > 10 ? " st-blue" : "") + '" src="' + ui + ic + '.png" alt="">');
    };
    const RT = ["Stone", "Iron", "Bronze", "Silver", "Gold", "Diamond", "Adamantine"], RM = ["I", "II", "III"];
    const row = function (k, v) { return "<dt>" + k + "</dt><dd>" + v + "</dd>"; };
    const relicName = function (r) { return r[1].indexOf("R_") === 0 ? r[1].split("_").pop().replace(/([a-z])([A-Z])/g, "$1 $2") : r[1]; };  // a relic the game's names list does not have yet: its id, cleaned
    const PIERCE = UNITS._pierce || {};

    // ---- the hits: what an attack of the chosen character does to each target (the averages: no spread, no crit, no block) ----
    // per hit: the damage (an attack: the character's damage, with the bonuses of its traits and the +50 % of higher ground; an ability: its average figure, which ignores the attacker's bonuses) less the
    // armour but at least the pierce ratio of the damage (the game spreads it at random by -20 / +20 %: the average is kept), then the target's own modifiers (razor wire, trench, traits); the hits are those of the weapon / ability, less what tall
    // grass, Camouflage, Diminutive and Parry take off (at least 1). The numbers come from the game's configuration (data/unit_rules.json, _tv).
    const TV = UNITS._tv || {};
    // the game's own rule (UI/WeaponProfile_Damage): a hit deals its damage minus the target's armour, but always at least the pierce ratio of that damage
    const armorDamage = function (raw, profile, arm, add) { return Math.max(raw - arm, raw * ((PIERCE[profile] || 1) + (add || 0)) / 100, 1); };
    const cellAt2 = function (u) { return RULES.cell(u.t[0], u.t[1]) || {}; };
    const deadAllies = function (u) { return field.filter(function (x) { return x.side === u.side && !x.alive && x.hp <= 0 && !x.decoy; }).length; };
    const legendaryFlat = function (u, t) {  // Legendary Commander (Trajann): the enemies next to an ally that used an active ability this turn take more
      const tj = live().filter(function (x) { return x.side === u.side && abOf(x, "LegendaryCommander"); })[0];
      return tj && live().some(function (x) { return x.side === u.side && x.usedActive && RULES.dist(x.t, t.t) === 1; }) ? abOf(tj, "LegendaryCommander").extraDmg || 0 : 0;
    };
    const legendaryHits = function (u, t, assume) {  // assume: the unit has just used an active ability (the step being planned)
      const tj = live().filter(function (x) { return x.side === u.side && abOf(x, "LegendaryCommander") && RULES.dist(x.t, t.t) === 1; })[0];
      if (!tj || u.lcTurn === turnNo) return 0;
      const used = live().some(function (x) { return x.side === u.side && x.usedActive && RULES.dist(x.t, t.t) === 1; }) || (assume && RULES.dist(u.t, t.t) === 1);
      return used ? parseInt(abOf(tj, "LegendaryCommander").nrOfHits, 10) || 2 : 0;
    };
    const charges = function (u, t, moved) { return !!t && (u.moves >= 1 || !!moved) && !(u.startAdj && u.startAdj.indexOf(t) >= 0); };  // it charges: it attacks an enemy it was not in melee with at the start of the turn, after moving (whatever the attack)
    const nextTo = function (u) { return live().some(function (o) { return o.side !== u.side && footOf(o).some(function (h) { return RULES.dist(u.t, h) === 1; }); }); };
    // ---- the auras: passives that help the allies around (or hurt the enemies around) their holder; the radius is the one the ability's text gives ("adjacent", "distantes de 2 hexagones", the growing
    // aura of Contagion of Nurgle ...). r: the radius, who: which allies they help, self: the holder too. The numbers are those of the ability at this rarity. ----
    const contagionRange = function () { return 1 + Math.min(2, Math.floor((round - 1) / 2)); };  // rounds 1-2: 1, 3-4: 2, 5 and more: 3
    const AURAS = {
      SpotterReworked: { r: 2 }, FirstAmongTraitors: { r: 2, who: function (u) { return u.rules.al === "Chaos"; } }, LordOfTheHost: { r: 2, who: function (u) { return u.tset.RapidAssault || u.tset.Flying; } },
      StandVigil: { r: 1 }, PathOfCommand: { r: 2 }, KustomForceFieldReworked: { r: 1 }, PropheticSentinel: { r: 1, who: function (u) { return u.rules.al === "Chaos"; } }, RitesOfBattle: { r: 1 },
      DefenderOfTheGreaterGood: { r: function (u) { return u.rules.fa === "Tau" ? 2 : 1; } }, DestroyTheWitch: { r: 1, self: true }, RelentlessMarch: { r: 1 },
      CursedPlagueBell: { r: function () { return contagionRange(); }, who: function (u) { return u.rules.al === "Chaos"; } }, PsychicFortress: { r: 1 }, DaughterOfTheAbyss: { r: 2, self: true },
      Nightshroud: { r: 1 }, AstartesBanner: { r: 2 }, InfernalPacts: { r: 1, who: function (u) { return u.rules.al === "Chaos"; } }, ExplosiveMaladies: { r: 1 },
      StructuralAnalyser: { r: function (u) { return u.rules.fa === "Tau" ? 2 : 1; } }, WayOfTheShortBlade: { r: 2 }, BeaconOfRage: { r: 1, who: function (u) { return u.rules.al === "Chaos"; } },
      MasterfulTactician: { r: 99, who: function (u) { return live().some(function (x) { return x.side === u.side && x !== u && x.rules.fa === "DarkAngels" && RULES.dist(u.t, x.t) === 1; }); } },
    };
    function aurasOn(u, c) {  // the auras of its allies that reach a unit standing on hex c
      const out = [];
      live().forEach(function (e) {
        if (e.side !== u.side) return;
        (e.rules.ab || []).forEach(function (a) {
          const def = AURAS[a[0]];
          if (!def || (e === u && !def.self) || (def.who && !def.who(u, e))) return;
          const r = typeof def.r === "function" ? def.r(u, e) : def.r;
          if (e !== u && RULES.dist(c, e.t) > r) return;
          out.push({ id: a[0], e: e, v: (a[8] && a[8][rar]) || {} });
        });
      });
      return out;
    }
    function auraAtk(u, t, ab, ranged, profile) {  // what the allies' abilities add to the damage of a hit: a flat figure, a percentage, one more hit
      let flat = 0, pct = 0, hit = 0, ign = 0;
      aurasOn(u, u.t).forEach(function (a) {
        const v = a.v;
        if (ab) { if (a.id === "StandVigil") pct += v.extraDmgPct || 0; return; }  // an ability ignores the attacker's bonuses, except the ones a text says
        if (a.id === "SpotterReworked") { if (ranged) flat += u.tset.HeavyWeapon ? v.extraDmg_2 : v.extraDmg; }
        else if (a.id === "FirstAmongTraitors") flat += Math.min(v.maxDmg || 1e9, (v.extraDmg || 0) + (v.extraDmg_2 || 0) * a.e.nAtk);
        else if (a.id === "LordOfTheHost") { if (!ranged) flat += v.extraDmg; }
        else if (a.id === "PathOfCommand") flat += (v.extraDmg || 0) + (u.rules.fa === "Aeldari" ? v.extraDmg_2 || 0 : 0);
        else if (a.id === "RitesOfBattle") flat += u.rules.al === "Imperial" ? v.extraDmg_2 : v.extraDmg;
        else if (a.id === "DefenderOfTheGreaterGood") { if (ranged && profile !== "Psychic") flat += v.extraDmg; }
        else if (a.id === "DestroyTheWitch") { if (!ranged && t.tset.Psyker) flat += v.extraDmg; }
        else if (a.id === "MasterfulTactician") flat += v.extraDmg;
        else if (a.id === "AstartesBanner") { if (!ranged) hit += 1; }
        else if (a.id === "StructuralAnalyser") { if (ranged && t.marked) flat += v.extraDmg; }
        else if (a.id === "WayOfTheShortBlade") {  // a ranged normal attack on an enemy next to one of its other allies: armour ignored, +30 % (not psychic)
          if (ranged && profile !== "Psychic" && live().some(function (x) { return x.side === u.side && x !== u && RULES.dist(x.t, t.t) === 1; })) { ign += v.armorIgnored || 0; pct += v.extraDmgPct || 0; }
        }
        else if (a.id === "BeaconOfRage") { if (!ranged && a.e.kills > 0) flat += 0.5 * (v.extraDmg || 0) * Math.min(parseInt(v.nrOfAttacks, 10) || 8, a.e.attacked); }  // half of Azkor's bonus for the Chaos allies next to him, once he has killed
      });
      if (!ab) {  // its own passives: Azkor's lanterns, Aun'Shi's buff, the mark of Vitruvius
        (u.rules.ab || []).forEach(function (a) {
          if (a[0] === "LordOfTempests") flat += ((a[8] && a[8][rar] && a[8][rar].extraDmg) || 0) * iceAround(u);  // Njal: +464 per ice hex around him
          if (a[0] === "BeaconOfRage") flat += ((a[8] && a[8][rar] && a[8][rar].extraDmg) || 0) * Math.min(parseInt(a[8][rar].nrOfAttacks, 10) || 8, u.attacked);
        });
        if (u.shun && u.shun.kind === 3) flat += u.shun.v.extraDmg || 0;  // Serene Unifier, third round of its cycle: +1044 damage
      }
      if (!ab) live().forEach(function (e) {  // the marks an ally leaves on the enemies around it
        if (e.side !== u.side) return;
        (e.rules.ab || []).forEach(function (a) {
          const v = (a[8] && a[8][rar]) || {};
          if (a[0] === "Doom" && e !== u && RULES.dist(e.t, t.t) <= 2) flat += u.rules.fa === "Aeldari" ? v.extraDmg_2 : v.extraDmg;
          else if (a[0] === "ObsessiveAnnunciation" && ranged && RULES.dist(e.t, t.t) === 1) flat += v.extraDmg;
          else if (a[0] === "LegendaryCommander" && live().some(function (x) { return x.side === u.side && x.usedActive && RULES.dist(x.t, t.t) === 1; })) flat += v.extraDmg;
        });
      });
      return { flat: flat || 0, pct: pct, hit: hit, ign: ign };
    }
    function armorOf(t) {  // its armour with the auras of its allies, then Contagion of Nurgle (-20 % in one enemy aura, -40 % in two)
      let arm = Math.max(0, t.arm - (t.armCut || 0));
      aurasOn(t, t.t).forEach(function (a) {
        if (a.id === "KustomForceFieldReworked") arm += t.rules.fa === "Orks" ? a.v.extraArmor_2 : a.v.extraArmor;
        else if (a.id === "PropheticSentinel" || a.id === "StandVigil") arm += a.v.extraArmor || 0;
      });
      { const gu2 = live().filter(function (x) { return x.side === t.side && abOf(x, "GrimEfficiency") && !x.grim && (x === t || RULES.dist(x.t, t.t) <= (parseInt(abOf(x, "GrimEfficiency").range, 10) || 2)); })[0]; if (gu2) arm += abOf(gu2, "GrimEfficiency").extraArmor || 0; }  // Uthar's consolidated recovery posture
      if (t.tset.Mechanical) { const tg = live().filter(function (x) { return x.side === t.side && abOf(x, "DoctrinaImperatives") && !x.stance && (x === t || RULES.dist(x.t, t.t) === 1); })[0]; if (tg) arm += abOf(tg, "DoctrinaImperatives").extraArmor || 0; }  // Protective Imperative
      if (hexKind(t.t) === "contam" && !t.tset.Mechanical && !t.tset.ContagionsOfNurgle) arm *= 1 - (TV.contaminatedArmorReductionPct || 30) / 100;  // contaminated hex: -30 % armour (mechanical units and Nurgle's are spared)
      const n = t.tset.ContagionsOfNurgle ? 0 : live().filter(function (e) { return e.side !== t.side && e.tset.ContagionsOfNurgle && RULES.dist(e.t, t.t) <= contagionRange(); }).length;
      if (n) arm *= 1 + (n >= 2 ? TV.contagionsOfNurgleArmorTwoOrMoreAuras : TV.contagionsOfNurgleArmorOneAura) / 100;
      if (abOf(t, "ReinforcedHiveNode") && (round - (t.arrRound || 1)) % 2 === 0) arm *= 2;  // Tyranid Warrior: +100 % armour every other round from its arrival
      return Math.max(0, arm);
    }
    function auraCut(t, profile) {  // what the auras of its allies take off a hit it takes: a flat figure, a percentage
      let flat = 0, mult = 1;
      aurasOn(t, t.t).forEach(function (a) {
        if (profile === "Psychic" && a.id === "PsychicFortress") flat += a.v.dmgReduction || 0;
        else if (profile === "Psychic" && a.id === "DaughterOfTheAbyss") { if (a.e === t) flat += a.v.dmgReduction || 0; else mult *= 1 - (a.v.dmgReductionPct || 0) / 100; }
      });
      return { flat: flat, mult: mult };
    }
    // how far a unit walks in a turn: its movement, Rapid Assault until it attacks, what the auras gave it at the start of the turn
    const mvOf = function (u) { if (fxOn(u, "stun")) return 1;  // stunned: 1 movement
      const wg = fxOn(u, "waaagh"), mu = fxOn(u, "mvup"), rg = (u.rage ? 1 : 0) + (u.aug ? u.aug.mv || 0 : 0), pn = fxOn(u, "pin") ? 1 : 0;  // pinned: 1 movement less
      return Math.max(0, (u.rules.mv || 0) + (u.rules.ra ? 1 : 0) + (u.moveBonus || 0) + (wg ? parseInt(wg.v && wg.v.extraMovement, 10) || 1 : 0) + (mu ? mu.mv || 0 : 0) + rg - pn); };
    // spec: {ab: the ability} or {w: the weapon [reach, damage profile, hits]}; dd: the distance
    function damageOf(u, t, spec, dd) {
      const ab = spec.ab, cu = cellAt2(u), ct = cellAt2(t), tr = u.tset, tt = t.tset;
      const profile = ab && ab[0] === "TalonsOfTheEmperor" && (tt.Psyker || live().some(function (x) { return x !== u && x.side === u.side && x.rules.fa === "Custodes" && RULES.dist(x.t, u.t) === 1; })) ? "DirectDamage" : ab ? (ab[5] || (u.rules.wp && u.rules.wp.length ? u.rules.wp[u.rules.wp.length - 1][1] : "Physical")) : spec.w[1];
      const ranged = ab ? ab[4] !== "Melee" : spec.w[0] > 1, indirect = !!u.rules.id;
      const F = spec.force || previewForce;
      let hits = ab ? (ab[6] || 1) : spec.w[2], raw = ab ? ab[3][rar] : u.atk, ign = 0, xp = 0, pm = 1, rawPre = null, dvPct = null;  // pm: the multipliers that come after the armour (the traits' percentages, the higher ground ...); rawPre: the damage before its variation
      const dice = mulberry(diceSeed() ^ (u.i * 40503) ^ (t.i * 9973) ^ 0x2f9b1c);  // the same dice for the same attacker and target at the same moment: what the target list shows is what the attack does
      if (ab && F) { const av = ab[8] && ab[8][rar]; if (av && av.minDmg && av.maxDmg) raw *= 2 * (F.dv < 0 ? av.minDmg : av.maxDmg) / (av.minDmg + av.maxDmg); }  // an ability's figure is its middle: the preview asks for the lowest or the highest
      if (ab && ab[0] === "MartialInspiration") raw *= 1 + ((ab[8][rar] || {}).extraDmgPct || 33) * ((u.atkTurns || 0) + (u.lastAtkTurn === turnNo ? 0 : 1)) / 100;  // Kariyan: more damage for each turn in which he attacked
      if (ab && ab[0] === "TacticalPrecision" && !charges(u, t)) { const tv = ab[8][rar] || {}; raw = avgOf(tv, "_2") || raw; hits = parseInt(tv.nrOfHits_2, 10) || hits; }  // Titus: the second set of figures when he did not charge
      if (ab && ab[0] === "HellfireShells" && tt.BigTarget) hits += parseInt(ab[8][rar].extraHit, 10) || 0;  // Heavy Intercessor: more hits on a big target
      if (ab && ab[0] === "BrazierOfHolyFire" && tt.Daemon) hits = parseInt(ab[8][rar].nrOfHits_2, 10) || hits;  // against a Daemon: more hits
      if (fxOn(u, "stun")) raw *= 0.5;  // stunned: -50 % damage
      if (fxOn(u, "pin")) raw *= 0.7;  // pinned: -30 % damage
      if (u.tset.Psyker) { const hh = live().filter(function (e) { return e.side !== u.side && abOf(e, "HuntersBeyondDeath") && RULES.dist(e.t, u.t) === 2; })[0]; if (hh) raw = Math.max(1, raw - (abOf(hh, "HuntersBeyondDeath").dmgReduction || 0)); }  // Hunters Beyond Death
      const wk = fxOn(u, "weak");  // Light of Sanguinius: the enemies around Dante deal less (twice as much less against units at 50 % health or less)
      if (wk) raw *= 1 - Math.min(100, wk.pct * (t.hp <= t.max * (wk.half || 50) / 100 ? 2 : 1)) / 100;
      const tcp = fxOn(u, "terror"); if (tcp) raw *= 1 - (tcp.v.dmgReductionPct || 0) / 100;  // Terrorchem Poison: an affected enemy deals less
      if (profile === "Psychic" && u.tset.Psyker && u.rules.fa !== "Tyranids" && live().some(function (e) { return e.side !== u.side && e.tset.ShadowInTheWarp && RULES.dist(e.t, u.t) <= 2; })) raw *= 1 + (TV.shadowInTheWarpDmgModifier || -25) / 100;  // Shadow in the Warp
      if (ab) {  // what some abilities add to their own figure
        const av = ab[8] && ab[8][rar] || {}, deadChars = field.filter(function (x) { return x.side === u.side && !x.alive && x.hp <= 0 && !x.summon && !x.decoy; }).length;
        if (ab[0] === "TalonsOfTheEmperor") raw += (av.extraDmg || 0) * (activeUses[u.side] || 0);  // per active ability the allied characters used in the battle
        if (ab[0] === "SavageEchoes") raw += (av.extraDmg || 0) * RULES.around(u.t[0], u.t[1]).filter(function (h) { const c = RULES.cell(h[0], h[1]); return c && c.kind === 0 && !live().some(function (x) { return footOf(x).some(function (f) { return f[0] === h[0] && f[1] === h[1]; }); }); }).length;
        if (ab[0] === "Foehammer") raw += (av.extraDmg || 0) * deadChars;
        if (abOf(u, "Neuroparasite") && profile === "Psychic") raw += (abOf(u, "Neuroparasite").extraDmg || 0) * (t.neuro || 0);  // per level of the Neuroparasite on the target
        if (ab[0] === "SpiritLeech" && fxOn(t, "pin")) raw += av.extraDmg || 0;
        if (ab[0] === "GravitonRifle" && (tt.MkXGravis || tt.TerminatorArmour || tt.Mechanical)) xp += av.extraPierceRatio || 0;
        if (ab[0] === "BloodyFury" || ab[0] === "DakkaDakkaDakka") hits = 1;  // their hits are counted by the redistribution
      }
      const mindA = fxOn(u, "mind");
      if (mindA) raw = Math.max(1, raw - ((mindA.v && mindA.v.dmgReduction) || 0));  // Mind Control: it deals less
      const big = !!tt.BigTarget, inGrass = ct.tile === "DryBush" && !big, inTrench = ct.tile === "Trench" && !big;
      if (!ab) {  // the attacker's bonuses: only a normal attack gets them
        let bonus = 0;
        if (tr.HeavyWeapon && ranged && u.spent === 0) bonus += TV.heavyWeaponExtraDmg || 0;
        if (tr.CrushingStrike && !ranged && u.spent === 0) bonus += TV.crushingStrikeExtraDmgPct || 0;
        if (tr.Emplacement) bonus += !ranged ? TV.emplacementMeleeDmgModifier || 0 : u.spent === 0 ? TV.emplacementRangedDmgModifier || 0 : 0;
        if (tr.RangedSpecialist && ranged && !u.advStart) bonus += TV.rangedSpecialistDmgPct || 0;
        if (tr.PrioritisedEfficiency && u.spent < (TV.prioritisedEfficiencyMovement || 3)) bonus += TV.prioritisedEfficiencyExtraDmgPct || 0;
        if (tr.RapidAssault && u.nAtk === 0) bonus += TV.rapidAssaultExtraDmgPct || 0;
        if (tr.CloseCombatWeakness && nextTo(u)) bonus += ranged ? TV.closeCombatWeaknessRangeDmgPctReduction || 0 : TV.closeCombatWeaknessMeleeDmgPctReduction || 0;
        if (!ranged && (tr.BeastSlayer || tr.BeastSnagga) && (tt.BigTarget || tt.Vehicle)) bonus += tr.BeastSlayer ? TV.beastSlayerExtraDmgPct || 0 : TV.beastSnaggaDmgBonus || 0;
        if (u.tset.BlessingsOfKhorne) bonus += Math.min(TV.blessingsOfKhorneMaxDefeatedUnits || 8, meleeDead) * (TV.blessingsOfKhorneExtraDmgPct || 3);  // World Eaters: more damage per unit defeated in melee
        const ob = fxOn(u, "observed");
        if (ob) raw += (ob.v.extraDmg || 0) * live().filter(function (e) { return e.side !== u.side && RULES.dist(e.t, u.t) === 1 && fxOn(e, "taunt") && fxOn(e, "taunt").taunt === u; }).length;  // Hascule observed: more damage per taunted enemy next to him
        const au = auraAtk(u, t, null, ranged, profile), wg = fxOn(u, "waaagh");  // Waaagh!: +dmg and one more hit on the normal melee attacks
        if (wg && !ranged) { au.flat += (wg.v && wg.v.extraDmg) || 0; au.hit += 1; }
        if (charges(u, t)) {  // a charge: an attack on an enemy it was not in melee with at the start of the turn, after a move
          const ac = abOf(u, "AvalancheOfMuscle"), ft = abOf(u, "FeederTendrils"), rg = live().filter(function (x) { return x.side === u.side && abOf(x, "SagaOfTheWarriorBorn"); })[0];
          const sg = abOf(u, "SagaOfTheWarriorBorn") || (rg && u.rules.fa === "SpaceWolves" && rg.kills > 0 ? abOf(rg, "SagaOfTheWarriorBorn") : null);  // Ragnar's allies share it once he has killed
          if (ac) au.flat += ac.extraDmg || 0;
          if (ft) au.flat += ft.extraDmg || 0;
          if (u.rage) au.flat += (abOf(u, "BlackRage") || {}).extraDmg || 0;  // Lucien in his rage
          if (sg) au.hit += parseInt(sg.extraHits, 10) || 0;
        }
        const adjN = live().filter(function (x) { return x !== u && RULES.dist(x.t, u.t) === 1; }).length, adjDA = live().filter(function (x) { return x !== u && x.side === u.side && x.rules.fa === "DarkAngels" && RULES.dist(x.t, u.t) === 1; }).length;
        const mo = fxOn(u, "montka"), hw = fxOn(u, "howl"), cr = fxOn(u, "crusade"), ch = fxOn(u, "chalice"), hd = fxOn(t, "hated"), cn = fxOn(t, "chrono");
        if (mo) au.flat += tt.BigTarget ? mo.v.extraDmg_2 || 0 : mo.v.extraDmg || 0;  // Exemplar of the Mont'ka
        if (hw && !ranged) au.flat += hw.v.extraDmg || 0;  // War Howl
        if (cr && !ranged) { au.flat += cr.v.extraDmg || 0; xp += cr.v.extraPierceRatio || 0; }  // Crusade of Wrath
        if (ch && !ranged) xp += ch.v.extraPierceRatio || 0;  // Blood Chalice
        if (hd && (!ranged || spec.sentinel)) au.flat += hd.extra || 0;  // Exemplar of Hate
        if (cn) au.flat += u.tset.Mechanical ? cn.extra2 || 0 : cn.extra || 0;  // Chronometron: the next attack against it
        if (u.aug) au.flat += u.aug.dmg || 0;  // Prime Test Subject
        if (u.dutyDmg) au.flat += u.dutyDmg;  // Unbreakable Duty
        if (fxOn(u, "decoyb")) au.flat += fxOn(u, "decoyb").extra || 0;  // Decoys and Misdirection: it moved onto an allied decoy
        const dwb = fxOn(u, "dwbuff"); if (dwb && (!ranged || (profile === "Plasma"))) au.flat += dwb.extra || 0;  // Deathwing: after a block, its melee and plasma cannon hits hurt more
        const tcr = abOf(u, "TerrifyingCrescendo"); if (tcr && ranged) au.flat += (tcr.extraDmg || 0) * Math.min(parseInt(tcr.buffMaxLevel, 10) || 6, u.kills);  // Shiron: per enemy he defeated
        const rub = abOf(u, "RealityUnbound"); if (rub && ranged) au.flat += (rub.extraMaxDmg || 0) * foes(u).filter(function (e) { return e.psyTurn === turnNo; }).length;  // Yazaghor: per enemy hurt by psychic damage this turn
        const wbf = fxOn(t, "web"); if (wbf && wbf.by && wbf.by.alive && wbf.by.side === u.side) au.flat += (wbf.v.extraDmg || 0) * Math.max(0, hits - 1) / 2;  // Whispering Web: each hit of the attack hurts more than the one before
        if (abOf(u, "RefusalToBeOutdone")) { const ro = abOf(u, "RefusalToBeOutdone"), out2 = Object.keys(u.outr || {}).reduce(function (a2, k) { return a2 + u.outr[k]; }, 0); au.flat += out2 * (ro.extraDmgPct || 0) / 100; }  // Laviscus: his damage grows with his Outrage
        const yex = live().filter(function (x) { return x.side === u.side && abOf(x, "SummaryExecution"); })[0];
        if (abOf(u, "RapidFire") && u.spent === 0) au.hit += hits;  // Heavy Intercessor: not moved -> two attacks
        if (u.vh === turnNo && abOf(u, "VoltagheistField")) au.hit += parseInt(abOf(u, "VoltagheistField").extraHit, 10) || 1;  // Electro-priest: healed this turn -> one more hit
        const rtS = abOf(u, "RedThirst"); if (rtS && charges(u, t) && u.hp <= u.max * (parseInt(rtS.healthPct, 10) || 50) / 100) { au.flat += rtS.extraDmg || 0; au.hit += parseInt(rtS.extraHit, 10) || 1; }  // Red Thirst: wounded, it charges harder
        if (abOf(u, "UnstoppableFerocity")) { if (t.tset.Psyker) au.hit += 1; if (charges(u, t)) au.hit += 1; }  // Bloodletter: one more hit on a psyker, one on a charge
        const siS = abOf(u, "SynapticInsight"); if (siS && ranged && (live().some(function (x) { return x.side === u.side && x.tset.Synapse && RULES.dist(x.t, t.t) <= 2; }) || live().some(function (x) { return x !== u && x.side === u.side && x.rules.fa === "Tyranids" && RULES.dist(x.t, t.t) === 1; }))) au.hit += parseInt(siS.extraHit, 10) || 0;  // Barbgaunt
        const hsS = abOf(u, "HungeringSwarm"); if (hsS && !ranged) au.hit += (parseInt(hsS.extraHit, 10) || 1) * live().filter(function (x) { return x !== u && x.side === u.side && /Hormagaunt|Vorace/.test(x.name) && RULES.dist(x.t, t.t) === 1; }).length;  // Hormagaunt: per allied swarm unit next to the target
        const hlS = abOf(u, "HailOfLivingAmmunition"); if (hlS && ranged) au.hit += (parseInt(hlS.extraHit, 10) || 1) * live().filter(function (x) { return x !== u && x.side === u.side && x.id === u.id && RULES.dist(x.t, u.t) === 1; }).length;  // Termagant: per adjacent Termagant
        const hyS = abOf(u, "Hypermorph"); if (hyS) au.flat += u.hp * (parseInt(hyS.healthPct, 10) || 15) / 100;  // Aberrant: damage equal to a share of its current health
        if (yex && u.tset.BattleFatigue) { const yv = abOf(yex, "SummaryExecution"); au.flat += (yv.extraDmg || 0) + (yex.yexec ? yv.extraDmg_2 || 0 : 0); }  // Yarrick: his units with Battle Fatigue hit harder
        let a2;
        if (u.tset.Mechanical && armorOf(t) < t.arm) { const tg2 = live().filter(function (x) { return x.side === u.side && abOf(x, "DoctrinaImperatives") && x.stance === 1 && (x === u || RULES.dist(x.t, u.t) === 1); })[0]; if (tg2) au.flat += abOf(tg2, "DoctrinaImperatives").extraDmg || 0; }  // Conquering Imperative
        if (u.tset.TerminatorArmour || abOf(u, "IconOfObstinacy")) { const ly = live().filter(function (x) { return x.side === u.side && abOf(x, "IconOfObstinacy") && (x === u || RULES.dist(x.t, u.t) === 1); })[0]; if (ly) au.flat += abOf(ly, "IconOfObstinacy").extraDmg || 0; }  // Lysander's Icon of Obstinacy
        if (u.zkar) au.flat += ((abOf(u, "HunterOfSouls") || {}).extraDmg || 0) * live().filter(function (x) { return x !== u && x.side === u.side && x.tset.Psyker && RULES.dist(x.t, u.t) === 1; }).length;  // Hunter of Souls: per adjacent allied psyker
        if ((a2 = abOf(u, "SpecialIssueCombiMelta")) && RULES.dist(u.t, t.t) === 1) au.flat += a2.extraDmg || 0;  // Ramus: more damage next to the target
        const pg = live().filter(function (x) { return x !== u && x.side === u.side && abOf(x, "PredictiveGuidance") && RULES.dist(x.t, t.t) <= 2; })[0];
        if (pg && (u.rules.fa === "LeaguesOfVotann" || u.tset.Mechanical)) { const pv = abOf(pg, "PredictiveGuidance"); if (!t.lastSpent && !ranged) au.flat += pv.extraDmg || 0; if (t.lastSpent > 0 && ranged) au.flat += pv.extraDmg_2 || 0; if (u.rules.fa === "LeaguesOfVotann") au.hit += 1; }  // Memnyr's Predictive Guidance
        const wl = fxOn(u, "will"); if (wl) au.flat += wl.extra || 0;  // Anuphet when no ally attacked for him
        const gu = live().filter(function (x) { return x.side === u.side && abOf(x, "GrimEfficiency") && x.grim === 1 && (x === u || RULES.dist(x.t, u.t) <= (parseInt(abOf(x, "GrimEfficiency").range, 10) || 2)); })[0];
        if (gu) ign += abOf(gu, "GrimEfficiency").armorIgnored || 0;  // Uthar's hostile acquisition posture
        if ((a2 = abOf(u, "WaaaghEnergy"))) au.flat += (a2.extraDmg || 0) * (u.waaaghLvl || 0);  // Zapspitta's Waaagh! energy
        if ((a2 = abOf(u, "CondemnorStake")) && tt.Psyker) au.flat += a2.extraDmg || 0;
        if ((a2 = abOf(u, "HuntersBeyondDeath")) && tt.Psyker) au.flat += a2.extraDmg || 0;
        if ((a2 = abOf(u, "TrophyTaker")) && t.hp <= t.max * (parseInt(a2.hpPct, 10) || 50) / 100) au.flat += a2.extraDmg || 0;
        if ((a2 = abOf(u, "Skullsmasher"))) au.flat += Math.floor((1 - u.hp / u.max) * 100 / (parseInt(a2.hpPct, 10) || 10)) * (a2.extraDmg || 0);
        if ((a2 = abOf(u, "FearedInterrogator"))) {
          const aff = fxOn(t, "stun") || fxOn(t, "pin") || live().some(function (x) { return x !== u && x.side === u.side && x.rules.fa === "DarkAngels" && RULES.dist(x.t, t.t) === 1; });
          if (aff) au.flat += a2.extraDmg || 0;
          if (t.rules.al === "Chaos") au.hit += a2.extraHits || 0;
        }
        if ((a2 = abOf(u, "EnmityForTheUnworthy"))) { bonus += (a2.extraDmgPct || 0) * adjN; au.flat += (a2.extraDmg || 0) * adjDA; }
        if ((a2 = abOf(u, "CrucibleOfBattle"))) { if (RULES.dist(u.t, t.t) === 1) au.flat += a2.extraDmg || 0; if (tt.BigTarget) au.flat += a2.extraDmg_2 || 0; if (fxOn(t, "stun") || hexKind(t.t) === "fire") au.flat += a2.extraDmg_3 || 0; }
        if ((a2 = abOf(u, "HeadClaimer"))) { au.flat += (a2.extraDmg || 0) * u.kills; au.hit += (parseInt(a2.extraHit, 10) || 1) * u.charKills; }
        if ((a2 = abOf(u, "FuelledByFury"))) au.flat += (a2.extraDmg || 0) * (activeUses[u.side] || 0);
        if ((a2 = abOf(u, "SmashaEad")) && u.spent >= 2) au.flat += a2.extraDmg || 0;
        if (ranged && (a2 = abOf(u, "HeavyGravCannon")) && (tt.MkXGravis || tt.TerminatorArmour || tt.Mechanical)) { au.flat += a2.extraDmg || 0; xp += a2.extraPierceRatio || 0; }
        if ((a2 = abOf(u, "PowerTrip"))) { ign += a2.armorIgnored || 0; if (u.hp >= u.max) au.hit += parseInt(a2.extraHit, 10) || 1; }
        const km = tr.PrioritisedEfficiency && u.spent >= 3 ? live().filter(function (k) { return k.side === u.side && k.chargedTurn === turnNo && abOf(k, "ModifiedExoarmour"); })[0] : null;
        if (km) bonus += parseInt(abOf(km, "ModifiedExoarmour").extraDmgPct, 10) || 25;  // Kîmm charged: the units with Prioritised Efficiency that went 3 hexes or more hit harder
        const cf = fxOn(u, "conflag");
        if (cf && ranged && hexKind(t.t) === "fire") au.pct += (cf.v && cf.v.extraDmgPct) || 0;  // Thrice Blessed Conflagration: more damage at range on burning hexes
        raw = (raw + au.flat + (spec.extra || 0) + (u.twisted && u.rules.fa === "Genestealers" ? u.twistDmg : 0)) * (1 + au.pct / 100);  // the allies' auras add flat damage per hit (part of the damage that varies), and a percentage
        pm = 1 + bonus / 100;  // the traits' percentages (Heavy Weapon ...) come after the armour, with the higher ground, the trench and the razor wire (the game's order, tacticus.wiki.gg "How Damage Truly Works")
        hits += au.hit; ign = au.ign;
        if (cu.el > ct.el && !inTrench) pm *= 1 + (TV.elevationBonus || 50) / 100;  // higher ground (a trench cancels it)
        if (profile === "Melta" && tt.Vehicle) pm *= 1.5;  // Melta: +50 % against vehicles
        if (tr.Dakka && spec.w[0] >= 3 && dd === 2) hits += TV.dakkaExtraHits || 0;
        if (!spec.fixed) { rawPre = raw; dvPct = F ? F.dv : Math.round(dice() * 40 - 20); raw *= 1 + dvPct / 100; }  // DAMVAR: a normal attack varies from -20 % to +20 % of the figure shown
      }
      // what takes hits off a ranged attack or a multi-hit one
      let cut = 0;
      if (ranged) cut += tt.Camouflage ? (inGrass ? TV.camouflageHitReduction_3 : dd > 2 ? TV.camouflageHitReduction_2 : TV.camouflageHitReduction_1) || 0 : inGrass ? TV.lightCoverHitReduction || 2 : 0;
      if (tt.Diminutive) cut += TV.diminutiveHitReduction || 1;
      if (tt.Parry && !ranged) cut += TV.parryHitReduction || 1;
      if (ranged && !ab && u.spent === 0 && abOf(u, "InescapableAccuracy")) cut = 0;  // Maugan Ra, if he has not moved, ignores the hit reductions
      if (!ranged && live().some(function (e) { return e.side !== u.side && abOf(e, "TerrorsLament") && RULES.dist(e.t, u.t) === 1; })) { const tl = abOf(live().filter(function (e) { return e.side !== u.side && abOf(e, "TerrorsLament") && RULES.dist(e.t, u.t) === 1; })[0], "TerrorsLament"); raw = Math.max(1, raw - (tl.dmgReduction || 0)); cut += parseInt(tl.hitsReduction, 10) || 1; }  // Jain Zar's Lament
      hits = Math.max(1, hits - cut);
      if (ab) raw = (raw + legendaryFlat(u, t)) * (1 + auraAtk(u, t, ab, ranged, profile).pct / 100);  // an ability: Trajann's +damage on the enemies next to an ally that used an active ability this turn
      const arm = Math.max(0, armorOf(t) - ign), cutA = auraCut(t, profile);
      let pierceAdd = (spec.pierce || 0) + xp;  // spec.pierce: extra pierce ratio (Hailstrike)
      if (ab && ab[0] === "Supercharge") pierceAdd += (ab[8][rar] || {}).extraPierceRatio || 0;
      if (ab && ab[0] === "LeadingTheCharge") pierceAdd += ((ab[8][rar] || {}).extraPierceRatio || 0) * deadAllies(u);  // +10 % per allied unit defeated in the battle
      const adS = abOf(t, "AllIsDust");
      const perOf = function (rx, isCrit) { rx = Math.max(1, rx - (t.shroud || 0));  // Nightshroud: a flat penalty on the damage before the armour
        if (adS && (PIERCE[profile] || 1) + pierceAdd <= (parseInt(adS.pierceRatio, 10) || 35)) return Math.max(rx - arm, rx * 0.01, 1);  /* All Is Dust: a weak piercing ratio counts as 1 % */
        let p = armorDamage(rx, profile, arm, pierceAdd); if (tt.MkXGravis && !isCrit) p = armorDamage(p, profile, arm); return p; };  // the damage goes through the armour (twice for Mk X Gravis, not on a critical hit)
      let per = perOf(raw);
      let mod = 1;  // the target's own modifiers
      const mindT = fxOn(t, "mind");
      if (mindT) mod *= 1 + ((mindT.v && mindT.v.extraDmgPct) || 0) / 100;  // Mind Control: it takes more
      if (tt.BlessingsOfKhorne && profile === "Psychic") mod *= 1 - Math.min(TV.blessingsOfKhorneMaxDefeatedUnits || 8, meleeDead) * (TV.blessingsOfKhorneDmgPctReduction || 8) / 100;
      const obT = fxOn(t, "observed");
      if (obT) mod *= 1 - Math.min(100, (obT.v.dmgReductionPct || 0) * live().filter(function (e) { return e.side !== t.side && RULES.dist(e.t, t.t) === 1 && fxOn(e, "taunt") && fxOn(e, "taunt").taunt === t; }).length) / 100;  // observed: less damage per taunted enemy next to him
      if (fxOn(t, "wrath") && ranged) mod *= 1 - (fxOn(t, "wrath").red || 0) / 100;  // Overwhelming Wrath: less damage from ranged attacks
      if (profile === "Psychic" && live().some(function (x) { return x !== t && x.side === t.side && (x.rules.pa || []).indexOf("WatchedOver") >= 0 && RULES.dist(x.t, t.t) === 1; })) mod *= 0.8;  // Watched Over: -20 % psychic damage for the units next to a Watcher
      const dtr = fxOn(t, "dr");
      if (dtr) mod *= 1 - (dtr.pct || 0) / 100;  // Unbreakable Duty: less damage taken
      if (t.smasha || (abOf(t, "SmashaEad") && t.spent >= 2)) mod *= 1 - ((abOf(t, "SmashaEad") || {}).dmgReductionPct || 33) / 100;  // Tankrazeur after a run
      if ((profile === "Psychic" || profile === "Flame") && hexKind(t.t) === "fire" && live().some(function (x) { return x.side === u.side && abOf(x, "PsychicStalk"); })) { const ps = abOf(live().filter(function (x) { return x.side === u.side && abOf(x, "PsychicStalk"); })[0], "PsychicStalk"); mod *= 1 + (ps.extraDmgPct || 0) / 100; }  // Psychic Stalk
      if (tt.Terrifying && !ranged) mod *= 0.7;  // Terrifying: -30 % damage from melee attacks
      const bz = fxOn(t, "brazier");
      if (bz) mod *= 1 + (bz.pct || 0) / 100;  // Brazier of Holy Fire: the Daemons around the target take more
      if (t.marked && ranged && u.rules.fa === "Tau") mod *= 1.15;  // markerlight: +15 % from the ranged attacks of T'au units
      if (ct.tile === "Swamp") mod *= 1 + (TV.swampBonus || 50) / 100;
      if (inTrench && cu.tile !== "Trench" && !indirect) mod *= 1 + (TV.trenchBonus || -50) / 100;
      if (ct.tile === "Shrub") mod *= 1 + (TV.shrubBonus || -50) / 100;
      if (tt.PrioritisedEfficiency && t.spent < (TV.prioritisedEfficiencyMovement || 3)) mod *= 1 - (TV.prioritisedEfficiencyDmgReductionPct || 25) / 100;
      if (tt.MartialKatah && !ab) mod *= 1 - (TV.martialKatahDmgReductionPct || 20) / 100;
      if (tt.TerminatorArmour && !t.termUsed && String(TV.terminatorArmourExcludedDmgProfiles || "").split(",").indexOf(profile) < 0) mod *= 1 + (TV.terminatorArmourDmgReduction || -75) / 100;
      const duel = fxOn(t, "taunt");  // Holy Duel: the dueller takes less from his partner
      const camo = ranged && cut > 0 && abOf(t, "CamoCloak") ? abOf(t, "CamoCloak").dmgReduction || 0 : 0;  // Camo Cloak: a ranged attack whose hits were reduced hurts less
      const post = function (per) {  // what comes after the armour: the multipliers (traits, higher ground ...), the target's modifiers, caps
        per *= pm;
        const wcb = !ranged ? abOf(t, "WhipcoilBody") : null, rsh = abOf(t, "Ramshackle");
        if (wcb) per = Math.max(1, per - (wcb.dmgReduction || 0));  // Ophydian Destroyer: less from melee
        if (rsh && (PIERCE[profile] || 1) <= (parseInt(rsh.pierceRatio, 10) || 30)) per = Math.max(1, per - (rsh.dmgReduction || 0));  // Grot Tank: less from weak piercing
      per = Math.max(1, (per - cutA.flat - camo - (duel && duel.taunt === u ? duel.reduce || 0 : 0)) * mod * cutA.mult);
      if (t.shun && t.shun.kind === 1) per *= 1 - (t.shun.v.dmgReductionPct || 0) / 100;  // Serene Unifier, first round of its cycle: -50 % damage taken
      if (tt.TwoManTeam) per = Math.min(per, t.max / 2);
      const gOrg = live().filter(function (g) { return g.side === t.side && abOf(g, "GuardianOrganism") && (g === t || (t.tset.BigTarget && RULES.dist(g.t, t.t) === 1)) && (g.stillPrev || live().some(function (y) { return y.side === g.side && y.tset.Synapse && RULES.dist(y.t, g.t) <= 2; })); })[0];
      if (gOrg) { const gv = abOf(gOrg, "GuardianOrganism"); per = Math.max(1, per - Math.min(per * (gv.dmgReductionPct || 0) / 100, gv.dmgReduction || 1e9)); }  // Guardian Organism: -33 % per hit, at most -2 610  // a single hit takes at most half of its health
        return per;
      };
      per = post(per);
      // the hits one by one: a critical hit adds its damage (after the buffs), a block takes some off; each hit has the same chance again, whatever the hit before (a chance for the first item, the
      // second item only on what the first left: 1 - (1 - c1)(1 - c2)); the boosters add up
      let total = per * hits, crits = 0, blocks = 0;
      const itU = !ab && !spec.fixed && (u.itc || (u.rules.it && u.rules.it[rar])), itT = !spec.fixed && profile !== "DirectDamage" && (t.itc || (t.rules.it && t.rules.it[rar]));
      const dwT = abOf(t, "Deathwing") || abOf(t, "DeathwingKnight"), anvT = abOf(t, "AnvilShield");
      if ((itU && itU.c.length) || (itT && itT.b.length)) {
        const nHit = Math.max(1, Math.round(hits)), cache = {}, perFor = function (extra, blk) {  // a critical hit raises the damage (Damage + Crit damage), a block lowers it: both before the variation and the armour
          const k = extra + "|" + blk;
          if (cache[k] === undefined) { const base = (rawPre !== null ? rawPre : raw) + extra - blk; cache[k] = base <= 0 ? 0 : post(perOf(rawPre !== null ? base * (1 + dvPct / 100) : base, extra > 0)); }
          return cache[k];
        };
        let bBonus = itT ? itT.bb[0] : 0, bDmg = itT ? itT.bb[1] : 0;  // what raises the block chance of the target: the boosters, a Watcher next to it (+15 %), Anvil Shield (wounded, or the attacker stands on ice)
        if (itT && itT.b.length) {
          live().forEach(function (w) { if (w !== t && w.side === t.side && RULES.dist(w.t, t.t) === 1 && (w.rules.pa || []).indexOf("WatchedOver") >= 0) bBonus += (abOf(w, "WatchedOver") || {}).blockChance || 0; });
          if (abOf(t, "ReinforcedHiveNode") && (round - (t.arrRound || 1)) % 2 === 0) bBonus += 100;  // Tyranid Warrior: sure to block every other round
          if (anvT) { bDmg += anvT.blockDmg || 0; if (t.hp < t.max * (parseInt(anvT.healthPct, 10) || 35) / 100 || hexKind(u.t) === "ice") bBonus += anvT.blockChance || 0; }
        }
        const hitsOut = [];
        for (let i = 0; i < nHit; i++) {
          let add = 0, block = 0, blocked = false;
          if (F) { if (F.crit && itU && itU.c.length) { add = Math.max.apply(null, itU.c.map(function (c3) { return c3[1]; })) + itU.cb[1]; crits++; } }
          else if (itU) for (let k = 0; k < itU.c.length; k++) if (dice() * 100 < Math.min(100, itU.c[k][0] + itU.cb[0] + (!ranged && fxOn(u, "howl") ? fxOn(u, "howl").v.extraCritChance || 0 : 0))) { add = itU.c[k][1] + itU.cb[1]; crits++; break; }
          if (F) { if (F.block && itT && itT.b.length) { block = Math.max.apply(null, itT.b.map(function (b3) { return b3[1]; })) + bDmg; blocked = true; blocks++; } }
          else if (itT) for (let k = 0; k < itT.b.length; k++) if (dice() * 100 < Math.min(100, itT.b[k][0] + bBonus)) { block = itT.b[k][1] + bDmg; blocked = true; blocks++; break; }  // the block is rolled with the critical hit
          hitsOut.push([perFor(add, block), blocked]);
        }
        // Deathwing: once a hit of the attack is blocked, the other hits of it are weaker (twice as much against Chaos, or next to another Dark Angel)
        const dwCut = dwT && blocks > 0 ? (dwT.dmgReduction || 0) * (u.rules.al === "Chaos" || live().some(function (x) { return x !== t && x.side === t.side && x.rules.fa === "DarkAngels" && RULES.dist(x.t, t.t) === 1; }) ? 2 : 1) : 0;
        total = 0;
        hitsOut.forEach(function (h) { total += h[1] ? h[0] : Math.max(1, h[0] - dwCut); });
        per = total / nHit;
      }
      if (!ab && t.annBy && t.annBy.alive && t.annBy.side === u.side && profile !== "Psychic") { const x = Math.min(per, (t.annBy.rules.ab.filter(function (a) { return a[0] === "MasterAnnihilator"; })[0][8][rar] || {}).maxDmg || per); total += x; hits += 1; }  // Master Annihilator: one more hit, at most its cap
      if (!ab && tr.GetStuckIn && dd === 2 && hits >= 2) {  // Get Stuck In: for every 2 hits at range 2, 30 % of one more (100 % when the target has 2 Orks or 4 units of the attacker's next to it)
        const near = live().filter(function (x) { return x.side === u.side && x !== u && RULES.dist(x.t, t.t) === 1; }), sure = near.filter(function (x) { return x.rules.fa === "Orks"; }).length >= 2 || near.length >= 4, pairs = Math.floor(hits / 2);
        total += per * pairs * (sure ? (TV.getStuckInChance_2 || 100) : (TV.getStuckInChance || 30)) / 100;
      }
      return { tot: total, per: total / hits, hits: hits, dv: dvPct, cr: crits, bl: blocks };  // the damage of one hit, the number of hits, the total (and the dice: the damage variation in %, the critical hits, the blocks)
    }
    // the health left after a hit: Resilient survives with 1 unless the hit overkills it
    const healthAfter = function (t, dmg) {
      if (dmg >= t.hp && t.hp > 1 && t.tset.Resilient && dmg - t.hp < t.max) return 1;
      return Math.max(0, t.hp - dmg);
    };
    function options(u) {  // the actions of a character: its abilities (the active ones with a damage figure) then the normal attack
      const list = [];
      (u.rules.ab || []).forEach(function (a, i) { list.push({ id: "ab" + i, ab: a, name: a[1], icon: assets + "abilities/" + a[0] + ".webp", ok: a[2] === "a" && (u.mow ? !!MOW[a[0]] : !!((a[3] && a[3][rar]) || CULT[a[0]])) }); });  // ok: it can be launched (an active ability with a damage figure); the others are only described
      if (u.mow) return list;  // a machine of war has no normal attack
      list.push({ id: "atk", name: u.tset.Healer ? "Attaque / soin" : u.tset.Mechanic ? "Attaque / réparation" : "Attaque", ok: u.atk > 0 });
      return list;
    }
    // ---- the Genestealer Cult: decoys, summons and Ambush (what the replay of a war between two cults shows, and the abilities' texts) ----
    // a decoy is a 0-health marker nobody can target; an enemy stepping on it destroys it. A summon appears with the stats the ability gives at this rarity. Ambush: the first time such a unit
    // falls it leaves a decoy, and at the start of its side's next turn it comes back, with full health, on a decoy of its side. The "random" hexes of the game are taken in a fixed order here.
    const CULT = { AberrantHypermorph: { self: true, summon: true }, CultDemagogue: { noDmg: true, summon: true }, MightFromBelow: { summon: true }, RevitalizingMalignancy: { self: true, heal: true }, PlagueWind: { tiers: true }, StormOfWrath: { adj: true }, KillMaimBurn: {}, SeekerMissileFrequencyLock: { noDmg: true, pend: true },
      TheQuickening: { hex: true }, SkyStrike: { dash: true }, HeroicFusillade: { leap: true }, MindControl: { debuff: true, noDmg: true },
      LashOfTorment: { disp: "pull", taunt: true }, GrapnelLauncher: { disp: "pull", swapIn: true }, MortisRound: { disp: "push" },
      SupremeCommander: { self: true, summon: true, also: "astraSmnGuardsman", r: 2 }, EarlyWarningOverride: { self: true, summon: true }, SendInTheNextWave: { noDmg: true, summon: true, wave: true, reach: 2 },
      Waaagh: { summon: true, charge: true, also: "orksOrkBoys" },
      Stormcaller: { ice: true, hitAll: true }, GreatFrostAxe: { ice: true }, BrazierOfHolyFire: { fire: true }, TotalObliteration: { fire: true }, HolyDuel: { duel: true }, SorcerousFacade: { psyAlly: true, facade: true, noDmg: true }, FearOfTheUnseen: { self: true, always: true, fear: true, unmoved: true }, EmpyricAmbush: { ambush: true }, ExemplarOfTheKauyon: { kauyon: true }, Loki_SwoopingHawk: { swoop: true }, SlashingDive: { swoop: true }, SternguardFocus: { focus: true, keep: true },
      AdaptiveStrategy: { self: true, always: true, adapt: true }, AttemptedPossession: { noDmg: true, possess: true }, RitesOfMorkai: { self: true, always: true, morkai: true },
      ArmoriumCherub: { keep: true }, SentinelDirectives: { keep: true, noAdj: true }, EuphoricStrikes: { keep: true }, AugmentedAssault: { keep: true }, JakhalStimms: { keep: true },
      FragstormGrenadeLauncher: { redist: "carry" }, HeavyWarpFlamer: { redist: "carry" }, DakkaDakkaDakka: { redist: "carry" }, BloodyFury: { redist: "carry" },
      BringerOfDespair: {}, SilentDeath: {}, VexillaMagnifica: {}, PlasmaCannon: {}, DarkTalonStrike: {}, Executioner: {}, PsychicMaelstrom: {}, TalonsOfTheEmperor: {}, SavageEchoes: {}, GravitonRifle: {}, Foehammer: {},
      SpiritLeech: {}, HarbingerOfDestruction: {}, AncestralFortune: {}, ThunderousAssault: {}, CordClaw: {}, VigilanceEternal: { chargeAb: true }, MomentShackle: { self: true, always: true, shackle: true }, Drachnyen: { drach: true },
      DoctrinaImperatives: { self: true, always: true, stance: true },
      TitanhammerSquad: { mark: true, keep: true }, BasiliskBarrage: { noDmg: true, anywhere: true, reach: 99, unmoved: true, barrage: true },
      IronkinSteeljack: { self: true, always: true, summon: true, pick: true }, GrotTank: { self: true, always: true, summon: true, pick: true }, Poxwalkers: { self: true, always: true, summon: true }, MasterOfTheTutelaries: { self: true, always: true, summon: true, pick: true },
      ScarabHive: { noDmg: true, summon: true, forceT: true }, Incursion: { noDmg: true, summon: true, forceT: true, reach: 2 }, DeathFromAbove: { noDmg: true, summon: true, forceT: true, adjOnly: true, reach: 1 },
      ResurrectionOrb: { self: true, always: true, revive: "orb" }, RitesOfRestoration: { self: true, always: true, revive: "rites", healAdj: { key: "hpToHeal", mechNo: true } },
      ExemplarOfTheMontka: { self: true, always: true, keep: true, buffs: "montka" }, WarHowl: { self: true, always: true, keep: true, buffs: "howl", unmoved: true }, CrusadeOfWrath: { self: true, always: true, buffs: "crusade" },
      UnbreakableDuty: { self: true, always: true, buffs: "duty" }, Chronometron: { self: true, always: true, buffs: "chrono" }, FoulInfusion: { self: true, always: true, buffs: "infusion" }, BloodChalice: { self: true, always: true, buffs: "chalice" },
      InspiredToGreatness: { allyAdj: true, buffs: "inspire" }, PrimeTestSubject: { allyAdj: true, buffs: "prime" }, ExemplarOfHate: { noDmg: true, anywhere: true, reach: 99, buffs: "hate" },
      AlphaWarrior: { self: true, always: true, summon: true, alpha: true, unmoved: true }, UnstoppableMomentumReworked: { nob: true }, BlackRage: { chargeAb: true, normal: true, moveRange: true, rage: true }, MultiThreatEliminator: { redist: "multi" }, Doombolt: { redist: "doom" },
      LightOfSanguinius: { chargeAb: true }, LeadingTheCharge: { chargeAb: true }, HammerOfWrath: { chargeAb: true }, MassDriverAccelerator: { chargeAb: true, moveRange: true },
      GauntletsOfUltramar: { self: true, always: true, needDist: 2 }, RadBombardment: { line: true, reach: 99 }, PowerVomit: { line: true, reach: 99 }, ExcruciatingFrequencies: { line: true, reach: 99 },
      DefendTheDivineWork: { self: true, always: true, healAdj: { key: "hpToRepair", mech: true } }, CombatRestoratives: { self: true, always: true, healAdj: { key: "hpToHeal", key2: "hpToHeal_2" } },
      SanctorumMissile: {}, FragBomb: {}, FrenziedFiring: {}, HarvesterOfSouls: {}, DoomSiren: {}, Supercharge: {}, HeraldOfTheApocalypse: {}, HellfyreMissileRack: {}, MurderousSwing: {}, ProclivityForMurder: {}, CalibaniteGreatsword: { self: true, always: true, stance: true },
      CrushingClaws: { claws: true }, ItItches: { itches: true, noDmg: true, adjOnly: true }, OverwhelmingWrath: { self: true, always: true, wrath: true }, DaemonicPatrons: { patrons: true, noDmg: true, adjOnly: true }, GetEmRuntz: { self: true, summon: true, grot: true, always: true } };
    let spawnDepth = 0;
    function spawn(id, side, parent, t, stats, noMove) {  // a new unit (stats: [health, damage, armour], none for a decoy) not yet on the board: the step that summons it puts it there
      const sm = (UNITS._summons || {})[id] || {}, rules = Object.assign({}, sm);
      rules.st = stats ? (function () { const o = {}; o[rar] = stats; return o; })() : null;
      const u = { id: id, side: side, mow: false, name: sm.name || id, img: assets + "npcs/" + id + ".webp", rules: rules, relic: null, t: t.slice(), t0: t.slice(), summon: true, decoy: id === "genesSmnDecoy", parent: parent, noMove: !!noMove };
      u.i = units.length; units.push(u); field.push(u); initUnit(u); u.alive = false; makeToken(u);
      if (u.tset.Ambush && !u.decoy) u.dd = spawn("genesSmnDecoy", side, u, t, null);  // the decoy it leaves when it falls
      const pile = abOf(u, "PileIn");
      if (pile && !u.kids && spawnDepth < 2) { spawnDepth++; u.kids = [0, 1].map(function () { return spawn("orksGrot", side, u, t, [pile.summonHp || 1, pile.summonDmg || 1, 0], false); }); spawnDepth--; }  // the Grots it may add at the end of its turn
      const spl = abOf(u, "Split"), pox = abOf(u, "CursedOfTheWalkingPox");
      if (spl && !u.kids && spawnDepth < 2) { spawnDepth++; u.kids = [0, 1].map(function () { return spawn("thousSmnBlueHorror", side, u, t, [spl.summonHp || 1, spl.summonDmg || 1, 0], false); }); spawnDepth--; }  // the Blue Horrors it leaves, made now, off the board
      if (pox && !u.kids && spawnDepth < 2 && u.rules.st && u.rules.st[rar]) { spawnDepth++; u.kids = [0, 1, 2].map(function () { return spawn("deathPoxwalker", side, u, t, u.rules.st[rar].slice(), false); }); spawnDepth--; }  // the Poxwalkers its kills raise
      return u;
    }
    function freeAround(u) {  // the free hexes next to a unit (those without a decoy first)
      const taken = {}, dec = {};
      live().forEach(function (x) { footOf(x).forEach(function (h) { taken[h[0] + "," + h[1]] = 1; }); });
      decoys().forEach(function (x) { dec[x.t[0] + "," + x.t[1]] = x; });
      return prio(u, RULES.around(u.t[0], u.t[1]).filter(function (h) { const c = RULES.cell(h[0], h[1]); return c && c.kind === 0 && !taken[h[0] + "," + h[1]]; }), u.t)
        .sort(function (a, b2) { return (dec[a[0] + "," + a[1]] ? 1 : 0) - (dec[b2[0] + "," + b2[1]] ? 1 : 0); });
    }
    // where a unit goes when the game "chooses" a hex around a centre: not razor wire, the highest ground, tall grass, then clockwise from the north (from the south for the side that starts at the top,
    // as if its screen were turned round)
    const clockRank = function (u, c, h) { const i = RULES.around(c[0], c[1]).findIndex(function (x) { return x[0] === h[0] && x[1] === h[1]; }); return i < 0 ? 9 : (i - (u.side === 1 ? 3 : 0) + 6) % 6; };
    const prio = function (u, hs, c, big) {  // big: the unit that will stand there is a Big Target: tall grass gives it nothing
      return hs.slice().sort(function (a, b2) {
        const ca = RULES.cell(a[0], a[1]), cb = RULES.cell(b2[0], b2[1]);
        return ((ca.tile === "Swamp") - (cb.tile === "Swamp")) || (cb.el - ca.el) || (big ? 0 : (cb.tile === "DryBush") - (ca.tile === "DryBush")) || (clockRank(u, c, a) - clockRank(u, c, b2));
      });
    };
    // the three hexes of a big shape anchored on h: h and two neighbours that touch each other, the first pair being north and north-east (south and south-west for the top side), then clockwise
    const footprints = function (u, h) {
      const ring = RULES.around(h[0], h[1]), st = u.side === 1 ? 3 : 0, out = [];
      for (let k = 0; k < 6; k++) out.push([h.slice(), ring[(st + k) % 6], ring[(st + k + 1) % 6]]);
      return out;
    };
    const waaaghSpots = function (u, t, vals) { return u.spent === 0 ? prio(u, freeAround(u), u.t).slice(0, parseInt(vals.nrOfSummons, 10) || 2) : []; };
    let pickedHex = null;  // the hex the player chose for a one-unit summon (Giba's tank ...)
    const placeAt = function (u) { return pickedHex ? [pickedHex.slice()] : prio(u, freeAround(u), u.t).slice(0, 1); };  // the chosen hex, else the usual priority
    function cultAdds(u, o, t) {  // the units the action puts on the board
      const id = o.ab[0], vals = (o.ab[8] && o.ab[8][rar]) || {}, stat = function (suf) { return [vals["summonHp" + suf] || 1, vals["summonDmg" + suf] || 1, vals["summonArmor" + suf] || 0]; };
      const decAt = {};
      decoys().forEach(function (x) { decAt[x.t[0] + "," + x.t[1]] = x; });
      const adds = [], put = function (sid, h, stats, noMove) { const n = spawn(sid, u.side, u, h, stats, noMove), old = decAt[h[0] + "," + h[1]]; if (old && sid !== "genesSmnDecoy") n.replaces = old; if (sid !== "genesSmnDecoy") n.immediate = true; adds.push(n); return n; };
      if (id === "AberrantHypermorph") {
        const h = freeAround(u)[0];
        if (h) put("genesSmnAberrant", h, stat(""), true);  // it may attack at once but not move this turn
      } else if (id === "SupremeCommander") {  // Creed: 2 Cadian Guardsmen (3 with Kell on the field) on free hexes next to him, nearest to the enemies first; the Guardsmen within 2 then play at once (m.also)
        const kell = live().some(function (x) { return x.side === u.side && x.id === "astraSmnKell"; });
        prio(u, freeAround(u), u.t).slice(0, (parseInt(vals.nrOfSummons, 10) || 2) + (kell ? 1 : 0)).forEach(function (h) { put("astraSmnGuardsman", h, stat(""), false); });
      } else if (id === "EarlyWarningOverride") {  // Re'vas: 2 Shield Drones next to her, they hit an adjacent enemy at once but do not move
        prio(u, freeAround(u), u.t).slice(0, 2).forEach(function (h) { put("tauSmnDroneShield", h, stat(""), true); });
      } else if (id === "SendInTheNextWave") {  // Yarrick: 2 Guardsmen + 1 per ally lost (5 at most) on free hexes within 2 of the target; they shoot it at once, without moving
        const lost = field.filter(function (x) { return x.side === u.side && !x.alive && x.hp <= 0 && !x.decoy && !x.mow; }).length;  // "unité": characters and summons
        const n = Math.min(parseInt(vals.maxSummons, 10) || 5, (parseInt(vals.nrOfSummons, 10) || 2) + lost), taken = {};
        live().forEach(function (x) { footOf(x).forEach(function (h) { taken[h[0] + "," + h[1]] = 1; }); });
        d.cells.filter(function (c) { const k = c[0] + "," + c[1], dd = RULES.dist(t.t, [c[0], c[1]]); return c[4] === 0 && dd >= 1 && dd <= 2 && !taken[k] && (dd <= 1 || RULES.sight([c[0], c[1]], t.t)); })
          .sort(function (a, b2) { const da = RULES.dist(t.t, [a[0], a[1]]), db = RULES.dist(t.t, [b2[0], b2[1]]); return (db === 2) - (da === 2) || b2[3] - a[3] || (b2[2] === "DryBush") - (a[2] === "DryBush") || a[0] - b2[0] || a[1] - b2[1]; })  // a hex to shoot from (not next to the target), the highest, tall grass
          .slice(0, n).forEach(function (c) { put("astraSmnGuardsman", [c[0], c[1]], stat(""), true); });
      } else if (id === "Waaagh") {  // Gulgortz, if he has not moved: 2 Ork Boyz on free hexes next to him (toward the target)
        waaaghSpots(u, t, vals).forEach(function (h) { put("orksOrkBoys", h, stat(""), false); });
      } else if (id === "IronkinSteeljack") {
        placeAt(u).forEach(function (h) { put("votanSmnSteeljack", h, stat(""), true); });
      } else if (id === "GrotTank") {  // more health for each round started
        placeAt(u).forEach(function (h) { put("orksGrotTank", h, [(vals.summonHp || 1) + (vals.extraHp || 0) * round, vals.summonDmg || 1, vals.summonArmor || 0], true); });
      } else if (id === "Poxwalkers") {  // on a share of the free hexes in Corrodius' Contagion aura, they hit at once but cannot move
        const free = d.cells.filter(function (c) { return c[4] === 0 && RULES.dist(u.t, [c[0], c[1]]) >= 1 && RULES.dist(u.t, [c[0], c[1]]) <= contagionRange() && !live().some(function (x) { return x.t[0] === c[0] && x.t[1] === c[1]; }); }).map(function (c) { return [c[0], c[1]]; });
        const rr = mulberry(diceSeed() ^ (u.i * 40503) ^ 0x5eed7), share = (vals.chance || 20) + rr() * ((vals.chance_2 || 45) - (vals.chance || 20));  // a share of the free hexes between the two figures, drawn at each cast, on hexes drawn at random
        const bag = free.slice(), pick = [];
        while (bag.length && pick.length < Math.ceil(free.length * share / 100)) pick.push(bag.splice(Math.floor(rr() * bag.length), 1)[0]);
        pick.forEach(function (h) { put("deathPoxwalker", h, stat(""), true); });
      } else if (id === "MasterOfTheTutelaries") {
        placeAt(u).forEach(function (h) { put("thousSmnPinkHorror", h, stat(""), false); });
      } else if (id === "ScarabHive") {
        prio(u, freeAdj(t), t.t).slice(0, 2).forEach(function (h) { put("necroSmnSwarm", h, stat(""), true); });
      } else if (id === "Incursion") {  // Bloodletters next to the target, one after the other while it stands and a hex is free (6 at most)
        prio(u, freeAdj(t), t.t).slice(0, parseInt(vals.maxSummons, 10) || 6).forEach(function (h) { put("blackSmnBloodletter", h, stat(""), true).seq = true; });  // one after the other: they stop when the target falls
      } else if (id === "DeathFromAbove") {  // one Inceptor per round started, next to the target, attacking it at once
        prio(u, freeAdj(t), t.t).slice(0, round).forEach(function (h) { put("ultraSmnInceptor", h, stat(""), true); });
      } else if (id === "AlphaWarrior") {  // Winged Prime: a Tyranid Warrior on a free hex in his Synapse range (2), it cannot move this turn but attacks at once
        const near = d.cells.filter(function (c) { return c[4] === 0 && RULES.dist(u.t, [c[0], c[1]]) >= 1 && RULES.dist(u.t, [c[0], c[1]]) <= 2 && !live().some(function (x) { return x.t[0] === c[0] && x.t[1] === c[1]; }); }).map(function (c) { return [c[0], c[1]]; });
        prio(u, near, u.t).slice(0, 1).forEach(function (h) { put("tyranSmnWarrior", h, stat(""), true); });
      } else if (id === "GetEmRuntz") {  // Runtherd: a Grot on every free hex next to him that also touches an enemy; each attacks at once without moving and taunts what it hits
        freeAround(u).filter(function (h) { return foes(u).some(function (e) { return RULES.dist(e.t, h) === 1; }); }).forEach(function (h) { put("orksGrot", h, [vals.summonHp || 1, vals.summonDmg || 1, vals.summonArmor || 0], true).grotTaunt = true; });
      } else if (id === "MightFromBelow") {  // a Purestrain Genestealer on every decoy of its side next to the Patriarch
        decoys().filter(function (x) { return x.side === u.side && RULES.dist(u.t, x.t) === 1; }).forEach(function (x) { put("genesSmnGenestealer", x.t, stat(""), true); });
      } else if (id === "CultDemagogue") {  // up to 8 decoys on free hexes within 2 of the target, then a Neophyte on half of the allied decoys of the area
        const near = function (h) { return RULES.dist(t.t, h) <= 2; }, taken = {};
        live().forEach(function (x) { footOf(x).forEach(function (h) { taken[h[0] + "," + h[1]] = 1; }); });
        const spots = d.cells.filter(function (c) { const k = c[0] + "," + c[1]; return c[4] === 0 && near([c[0], c[1]]) && !taken[k] && !decAt[k]; })
          .sort(function (a, b2) { return RULES.dist(t.t, [a[0], a[1]]) - RULES.dist(t.t, [b2[0], b2[1]]) || a[0] - b2[0] || a[1] - b2[1]; }).slice(0, vals.nrOfSummons || 8);
        const made = spots.map(function (c) { return put("genesSmnDecoy", [c[0], c[1]], null, false); });
        const area = made.concat(decoys().filter(function (x) { return x.side === u.side && near(x.t); }));
        area.sort(function (a, b2) { return RULES.dist(u.t, a.t) - RULES.dist(u.t, b2.t); }).slice(0, Math.floor(area.length / 2)).forEach(function (x) {
          if (made.indexOf(x) >= 0) { x.alive = false; adds.splice(adds.indexOf(x), 1); }  // a new decoy that gets a Neophyte: the Neophyte takes its hex
          put("genesSmnNeophyte", x.t0, stat("_2"), false).replaces = made.indexOf(x) >= 0 ? null : x;
        });
      }
      return adds;
    }
    units.slice().forEach(function (u) { if (!u.mow && !u.decoy && u.tset.Ambush && !u.dd) u.dd = spawn("genesSmnDecoy", u.side, u, u.t0 || [0, 0], null); });  // the decoy a character with Ambush leaves where it falls
    // the decoys (and the Neophyte) the Genestealer Cult passives put on the board are made now, off the board, and taken in order when the step that needs them is replayed (settle resets the count)
    units.slice().forEach(function (u) {
      if (u.mow || u.decoy || u.summon) return;
      const ids = (u.rules.ab || []).map(function (x) { return x[0]; });
      u.dpool = { decoy: [], neo: [] };
      if (ids.indexOf("SpiritualLeader") >= 0 || ids.indexOf("HypersensoryAbilities") >= 0 || ids.indexOf("CosmicHorror") >= 0 || ids.indexOf("DecoysAndMisdirection") >= 0) for (let i = 0; i < 10; i++) u.dpool.decoy.push(spawn("genesSmnDecoy", u.side, u, u.t0 || [0, 0], null));
      if (ids.indexOf("SpiritualLeader") >= 0) { const sl = (u.rules.ab.filter(function (x) { return x[0] === "SpiritualLeader"; })[0][8] || {})[rar] || {}; for (let i = 0; i < 4; i++) u.dpool.neo.push(spawn("genesSmnNeophyte", u.side, u, u.t0 || [0, 0], [sl.summonHp || 1, sl.summonDmg || 1, sl.summonArmor || 0], false)); }
    });
    const fromPool = function (owner, kind) { owner.pi = owner.pi || {}; const k = owner.pi[kind] || 0; owner.pi[kind] = k + 1; return owner.dpool && owner.dpool[kind] ? owner.dpool[kind][k] || null : null; };  // the next one not used yet in this replay
    const putDecoy = function (owner, h) { const d2 = fromPool(owner, "decoy"); if (!d2) return null; d2.t = h.slice(); d2.alive = true; d2.hp = 0; return d2; };
    units.slice().forEach(function (u) {  // the guards of a character, created off the board: they appear when the first hit lands
      (u.rules.ab || []).forEach(function (a) {
        if (u.mow || (a[0] !== "GeminaeSuperia" && a[0] !== "SwornProtector")) return;
        const v = (a[8] && a[8][rar]) || {}, n = a[0] === "GeminaeSuperia" ? 2 : 1;
        u.pool = []; u.guardSwap = a[0] === "SwornProtector";
        for (let i = 0; i < n; i++) { const g = spawn(a[0] === "GeminaeSuperia" ? "adeptSmnGeminaeSuperia" : "astraSmnKell", u.side, u, u.t0 || [0, 0], [v.summonHp || 1, v.summonDmg || 1, v.summonArmor || 0], false); u.pool.push(g); }
      });
    });
    const fxOn = function (u, id) { const f = u.fx && u.fx[id]; return f && round <= f.until ? f : null; };  // a state with an end (until: the last round it lasts)
    // ---- the hex effects (fire, ice, contamination, despoiled ground): each lasts through the round it is made and the next one, one effect per hex. The game's chances (the fire spreading in tall grass 10 %,
    // a toxic hit contaminating the hex 25 %, 6-9 % of despoiled ground) are drawn from a generator seeded by the number of the step, so a timeline always replays the same way ----
    let hexfx = {}, stepRng = Math.random;
    const mulberry = function (a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
    const hexKind = function (h) { const f = hexfx[h[0] + "," + h[1]]; return f && round <= f.until ? f.kind : null; };
    const tileStop = function (c, r) { const k = hexKind([c, r]); return k === "fire" || k === "ice"; };  // entering fire or ice ends a move (not for flying or unstoppable units)
    const battleFocus = function (g) {  // Guardian: after attacking or being attacked it steps 1 hex away from the enemies, as far as it can
      if (!g.alive || !abOf(g, "BattleFocus")) return;
      const foesNow = foes(g), score = function (h) { return foesNow.length ? Math.min.apply(null, foesNow.map(function (e) { return RULES.dist(h, e.t); })) : 0; }, hs = freeAround(g).sort(function (a2, b2) { return score(b2) - score(a2); });
      if (hs.length && score(hs[0]) > score(g.t)) g.t = hs[0].slice();
    };
    const stopFor = function (u) { return function (c, r) { return tileStop(c, r) || (!u.rules.fl && !u.rules.us && !fxOn(u, "howl") && live().some(function (x) { return x.side !== u.side && abOf(x, "PunishmentInescapable") && RULES.dist(x.t, [c, r]) === 1; })); }; };  // entering a hex next to Boudicari ends the move (not for Flying, Unstoppable, Vehicle, Immune)
    const hexCover = function (h, kind) { return { h: h.slice(), kind: kind, until: round + 1 }; };
    const iceAround = function (u) { return RULES.around(u.t[0], u.t[1]).filter(function (h) { return hexKind(h) === "ice"; }).length; };
    const stunUntil = function (u) { return u.side === 1 ? round : round + 1; };  // the round of the target's next turn
    const withPos = function (x, cell, fn) { const old = x.t; x.t = cell; try { return fn(); } finally { x.t = old; } };
    const freeAdj = function (t, but) {  // the free hexes around a unit
      const taken = {};
      live().forEach(function (x) { if (x !== but) footOf(x).forEach(function (h) { taken[h[0] + "," + h[1]] = 1; }); });
      return RULES.around(t.t[0], t.t[1]).filter(function (h) { const c = RULES.cell(h[0], h[1]); return c && c.kind === 0 && !taken[h[0] + "," + h[1]]; });
    };
    const mainWeapon = function (u, melee) { const wp = u.rules.wp || []; return (wp.filter(function (w) { return melee ? w[0] === 1 : w[0] > 1; })[0]) || wp[0] || [1, "Physical", 1]; };
    function stepsOf(u, mov, onAllies, noStop) {  // the hexes a unit can reach within `mov` steps (an enemy blocks, an ally can be crossed but not stopped on, unless onAllies: the hex of an ally counts, it is a swap): key -> steps
      const occ = {}, out = {};
      live().forEach(function (x) { if (x !== u) footOf(x).forEach(function (h) { occ[h[0] + "," + h[1]] = x; }); });
      RULES.reach({ from: u.t, mov: mov, fly: !!u.rules.fl, free: !!u.rules.us || !!fxOn(u, "howl") || !!noStop, enemy: function (c, r) { const x = occ[c + "," + r]; return !!x && x.side !== u.side; }, any: function (c, r) { return !onAllies && !!occ[c + "," + r]; }, stop: stopFor(u) })
        .forEach(function (p) { out[p.c + "," + p.r] = p.k; });
      return out;
    }
    // Heroic Fusillade from a given hex on a given target: Judh moves there, then 6 hits on the target and on every enemy around the target
    function fusilladeAt(u, o, hex, t) {
      const v = (o.ab[8] && o.ab[8][rar]) || {}, n = parseInt(v.nrOfHits, 10) || o.ab[6] || 1, prof = o.ab[5] || "Projectile";
      const stay = hex[0] === u.t[0] && hex[1] === u.t[1];
      return withPos(u, hex, function () {
        const hit = function (e) { const r = abilityHit(u, e, avgOf(v, ""), prof, n); return { tgt: e, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: o.name }; };
        return { moves: stay ? [] : [{ u: u, to: hex.slice() }], main: hit(t), more: foes(u).filter(function (e) { return e !== t && RULES.dist(t.t, e.t) === 1; }).map(hit) };
      });
    }
    // the hexes an ability that targets a hex can go to (L'Accélération: within 2 steps, not on an enemy), and what it does there
    function hexesOf(u, o) {
      if (u.mow) return mowHexes(u, o);
      const sp = o && o.ab && CULT[o.ab[0]];
      if (sp && sp.mark && o.ok && !u.acted && abReady(u, o.ab)) return playable().filter(function (h) { return freeHex(h) && !foes(u).some(function (e) { return RULES.dist(e.t, h) === 1; }); });  // Titanhammer: a free hex not next to an enemy
      if (sp && sp.kauyon && o.ok && !u.acted && abReady(u, o.ab)) return playable().filter(function (h) { return freeHex(h) && live().some(function (x) { return x.side === u.side && x !== u && RULES.dist(x.t, h) === 1; }); });  // Exemplar of the Kauyon: any free hex (no distance limit) next to an ally
      if (sp && sp.pick) return o.ok && !u.acted && abReady(u, o.ab) && !fxOn(u, "stun") ? freeAround(u) : [];  // a one-unit summon: any free hex next to the caster
      if (!sp || !(sp.hex || sp.leap) || !o.ok || u.acted || !abReady(u, o.ab)) return [];
      const reach = stepsOf(u, 2, !!sp.hex, !!sp.hex), occ = {};  // Quickening: razor wire, fire and ice do not stop that move
      live().forEach(function (x) { if (x !== u) footOf(x).forEach(function (h) { occ[h[0] + "," + h[1]] = x; }); });
      return Object.keys(reach).filter(function (k) {
        const h = k.split(",").map(Number), x = occ[k];
        if (sp.hex) return reach[k] > 0 && !(x && (x.side !== u.side || x.ds));  // L'Accélération: any hex within 2 steps (an ally there swaps places)
        return !x && foes(u).some(function (e) { return RULES.dist(h, e.t) === 1; });  // Fusillade: a free hex (or hers) with an enemy next to it
      }).map(function (k) { return k.split(",").map(Number); });
    }
    // Fusillade on a chosen hex: it hits the adjacent enemy it kills, else the one it hurts most
    function planFusillade(u, o, h) {
      const cands = foes(u).filter(function (e) { return RULES.dist(h, e.t) === 1; }).map(function (e) { const p = fusilladeAt(u, o, h, e); return { e: e, p: p }; })
        .sort(function (a, b2) { return ((b2.p.main.dmg >= b2.e.hp) - (a.p.main.dmg >= a.e.hp)) || b2.p.main.dmg - a.p.main.dmg; });
      return cands[0] ? { tgt: cands[0].e, plan: cands[0].p } : null;
    }
    function planQuickening(u, o, h) {
      const vals = (o.ab[8] && o.ab[8][rar]) || {}, ally = live().filter(function (x) { return x !== u && x.side === u.side && x.t[0] === h[0] && x.t[1] === h[1]; })[0];
      const moves = [{ u: u, to: h.slice() }];
      if (ally) moves.push({ u: ally, to: u.t.slice() });
      const olds = moves.map(function (m) { return [m.u, m.u.t]; }), more = [];
      moves.forEach(function (m) { m.u.t = m.to.slice(); });
      try {
        [u, ally].filter(function (x) { return x && x.rules.fa === "BloodAngels"; }).forEach(function (a) {  // the Blood Angels that moved this way hit an adjacent enemy: 120 % of their damage, at most the cap
          const w = mainWeapon(a, true);
          const best = foes(a).filter(function (e) { return RULES.dist(a.t, e.t) === 1; }).map(function (e) {
            const r = damageOf(a, e, { w: w }, 1), per = Math.min(vals.maxDmg || 1e9, r.per * (vals.dmgPct || 120) / 100);
            return { e: e, per: per, hits: r.hits, tot: per * r.hits };
          }).sort(function (x, y) { return ((y.tot >= y.e.hp) - (x.tot >= x.e.hp)) || y.tot - x.tot; })[0];
          if (best) more.push({ tgt: best.e, dmg: Math.round(best.tot), hits: best.hits, per: Math.round(best.per), label: o.name, by: a });
        });
      } finally { olds.forEach(function (x) { x[0].t = x[1]; }); }
      return { moves: moves, more: more };
    }
    function targetsOf(u, o) {  // [{u: target, dmg}] the hostile characters the action can hit now
      if (u.mow) return mowTargets(u, o);
      const out = [];
      const toggle = false;  // a stance can be changed before attacking, no more once the character has attacked
      if (!o || !o.ok || (u.acted && !toggle) || (o.ab && (fxOn(u, "stun") || !abReady(u, o.ab)))) return out;  // a stunned unit cannot use its active abilities
      const wp = u.rules.wp && u.rules.wp.length ? u.rules.wp : [[1, "Physical", 1]], adj = nextTo(u), sp = o.ab && CULT[o.ab[0]];
      if (sp && sp.noAdj && adj) return out;  // Sentinel Directives cannot be used with an enemy next to Sy-Gex
      if (sp && sp.needDist && !foes(u).some(function (e) { return RULES.dist(u.t, e.t) <= sp.needDist; })) return out;
      if (sp && sp.unmoved && u.moves > 0) return out;  // the Winged Prime summons only if he has not moved
      if (sp && sp.psyAlly) {  // Sorcerous Facade: an allied psyker anywhere; usable only if Yazaghor can hit an enemy with a normal attack
        if (!targetsOf(u, { id: "atk", ok: true }).some(function (x) { return x.dmg > 0; })) return out;
        return live().filter(function (x) { return x.side === u.side && x !== u && !x.decoy && x.tset.Psyker; }).map(function (x) { return { u: x, dmg: 0, hits: 0, per: 0 }; });
      }
      if (sp && sp.allyAdj) return live().filter(function (x) { return x.side === u.side && x !== u && !x.decoy && RULES.dist(u.t, x.t) === 1 && (!sp.pickAny && (sp.buffs !== "prime" || !x.aug)); }).map(function (x) { return { u: x, dmg: 0, hits: 0, per: 0 }; });  // an adjacent ally
      if (sp && sp.self) { if (sp.pick && !pickedHex) return out; return sp.heal || sp.always || freeAround(u).length ? [{ u: u, dmg: 0 }] : out; }  // a summon or a heal around the caster: it casts on itself
      live().forEach(function (t) {
        if (t.side === u.side || t.ds) return;
        const th = footOf(t).sort(function (a, b2) { return RULES.dist(u.t, a) - RULES.dist(u.t, b2); })[0], dd = RULES.dist(u.t, th), clear = dd <= 1 || u.rules.id || RULES.sight(u.t, th);  // a big unit is reached through its nearest hex
        let best = null;
        const keep = function (r, p) { if (!best || r.tot > best.tot) { best = r; best.prof = p; } };  // p: the damage profile of the hit
        if (sp && (sp.hex || sp.mark || sp.kauyon)) return;
        if (sp && sp.debuff) {  // Mind Control: an enemy within 3 next to one of its own allies... of the caster; it deals less, takes more, and is taunted by the sturdiest of them
          const near = live().filter(function (x) { return x.side === u.side && x !== u && RULES.dist(x.t, t.t) === 1; });
          if (dd <= abilityReach(u, o.ab) && clear && near.length) {
            const v = (o.ab[8] && o.ab[8][rar]) || {}, taunter = near.sort(function (a, b2) { return b2.max - a.max; })[0];
            out.push({ u: t, dmg: 0, hits: 0, per: 0, plan: { moves: [], more: [], fx: [{ u: t, id: "mind", until: round + 1, taunt: taunter, v: v }] } });
          }
          return;
        }
        if (sp && sp.dash) {  // Sky Strike: if she has not moved, she goes next to any enemy with a free hex around it and hits it with her normal attack, +652
          if (u.spent > 0) return;
          const v = (o.ab[8] && o.ab[8][rar]) || {}, hs = freeAdj(t, u).sort(function (a, b2) {
            const ca = RULES.cell(a[0], a[1]), cb = RULES.cell(b2[0], b2[1]);
            return cb.el - ca.el || (u.tset.BigTarget ? 0 : (cb.tile === "DryBush") - (ca.tile === "DryBush")) || RULES.dist(u.t, a) - RULES.dist(u.t, b2);
          });
          if (!hs.length) return;
          const r = withPos(u, hs[0], function () { return damageOf(u, t, { w: mainWeapon(u, true), extra: v.extraDmg || 0 }, 1); });
          out.push({ u: t, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), plan: { moves: [{ u: u, to: hs[0].slice() }], more: [] } });
          return;
        }
        if (sp && sp.leap) {  // Heroic Fusillade: Judh moves to a free hex next to the enemy (within 2 steps of her, or where she stands), then hits it and the enemies around it; the hex is the highest, then tall grass, then the nearest
          const reach = stepsOf(u, 2), hs = freeAdj(t, u).filter(function (h) { return reach[h[0] + "," + h[1]] !== undefined; }).sort(function (a, b2) {
            const ca = RULES.cell(a[0], a[1]), cb = RULES.cell(b2[0], b2[1]);
            return cb.el - ca.el || (u.tset.BigTarget ? 0 : (cb.tile === "DryBush") - (ca.tile === "DryBush")) || reach[a[0] + "," + a[1]] - reach[b2[0] + "," + b2[1]];
          });
          if (!hs.length) return;
          const plan = fusilladeAt(u, o, hs[0], t);
          out.push({ u: t, dmg: plan.main.dmg, hits: plan.main.hits, per: plan.main.per, plan: { moves: plan.moves, more: plan.more } });
          return;
        }
        if (sp && sp.drach) {  // Drach'nyen: Abaddon picks an adjacent enemy and hits it with a normal melee attack (his health is set at the same time)
          if (dd !== 1) return;
          const r = damageOf(u, t, { w: mainWeapon(u, true) }, 1);
          out.push({ u: t, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), dv: r.dv, cr: r.cr, bl: r.bl });
          return;
        }
        if (sp && sp.duel) {  // Holy Duel: an adjacent enemy is hit by a normal melee attack (+dmg) and the two are taunted by each other until one falls; the duellist takes less from his partner
          if (dd !== 1) return;
          const v = (o.ab[8] && o.ab[8][rar]) || {}, r = damageOf(u, t, { w: mainWeapon(u, true), extra: v.extraDmg || 0 }, 1);
          out.push({ u: t, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), plan: { moves: [], more: [], fx: [{ u: t, id: "taunt", taunt: u, until: 9999, v: {} }, { u: u, id: "taunt", taunt: t, until: 9999, reduce: v.dmgReduction || 0, v: {} }] } });
          return;
        }
        if (sp && sp.nob) {  // Unstoppable Momentum: pick an enemy on one of the 6 lines
          const p = nobPlan(u, o, t);
          if (!p) return;
          out.push({ u: t, dmg: p.main.dmg, hits: p.main.hits, per: p.main.per, prof: o.ab[5], plan: p });
          return;
        }
        if (sp && sp.chargeAb) {  // a charge ability (Dante, Dreir, Mataneo, Kîmm): if the unit has not moved, it runs to a free hex next to an enemy within its range and hits it
          if (u.moves > 0 || u.acted) return;
          const v = (o.ab[8] && o.ab[8][rar]) || {}, reach = stepsOf(u, sp.moveRange ? mvOf(u) + (parseInt(v.extraMovement, 10) || 0) : parseInt(v.range, 10) || 4);
          const hs = freeAdj(t, u).filter(function (h) { return reach[h[0] + "," + h[1]] !== undefined; }).sort(function (a, b2) {
            const ca = RULES.cell(a[0], a[1]), cb = RULES.cell(b2[0], b2[1]);
            return cb.el - ca.el || (u.tset.BigTarget ? 0 : (cb.tile === "DryBush") - (ca.tile === "DryBush")) || reach[a[0] + "," + a[1]] - reach[b2[0] + "," + b2[1]] || clockRank(u, t.t, a) - clockRank(u, t.t, b2);
          });
          if (!hs.length) return;
          const stay = sameHex(hs[0], u.t), r = withPos(u, hs[0], function () { return sp.normal ? damageOf(u, t, { w: mainWeapon(u, true), extra: (v.extraDmg || 0) }, 1) : damageOf(u, t, { ab: o.ab }, 1); });
          out.push({ u: t, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), prof: o.ab[5], plan: { moves: stay ? [] : [{ u: u, to: hs[0].slice() }], more: [], fx: [] } });
          return;
        }
        if (sp && sp.charge) {  // Waaagh!: Boyz around Gulgortz (if he has not moved), his adjacent allies get +1 movement and +dmg until the end of his turn, then he charges an enemy within his movement: a normal melee attack
          const v = (o.ab[8] && o.ab[8][rar]) || {}, reach = stepsOf(u, budget(u)), spots = waaaghSpots(u, t, v).map(function (h) { return h[0] + "," + h[1]; });
          const hs = freeAdj(t, u).filter(function (h) { const k = h[0] + "," + h[1]; return reach[k] !== undefined && spots.indexOf(k) < 0; }).sort(function (a, b2) {
            const ca = RULES.cell(a[0], a[1]), cb = RULES.cell(b2[0], b2[1]);
            return cb.el - ca.el || (u.tset.BigTarget ? 0 : (cb.tile === "DryBush") - (ca.tile === "DryBush")) || reach[a[0] + "," + a[1]] - reach[b2[0] + "," + b2[1]];
          });
          if (!hs.length) return;
          const stay = hs[0][0] === u.t[0] && hs[0][1] === u.t[1], r = withPos(u, hs[0], function () { return damageOf(u, t, { w: mainWeapon(u, true) }, 1); });
          const buff = live().filter(function (x) { return x.side === u.side && x !== u && RULES.dist(u.t, x.t) === 1; }).map(function (x) { return { u: x, id: "waaagh", until: round, v: v }; });
          out.push({ u: t, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), plan: { moves: stay ? [] : [{ u: u, to: hs[0].slice() }], more: [], fx: buff } });
          return;
        }
        if (sp && sp.focus) {  // Sternguard Focus: a normal attack (the unit's own weapon, in melee or at range) at 100 % of its damage, capped; it does not end the turn
          const v = (o.ab[8] && o.ab[8][rar]) || {};
          wp.forEach(function (w) { if (w[0] === 1 ? dd === 1 : !adj && !u.noRanged && dd <= w[0] && clear) keep(damageOf(u, t, { w: w }, dd), w[1]); });  // a ranged weapon cannot be used next to an enemy
          if (best && best.tot > 0) { const per = Math.min(best.per * (v.dmgPct || 100) / 100, v.maxDmg || 1e9); out.push({ u: t, dmg: Math.round(per * best.hits), hits: best.hits, per: Math.round(per), prof: best.prof }); }
          return;
        }
        if (sp && sp.swoop) {  // Swooping Hawk: a melee target, then the enemies on the 2 hexes behind it in line; the damage ignores the attacker's bonuses
          if (dd !== 1) return;
          const v = (o.ab[8] && o.ab[8][rar]) || {}, r = abilityHit(u, t, v.dmg0 || 0, o.ab[5] || "Piercing", parseInt(v.nrOfHits, 10) || 1);
          out.push({ u: t, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), prof: o.ab[5] });
          return;
        }
        if (sp && sp.ambush) {  // Empyric Ambush: Lhykhis goes to a free hex next to any enemy (no distance limit) and hits it; the best hex is the highest, then tall grass
          if (u.acted) return;
          const hs = freeAdj(t, u).sort(function (a2, b2) {
            const ca = RULES.cell(a2[0], a2[1]), cb = RULES.cell(b2[0], b2[1]);
            return cb.el - ca.el || (u.tset.BigTarget ? 0 : (cb.tile === "DryBush") - (ca.tile === "DryBush")) || RULES.dist(u.t, a2) - RULES.dist(u.t, b2);
          });
          if (!hs.length) return;
          const r = withPos(u, hs[0], function () { return damageOf(u, t, { ab: o.ab }, 1); });
          out.push({ u: t, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), prof: o.ab[5], plan: { moves: sameHex(hs[0], u.t) ? [] : [{ u: u, to: hs[0].slice() }], more: [] } });
          return;
        }
        if (sp && sp.noDmg) { if (sp.adjOnly ? dd === 1 : dd <= abilityReach(u, o.ab) && (clear || sp.anywhere)) out.push({ u: t, dmg: 0, hits: 0, per: 0 }); return; }  // no damage of its own: the target only places the decoys
        if (sp && sp.line && lineDir(u.t, t.t, LINE[o.ab[0]].len((o.ab[8] && o.ab[8][rar]) || {})) < 0) return;  // the target must be on one of the 6 lines
        if (o.ab) { if (dd <= abilityReach(u, o.ab) && clear && !(u.noRanged && o.ab[4] === "Ranged" && dd > 1)) keep(damageOf(u, t, { ab: o.ab }, dd), o.ab[5] || (wp[wp.length - 1] || [])[1]); }
        else wp.forEach(function (w) { if (w[0] === 1 ? dd === 1 : !adj && !u.noRanged && dd <= w[0] && clear) keep(damageOf(u, t, { w: w }, dd), w[1]); });  // a ranged weapon cannot be used next to an enemy
        if (best && best.tot > 0) out.push({ u: t, dmg: Math.round(best.tot), hits: best.hits, per: Math.round(best.per), prof: best.prof, dv: best.dv, cr: best.cr, bl: best.bl });
      });
      if (!o.ab && (u.tset.Healer || u.tset.Mechanic)) {  // a Healer heals a living ally, a Mechanic repairs a mechanical one: the number of hits times its damage
        const hitsMax = Math.max.apply(null, wp.map(function (w) { return w[2]; })), reachW = Math.max.apply(null, wp.map(function (w) { return w[0]; }));
        live().forEach(function (a) {
          const twist = (u.rules.ab || []).some(function (x) { return x[0] === "TwistedScience"; }) && !a.twisted && a !== u || (a !== u && !!abOf(u, "DiabolicRegeneration")) || (a !== u && (abOf(u, "GalvanicField") || abOf(u, "EcogSupport")));  // Hollan can heal an unaffected ally even at full health (not himself); Actus and Vynn too
          if (a.side !== u.side || a.decoy || !a.max || (a.hp >= a.max && !twist)) return;  // a healer can heal itself if it is not mechanical, a mechanic repair itself only if it is mechanical (checked below)
          const mech = !!(a.tset.Mechanical || a.tset.LivingMetal), dd = RULES.dist(u.t, a.t);
          if (mech ? !u.tset.Mechanic : !u.tset.Healer) return;
          if (dd <= reachW && (dd <= 1 || RULES.sight(u.t, a.t))) out.push({ u: a, dmg: 0, hits: hitsMax, per: u.atk, heal: Math.round(Math.min(a.max - a.hp, u.atk * hitsMax)) });
        });
      }
      const tn = ["mind", "taunt"].map(function (k) { return fxOn(u, k); }).filter(function (f) { return f && f.taunt && f.taunt.alive && out.some(function (x) { return x.u === f.taunt; }); })[0];  // taunted: it can only hit the one that taunts it, when it can
      if (tn) return out.filter(function (x) { return x.u === tn.taunt; });
      return out;
    }
    // how far a character can hit: its weapons and its active abilities that deal damage (an ability's own range, else the melee one-hex reach, else its weapons')
    const weaponReach = function (u) { return Math.max.apply(null, u.rules.rg && u.rules.rg.length ? u.rules.rg : [1]); };
    const abilityReach = function (u, a) { return (CULT[a[0]] && CULT[a[0]].reach) || a[9] || (a[4] === "Melee" ? 1 : weaponReach(u)); };
    const hitReach = function (u) {
      let r = weaponReach(u);
      (u.rules.ab || []).forEach(function (a) { if (a[2] === "a" && a[3] && a[3][rar]) r = Math.max(r, abilityReach(u, a)); });
      return r;
    };
    // on a hex next to an enemy, a character cannot shoot: only its melee attack (and its abilities) remain; a character with no melee attack cannot hit with its weapons at all
    const hitReachAt = function (u, adj) {
      if (!adj || u.mow) return hitReach(u);
      let r = (u.rules.rg || [1]).indexOf(1) >= 0 ? 1 : 0;
      (u.rules.ab || []).forEach(function (a) { if (a[2] === "a" && ((a[3] && a[3][rar]) || CULT[a[0]])) r = Math.max(r, abilityReach(u, a)); });
      return r;
    };
    const adjFoeAt = function (u, h) { return live().some(function (x) { return x.side !== u.side && footOf(x).some(function (f) { return RULES.dist(h, f) === 1; }); }); };
    // what the chosen character can still do this turn
    const mine = function () { return sel && !sel.summon && !sel.auto && sel.alive && sel.side === active; };  // a summon plays by itself
    // one move per turn (the whole movement, in one go), and no move after an attack, unless the active ability that was just used says the unit can move again
    const MOVE_AGAIN = { ItItches: 1, StrikeFromTheShadows: 1, ProclivityForMurder: 1, FireAndReposition: 1, FightingRetreat: 1 };
    const budget = function (u) {
      if (u.moves >= 1 + (u.moveExtra || 0) || (u.acted && !u.moveAfter)) return 0;
      return Math.max(0, mvOf(u) - u.spent);
    };  // Rapid Assault: +1 movement until the unit attacks

    function unitPanel() {  // the chosen character: rarity, level, rank, stars, relic, stats, traits, the actions
      if (!sel) return ['<h3>Attaques</h3><p class="rp-none">Cliquez sur un personnage pour choisir son attaque, voir où il peut aller et où l\'adversaire peut le toucher.</p>', '<h3>Stats</h3><p class="rp-none">Les stats du personnage choisi s\'affichent ici.</p>'];
      const head = '<div class="rp-tip-head">' + (sel.img ? '<img src="' + esc(sel.img) + '" alt="">' : "") + "<div><b>" + esc(sel.name) + "</b><small>" + (sel.mow ? "Machine de guerre · " : "") + (sel.side === 0 ? "Attaquant" : "Défenseur") +
        (sel.alive ? "" : " · hors de combat") + "</small></div></div>";
      if (sel.mow) {  // a machine of war: its two abilities, one use per turn, no normal attack, no stats
        const mo = options(sel), mbtns = '<div class="sb-acts">' + mo.map(function (o) {
          return '<button type="button" class="sb-act' + (act && act.id === o.id ? " is-on" : "") + (!o.ok ? " is-info" : "") + '" data-act="' + o.id + '" title="' + esc(o.name) + '"><img src="' + o.icon + '" alt="" onerror="this.style.display=\'none\'"><span>' + esc(o.name) + "</span></button>";
        }).join("") + "</div>";
        return [head + mbtns, '<dl class="rp-stats">' + mo.map(function (o) { return row(esc(o.name), !o.ok ? "non simulée" : sel.acted ? "déjà utilisée ce tour" : abWait(sel, o.ab) ? esc(abWait(sel, o.ab).replace(/\.$/, "")) : "prête"); }).join("") + "</dl>" +
          '<p class="rp-none">Une machine de guerre ne peut ni attaquer, ni défendre, ni soigner : une seule de ses deux capacités par tour, sur n\'importe quelle cible du plateau, sans munitions.</p>'];
      }
      const r = RAR[rar], ru = sel.rules, st = ru.st && ru.st[rar];
      const relic = rar === "m" && sel.relic ? '<div class="rp-relicrow"><img src="' + assets + "items/" + esc(sel.relic[0]) + '.webp" alt="" onerror="this.style.display=\'none\'"><span><b>' + esc(relicName(sel.relic)) + "</b><small>Relique · niveau 10</small></span></div>" : "";
      const reach = (ru.rg || [1]).map(function (n) { return n === 1 ? "mêlée" : "portée " + n; }).join(", ");
      const can = mine() && sel.alive;
      const opts = options(sel);
      const auto = sel.summon || sel.auto;  // a summon (or Lucien in his rage) plays by itself: no button
      const mkBtn = function (o) {
        const spent = o.ab && o.ok && o.ab[2] === "a" && !abReady(sel, o.ab) && !(sel.mow && sel.acted);  // used (once only) or still recharging: greyed
        const moved = !!(o.ab && o.ok && !sel.mow && CULT[o.ab[0]] && ((CULT[o.ab[0]].unmoved || CULT[o.ab[0]].chargeAb || CULT[o.ab[0]].dash) && (sel.moves > 0 || sel.spent > 0) || (CULT[o.ab[0]].stance && sel.acted)));  // needs a unit that has not moved: greyed once it has
        return '<button type="button" class="sb-act' + (act && act.id === o.id ? " is-on" : "") + (o.ab && !o.ok ? " is-info" : "") + (spent || moved ? " is-spent" : "") + '" data-act="' + o.id + '" title="' + esc(o.name + (spent ? " — " + abWait(sel, o.ab) : moved ? (CULT[o.ab[0]].stance ? " — la posture ne peut plus changer : le personnage a déjà attaqué" : " — inutilisable : le personnage s'est déjà déplacé ce tour") : "")) + '">' +
          (o.icon ? '<img src="' + o.icon + '" alt="" onerror="this.style.display=\'none\'">' : '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M19 3l2 2-9.6 9.6-1.4-1.4zM8 13l3 3-2 2-1-1-2.5 2.5L4 18.5 6.5 16l-1-1z"/></svg>') + "<span>" + esc(o.name) + "</span></button>";
      };
      const btns = auto ? (opts.some(function (o) { return o.ab; }) ? '<div class="sb-acts">' + opts.filter(function (o) { return o.ab; }).map(mkBtn).join("") + "</div>" : "") : '<div class="sb-acts">' + opts.map(mkBtn).join("") + "</div>";
      const tr = (ru.tr || []).map(function (t) { return '<span class="sb-trait" title="' + esc(t[1]) + '"><img src="' + assets + "traits/" + esc(t[0]) + '.webp" alt="" onerror="this.style.display=\'none\'">' + esc(t[1]) + "</span>"; }).join("");
      return [head + btns, '<dl class="rp-stats">' + row("PV", st ? num(sel.hp) + " / " + num(sel.max) + (sel.shield && round <= sel.shield.until && sel.shield.amt > 0 ? ' <i class="sb-shv">+ ' + num(sel.shield.amt) + " bouclier</i>" : "") : "—") + (st ? row("Dégâts", num(sel.atk)) + row("Armure", num(sel.arm)) : "") +
        row("Mouvement", (ru.mv || 0) + (ru.ra ? " (+1 assaut rapide)" : "") + (can ? " · reste " + budget(sel) : "")) + row("Portée", reach) + '<div class="rp-sep"></div>' +
        row("Rareté", '<i class="rh rh-' + r.c + '">' + rar.toUpperCase() + "</i> " + r.n) + row("Niveau", r.lv + " / " + r.lv) +
        row("Rang", '<img class="mm-rank" src="' + assets + "ui/rank_" + (r.rank + 1) + '.png" alt=""> ' + RT[Math.floor(r.rank / 3)] + " " + RM[r.rank % 3]) +
        row("Étoiles", '<span class="rp-stars">' + starsHtml(r.stars) + "</span>") + relic + "</dl>" + (tr ? '<div class="sb-traits">' + tr + "</div>" : "") + (function () { const st = statuses(sel).filter(function (x) { return x.id.indexOf("ab-") !== 0; });  // the primary abilities are icons on the token, not states
        return st.length ? '<div class="sb-states"><b>États</b>' + st.map(function (x) { return '<span class="sb-trait ' + (statusKind(x.id) ? "is-" + statusKind(x.id) : "") + '" title="' + esc(x.title) + '"><img src="' + x.icon + '" alt="">' + esc(x.label || x.title.split(" : ")[0].split(" (")[0]) + "</span>"; }).join("") + "</div>" : ""; })()];
    }
    // ---- the tooltip across the top of the screen: what the chosen action is (its description, its figures, who it can hit); the launch is a click on a character ----
    const PROFILE = { Physical: "physiques", Projectile: "de projectile", Las: "laser", Bolter: "de bolter", Flame: "de flammes", Particle: "de particules", Acid: "d'acide", Power: "énergétiques", Plasma: "de plasma", Melta: "de fuseur",
      HeavyRound: "de munition lourde", Gauss: "Gauss", Psychic: "psychiques", DirectDamage: "directs", Energy: "d'énergie", Chain: "de chaîne", Blast: "d'explosion" };
    const pct = function (p) { return Math.round(PIERCE[p] || 1) + " %"; };
    function tipHtml(o) {
      let body = "", tag = "";
      if (o.ab) {
        const vals = (o.ab[8] && o.ab[8][rar]) || {};
        tag = o.ab[2] === "a" ? "Capacité active" : "Capacité passive";
        body = esc(o.ab[7] || "Pas de description.").replace(/\{([^}]+)\}/g, function (m, n) { return "<b>" + (vals[n] !== undefined ? esc(typeof vals[n] === "number" ? num(vals[n]) : vals[n]) : "…") + "</b>"; }).replace(/\n/g, "<br>");
        if (sel.mow) body += '<p class="sb-tip-fig">Machine de guerre : une seule capacité par tour, sur n\'importe quelle cible du plateau, sans munitions ; les dégâts ignorent les bonus de l\'attaquant.</p>';
        else if (o.ab[0] === "SeekerMissileFrequencyLock") body += '<p class="sb-tip-fig">Simulé : la cible est marquée ; au début du prochain tour de Sho\'syl, s\'il est encore là, le missile inflige ' + num(avgOf(vals, "")) + ' dégâts (moins l\'armure, au moins le ratio de perçage).</p>';
        else if (o.ok && !(o.ab[3] && o.ab[3][rar])) body += '<p class="sb-tip-fig">Simulé : les invocations et les leurres, sans dégâts propres (les positions « au hasard » du jeu sont prises dans un ordre fixe).</p>';
        else if (o.ok) body += '<p class="sb-tip-fig">Simulé : <b>' + (o.ab[6] || 1) + "</b> coup" + ((o.ab[6] || 1) > 1 ? "s" : "") + " de <b>" + num(o.ab[3][rar]) + "</b> dégâts " + (PROFILE[o.ab[5]] || PROFILE[((sel.rules.wp && sel.rules.wp.length) ? sel.rules.wp : [[1, "Physical"]]).slice(-1)[0][1]] || "") + ", moins l'armure de la cible (au moins " + pct(o.ab[5] || "Physical") + " des dégâts, le ratio de perçage), puis le terrain et les traits de la cible ; les bonus de l'attaquant et la hauteur ne comptent pas.</p>";
      } else {
        tag = sel.tset.Healer ? "Attaque normale · soin" : sel.tset.Mechanic ? "Attaque normale · réparation" : "Attaque normale";
        const wp = sel.rules.wp && sel.rules.wp.length ? sel.rules.wp : [[1, "Physical", 1]];
        body = wp.map(function (w) {
          return (w[0] === 1 ? "<b>Mêlée</b> (case adjacente)" : "<b>Distance</b> (jusqu'à " + w[0] + " cases, ligne de vue dégagée, inutilisable au contact d'un ennemi)") + " · " + w[2] + " coup" + (w[2] > 1 ? "s" : "") + " de <b>" + num(sel.atk) + "</b> dégâts " + (PROFILE[w[1]] || "") + " (perçage " + pct(w[1]) + ")";
        }).join("<br>") + '<p class="sb-tip-fig">Bonus de la hauteur (+50 %) et des traits du perso, malus de l\'armure de la cible (chaque coup retire l\'armure, mais fait au moins le ratio de perçage des dégâts), du terrain (fils barbelés, tranchée, hautes herbes) et des traits de la cible.</p>' +
          '<p class="sb-tip-fig">Dés : chaque attaque normale varie de −20 % à +20 % (DAMVAR). Les objets de ' + ((sel.itc || (sel.rules.it && sel.rules.it[rar])) && (sel.itc || sel.rules.it[rar]).c.length ? "critique (" + (sel.itc || sel.rules.it[rar]).c.map(function (c2) { const it2 = sel.itc || sel.rules.it[rar]; return c2[0] + (it2.cb[0] || 0) + " % · +" + num(c2[1] + (it2.cb[1] || 0)); }).join(", ") + ")" : "critique (aucun)") + " ajoutent leurs dégâts après les bonus (seules la hauteur et les traits les augmentent) ; ceux de blocage de la cible en retirent. Chaque coup tire ses dés à nouveau, avec la même chance.</p>" +
          (sel.tset.Healer ? '<p class="sb-tip-fig">Soin : sur un allié blessé non mécanique, l\'attaque rend (nombre de coups × dégâts) points de vie.</p>' : "") + (sel.tset.Mechanic ? '<p class="sb-tip-fig">Réparation : sur un allié blessé mécanique, l\'attaque rend (nombre de coups × dégâts) points de vie.</p>' : "");
      }
      let go = "";
      if (!o.ok && o.ab && o.ab[2] !== "a") go = "Capacité passive : rien à lancer, elle agit toute seule quand ses conditions sont réunies" + (o.ab[0] === "HunterOfSouls" ? " (au début du tour de son camp, Z'Kar attaque puis quitte le plateau)." : ".");
      else if (!o.ok && o.ab) go = "Rien à lancer ici : cette capacité n'inflige pas de dégâts (ou n'est pas simulée).";
      else if (o.ab && abWait(sel, o.ab)) go = abWait(sel, o.ab);
      else if (sel.summon) go = "Une invocation joue seule : au début du tour de son camp, ou tout de suite si la capacité qui l'invoque le dit.";
      else if (!sel.alive) go = "Ce personnage est hors de combat.";
      else if (sel.side !== active) go = "Ce n'est pas le tour de ce camp.";
      else if (sel.acted) go = sel.mow ? "Cette machine a déjà utilisé une capacité ce tour." : "Ce personnage a déjà agi ce tour.";
      else if (sel.mow && MOW[o.ab[0]] && MOW[o.ab[0]].hex) go = mowHexes(sel, o).length ? "Cliquez sur un hexagone surligné du plateau." : "Aucun hexagone possible.";
      else if (sel.mow) go = targetsOf(sel, o).length ? (MOW[o.ab[0]].ally ? "Cliquez sur une unité alliée en surbrillance." : "Cliquez sur une unité adverse en surbrillance.") : "Aucune cible valable pour l'instant (voir les conditions dans le texte).";
      else if (o.ab && CULT[o.ab[0]] && CULT[o.ab[0]].pick) go = hexesOf(sel, o).length ? "Cliquez sur une case libre surlignée, à côté du personnage : l'invocation y est posée." : "Aucune case libre à côté.";
      else if (o.ab && CULT[o.ab[0]] && (CULT[o.ab[0]].hex || CULT[o.ab[0]].leap)) go = hexesOf(sel, o).length ? "Cliquez sur une case surlignée : le perso s'y déplace en lançant la capacité" + (CULT[o.ab[0]].leap ? " (ou sur un ennemi : la meilleure case à côté de lui est choisie)." : ".") : "Aucune case possible.";
      else if (targetsOf(sel, o).length) go = o.ab && CULT[o.ab[0]] && CULT[o.ab[0]].self ? (CULT[o.ab[0]].heal ? "Cliquez sur le personnage pour soigner." : "Cliquez sur le personnage pour invoquer.") : "Cliquez sur un personnage adverse en surbrillance pour lancer.";
      return '<div class="sb-tip-bar"><img class="sb-tip-ico" src="' + (o.icon || "") + '" alt="" onerror="this.style.display=\'none\'"><div class="sb-tip-head"><b>' + esc(o.name) + "</b><small>" + tag + " · " + esc(sel.name) + '</small></div>' +
        '<button type="button" class="sb-tip-tog" aria-expanded="' + tipOpen + '">Infos <i>▾</i></button><button type="button" class="sb-tip-x" aria-label="Fermer">×</button></div>' +
        (tipOpen ? '<div class="sb-tip-more"><div class="sb-tip-body">' + body + "</div>" + (go ? '<div class="sb-tip-go">' + go + "</div>" : "") + "</div>" : "");
    }
    // the effects of an attack (the replay's): a beam from the attacker to the target, the damage figure, the target shakes and the attacker's ring lights up
    let flashTimer = null, tipOpen = false;  // tipOpen: the tooltip shows its text (otherwise only its title)
    function flash(m) {
      const fx = $("sb-fx");
      fx.innerHTML = "";
      units.forEach(function (u) { if (u.g) u.g.classList.remove("tk-hit", "tk-act"); });
      clearTimeout(flashTimer);
      const gl = !m ? [] : (m.guards || []).concat(((m.auto || []).concat(m.autoNow || []).concat(m.trig || [])).reduce(function (a, r) { return a.concat(r.guards || []); }, []));
      if (gl.length) {  // a guard that appeared and fell in the same hit is still shown for a moment, with the damage it took
        let h = "";
        gl.forEach(function (x) {
          if (!x.g.g || x.own) return;
          x.g.g.classList.remove("gone"); x.g.g.classList.add("tk-hit"); pos(x.g.g, home(x.g));
          if (x.g.ov) { x.g.ov.classList.remove("gone"); pos(x.g.ov, home(x.g)); }
          if (x.dmg) h += '<text class="rp-fig" x="' + cx(x.g.t[0]).toFixed(1) + '" y="' + (cy(x.g.t[0], x.g.t[1]) - R * 0.55).toFixed(1) + '" text-anchor="middle">−' + num(x.dmg) + "</text>";
        });
        fx.innerHTML = h;
        flashTimer = setTimeout(function () { fx.innerHTML = ""; units.forEach(function (u) { if (u.g) { u.g.classList.remove("tk-hit", "tk-act"); u.g.classList.toggle("gone", !u.alive); } }); }, 1500);
      }
      if (!m || m.k !== "atk" || !(m.dmg > 0)) return;
      const a = home(m.u), t = [cx(m.tgt.t[0]), cy(m.tgt.t[0], m.tgt.t[1])];
      fx.innerHTML += '<line class="rp-beam" x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + t[0].toFixed(1) + '" y2="' + t[1].toFixed(1) + '"/>' +
        '<text class="rp-fig" x="' + t[0].toFixed(1) + '" y="' + (t[1] - R * 0.55).toFixed(1) + '" text-anchor="middle" style="animation-delay:0.12s">−' + num(m.dmg) + "</text>";
      m.tgt.g.classList.add("tk-hit"); m.u.g.classList.add("tk-act");
      flashTimer = setTimeout(function () { fx.innerHTML = ""; units.forEach(function (u) { if (u.g) u.g.classList.remove("tk-hit", "tk-act"); }); }, 1500);
    }
    // a unit that falls and is brought back (Reanimation Beam, Narthecium, Rotbone's orb, Reanimation Protocols ...): a skull where it fell, its token fades and rises again in a green ring
    let reviveTimer = null;
    function reviveFx(m) {
      clearTimeout(reviveTimer);
      const fx = $("sb-fx");
      Array.prototype.slice.call(fx.querySelectorAll ? fx.querySelectorAll(".sb-rv") : []).forEach(function (e) { e.parentNode.removeChild(e); });
      units.forEach(function (u) { if (u.g) u.g.classList.remove("tk-revive"); });
      if (!m) return;
      const list = [];
      (m.regen || []).forEach(function (r) { if (r.revive && r.u && r.u.alive && r.u.t && list.every(function (x) { return x.u !== r.u; })) list.push({ u: r.u, died: !(m.revive || []).some(function (x) { return x.u === r.u; }) }); });  // fell in this very step and came back
      (m.revive || []).forEach(function (r) { if (r.u.alive && r.u.t && list.every(function (x) { return x.u !== r.u; })) list.push({ u: r.u, died: false }); });  // fell earlier, comes back now
      if (!list.length) return;
      let h = "";
      list.forEach(function (x) {
        const px = cx(x.u.t[0]), py = cy(x.u.t[0], x.u.t[1]);
        h += '<g class="sb-rv">' + (x.died ? '<text class="sb-rv-skull" x="' + px.toFixed(1) + '" y="' + (py + 6).toFixed(1) + '" text-anchor="middle">☠</text>' : "") +
          '<circle class="sb-rv-ring" cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="' + (R * 0.5).toFixed(1) + '"/>' +
          '<text class="sb-rv-up" x="' + px.toFixed(1) + '" y="' + (py - R * 0.7).toFixed(1) + '" text-anchor="middle">✚ réanimé</text></g>';
        if (x.u.g) { x.u.g.classList.remove("tk-revive"); void x.u.g.getBoundingClientRect(); x.u.g.classList.add("tk-revive"); }
      });
      fx.innerHTML += h;
      reviveTimer = setTimeout(function () {
        Array.prototype.slice.call(fx.querySelectorAll ? fx.querySelectorAll(".sb-rv") : []).forEach(function (e) { if (e.parentNode) e.parentNode.removeChild(e); });
        units.forEach(function (u) { if (u.g) u.g.classList.remove("tk-revive"); });
      }, 2300);
    }
    // ---- the states shown on a character (like the active ability of the replay's tokens): a small icon under its health bar; when the state is spent or ends, the icon flies up and fades ----
    const abIcon = function (id) { return assets + "abilities/" + id + ".webp"; };  // a state that comes from an ability wears that ability's icon
    const fxIcon = function (n) { return assets + "effects/" + n + ".webp"; }, trIcon = function (n) { return assets + "traits/" + n + ".webp"; };
    function statuses(u) {
      const out = [];
      if (!u.alive || u.mow || u.decoy || !u.t) return out;
      const T = u.tset, add = function (id, icon, title) { out.push({ id: id, icon: icon, title: title }); };
      if (!u.summon && !u.auto) (u.rules.ab || []).forEach(function (a) {  // an active ability that can be used only once: its icon stays on the character until it is used (like the replays)
        if (a[2] !== "a" || ((a[11] || [0, null])[1] !== null) || (u.used && u.used[a[0]] !== undefined) || !((a[3] && a[3][rar]) || CULT[a[0]]) || a[0] === "CalibaniteGreatsword" || a[0] === "DoctrinaImperatives") return;
        out.push({ id: "ab-" + a[0], icon: assets + "abilities/" + a[0] + ".webp", title: a[1] + " : capacité active utilisable une seule fois par bataille." + (abReady(u, a) ? "" : " " + abWait(u, a)) });
      });
      if (T.TerminatorArmour && !u.termUsed) add("term", trIcon("TerminatorArmour"), "Armure Terminator : la première attaque reçue ce tour est réduite de " + Math.abs(TV.terminatorArmourDmgReduction || 75) + " %.");
      if (T.Resilient && u.hp > 1) add("resil", trIcon("Resilient"), "Résilience : ne tombe pas à 0 PV tant qu'il lui en reste plus de 1.");
      if (u.ambush && !u.decoy) add("ambush", trIcon("Ambush"), "Embuscade : laisse un leurre la première fois qu'il tombe et peut revenir sur un leurre.");
      if (u.rules.ra && u.nAtk === 0) add("rapid", trIcon("RapidAssault"), "Assaut rapide : +1 déplacement et +" + (TV.rapidAssaultExtraDmgPct || 25) + " % à sa première attaque.");
      if (!u.acted && u.spent === 0) {
        if (T.HeavyWeapon) add("heavy", trIcon("HeavyWeapon"), "Arme lourde : +" + (TV.heavyWeaponExtraDmg || 25) + " % à distance tant qu'il n'a pas bougé.");
        if (T.CrushingStrike) add("crush", trIcon("CrushingStrike"), "Frappe écrasante : +" + (TV.crushingStrikeExtraDmgPct || 50) + " % en mêlée tant qu'il n'a pas bougé.");
        if (T.Emplacement) add("empl", trIcon("Emplacement"), "Emplacement : +" + (TV.emplacementRangedDmgModifier || 50) + " % à distance tant qu'il n'a pas bougé.");
      }
      if (T.RangedSpecialist && !u.advStart && !u.acted) add("rspec", trIcon("RangedSpecialist"), "Spécialiste de la distance : +" + (TV.rangedSpecialistDmgPct || 33) + " % à distance (il n'a pas commencé son tour au contact).");
      if (T.PrioritisedEfficiency && u.spent < (TV.prioritisedEfficiencyMovement || 3)) add("prio", trIcon("PrioritisedEfficiency"), "Efficacité prioritaire : +" + (TV.prioritisedEfficiencyExtraDmgPct || 25) + " % de dégâts, −" + (TV.prioritisedEfficiencyDmgReductionPct || 25) + " % reçus (tant qu'il bouge de moins de 3 cases).");
      if ((u.rules.ab || []).some(function (a) { return a[0] === "TheBetrayer"; }) && u.kills > 0) add("betray", assets + "abilities/TheBetrayer.webp", "Trahison : agit seul au début de son tour (se déplace de 2 cases et frappe une unité adjacente).");
      if (u.euph && u.euph.name) { const ev = abOf(u.euph, "ArmourOfShriekingSouls") || {}; add("euph", assets + "abilities/ArmourOfShriekingSouls.webp", "Euphorique (" + u.euph.name + ") : perd " + num(ev.minHp || 0) + " à " + num(ev.maxHp || 0) + " PV au début de chacun de ses tours. Quand elle tombe ou quitte le champ de bataille, " + u.euph.name + " ressuscite sur sa dernière case (jusqu'à " + num(ev.hp || 0) + " PV)."); }
      if (fxOn(u, "decoyb")) add("decoyb", abIcon("DecoysAndMisdirection"), "Leurres et détours : +" + num(fxOn(u, "decoyb").extra) + " dégâts jusqu'à la fin du tour (il s'est déplacé sur un leurre allié).");
      const webf = fxOn(u, "web"); if (webf && webf.by && webf.by.alive) add("web", abIcon("WhisperingWeb"), "Toile du Murmure (" + webf.by.name + ") : chaque coup d'une attaque alliée fait plus de dégâts que le précédent.");
      const tcf = fxOn(u, "terror"); if (tcf) add("terror", abIcon("TerrorchemPoison"), "Empoisonné et Poison terrochimique : perd de la santé au début et à la fin de son tour, −" + (tcf.v.dmgReductionPct || 0) + " % de dégâts infligés, −" + (tcf.v.healPct || 0) + " % de soins (jusqu'au round " + tcf.until + ").");
      const fcf = fxOn(u, "facade"); if (fcf) add("facade", abIcon("SorcerousFacade"), "Façade de sorcier : ses attaques normales infligent des dégâts psychiques en plus (jusqu'au début du prochain tour de Yazaghor).");
      const frf = fxOn(u, "fear"); if (frf) add("fear", abIcon("FearOfTheUnseen"), "Peur de l'invisible : ses attaques infligent des dégâts directs en plus à son prochain tour.");
      const mtk = fxOn(u, "montka"); if (mtk) add("montka", abIcon("ExemplarOfTheMontka"), "Exemplaire du Mont'ka : +" + num((mtk.v && mtk.v.extraDmg) || 0) + " dégâts à ses attaques à distance (+" + num((mtk.v && mtk.v.extraDmg_2) || 0) + " contre les grandes cibles), jusqu'au round " + mtk.until + ".");
      const hwl = fxOn(u, "howl"); if (hwl) add("howl", abIcon("WarHowl"), "Hurlement de guerre : Implacable, +" + ((hwl.v && hwl.v.extraCritChance) || 0) + " % de coup critique et +" + num((hwl.v && hwl.v.extraDmg) || 0) + " dégâts à ses attaques de mêlée, jusqu'au round " + hwl.until + ".");
      const crs = fxOn(u, "crusade"); if (crs) add("crusade", abIcon("CrusadeOfWrath"), "Croisade du courroux : +" + num((crs.v && crs.v.extraDmg) || 0) + " dégâts et +" + ((crs.v && crs.v.extraPierceRatio) || 0) + " % de perforation en mêlée, jusqu'au round " + crs.until + ".");
      const drf = fxOn(u, "dr"); if (drf) add("dr", abIcon(drf.src || "UnbreakableDuty"), "Réduit de " + (drf.pct || 0) + " % les dégâts reçus, jusqu'au round " + drf.until + ".");
      const inf = fxOn(u, "infusion"); if (inf) add("infusion", abIcon("FoulInfusion"), "Infusion impie : ses attaques de mêlée ajoutent des coups toxiques, jusqu'au round " + inf.until + ".");
      const chl = fxOn(u, "chalice"); if (chl) add("chalice", abIcon("BloodChalice"), "Calice de sang : ses attaques de mêlée le soignent de " + num((chl.v && chl.v.hpToHeal) || 0) + " et percent plus d'armure, jusqu'au round " + chl.until + ".");
      if (u.nano) add("nano", abIcon("NanoscarabRepairProtocols"), "Protocoles de réparation des nanoscarabées : +" + num(u.nanoHp || 0) + " PV (et PV max) ; ses soins reçus augmentent de " + num(u.nanoBonus || 0) + ", jusqu'à la fin du combat.");
      if (u.dutyDmg > 0) add("duty", abIcon("UnbreakableDuty"), "Devoir inébranlable : +" + num(u.dutyDmg) + " dégâts à ses attaques, jusqu'à la fin du combat.");
      const htd = fxOn(u, "hated"); if (htd) add("hated", abIcon("ExemplarOfHate"), "Haï : subit +" + num(htd.extra || 0) + " dégâts des attaques de mêlée (jusqu'au round " + htd.until + ").");
      const chn = fxOn(u, "chrono"); if (chn) add("chrono", abIcon("Chronometron"), "Chronométré : la prochaine attaque contre lui inflige +" + num(chn.extra || 0) + " dégâts.");
      if (u.aug) add("aug", abIcon("PrimeTestSubject"), "Sujet d'essai : +" + num(u.aug.dmg || 0) + " dégâts" + (u.aug.mv ? ", +" + u.aug.mv + " déplacement" : "") + " tant qu'il tient.");
      const mind = fxOn(u, "mind");
      if (mind) add("mind", abIcon("MindControl"), "Contrôle mental : inflige −" + ((mind.v && mind.v.dmgReduction) || 0) + " dégâts, subit +" + ((mind.v && mind.v.extraDmgPct) || 0) + " %, provoqué par " + (mind.taunt ? mind.taunt.name : "?") + " (jusqu'au round " + mind.until + ").");
      const hk = hexKind(u.t);
      if (hk === "fire") add("hfire", fxIcon("fire"), "Hexagone en feu : 20 % de la santé initiale en dégâts au début de son tour.");
      else if (hk === "ice") add("hice", fxIcon("ice"), "Glace : un déplacement qui y arrive s'arrête.");
      else if (hk === "contam") add("hcontam", fxIcon("poisoned"), "Hexagone contaminé : −30 % d'armure (sauf mécaniques et Nurgle).");
      else if (hk === "despoiled") add("hdesp", fxIcon("possessed"), "Terrain souillé : 6 à 9 % de la santé initiale en dégâts au début de son tour.");
      if (fxOn(u, "wrath")) add("wrath", abIcon("OverwhelmingWrath"), "Courroux écrasant : provoque les ennemis adjacents, −" + (fxOn(u, "wrath").red || 0) + " % des attaques à distance, frappe les adjacents au début de son tour.");
      const obs = fxOn(u, "observed");
      if (obs) add("observed", abIcon("DaemonicPatrons"), "Observé : +" + num(obs.v.extraDmg || 0) + " dégâts et −" + (obs.v.dmgReductionPct || 0) + " % de dégâts subis par ennemi provoqué adjacent (jusqu'à la fin de son prochain tour).");
      if (u.shield && round <= u.shield.until && u.shield.amt > 0) add("shield", u.shield.src ? abIcon(u.shield.src) : fxIcon("shield"), "Bouclier : absorbe " + num(u.shield.amt) + " dégâts (jusqu'au round " + u.shield.until + ").");
      if (fxOn(u, "reanim")) add("reanim", abIcon("ReanimationBeam"), "Faisceau réanimateur : la première fois qu'il devrait être vaincu avant le prochain tour du Réanimateur, il est réanimé.");
      const wkf = fxOn(u, "weak");
      if (wkf) add("weak", abIcon("LightOfSanguinius"), "Lumière de Sanguinius : −" + wkf.pct + " % de dégâts infligés (le double contre les unités à " + (wkf.half || 50) + " % de santé ou moins).");
      if (fxOn(u, "mvup") && !(u.shun && u.shun.kind === 2)) add("mvup", fxOn(u, "mvup").src ? abIcon(fxOn(u, "mvup").src) : fxIcon("buffed"), "+" + (fxOn(u, "mvup").mv || 1) + " déplacement jusqu'à la fin du tour.");
      if (abOf(u, "DoctrinaImperatives")) add("stance", abIcon("DoctrinaImperatives"), u.stance ? "Impératif conquérant : ses unités mécaniques adjacentes frappent plus fort les unités à l'armure réduite." : "Impératif protecteur : ses unités mécaniques adjacentes ont plus d'armure ; ses attaques invoquent un Patrouilleur Skitarii.");
      if (abOf(u, "CalibaniteGreatsword")) add("stance", abIcon("CalibaniteGreatsword"), u.stance ? "Posture de balayage : ses attaques normales frappent aussi les ennemis adjacents à lui et à la cible." : "Posture de frappe : Sentinelle à la fin de son tour, même s'il a attaqué.");
      const bzf = fxOn(u, "brazier");
      if (bzf) add("brazier", abIcon("BrazierOfHolyFire"), "Brasier du feu sacré : +" + bzf.pct + " % de dégâts subis (jusqu'au round " + bzf.until + ").");
      if (fxOn(u, "pin")) add("pin", fxIcon("supressed"), "Neutralisé : −30 % de dégâts, −1 déplacement, pas de Sentinelle (1 manche).");
      const cfx = fxOn(u, "conflag");
      if (cfx) add("conflag", abIcon("ThriceBlessedConflagration"), "Conflagration trois fois bénie : plus de dégâts à distance contre les ennemis sur un hexagone en feu (jusqu'au round " + cfx.until + ").");
      if (fxOn(u, "stun")) add("stun", fxIcon("stunned"), "Étourdi : 1 déplacement, −50 % de dégâts, aucune capacité active (un soin annule l'effet).");
      if (u.ow) add("ow", fxIcon("overwatch"), "Sentinelle : attaque le premier ennemi qui se déplace à sa portée pendant le tour adverse.");
      if (fxOn(u, "hail")) add("hail", abIcon("Hailstrike"), "Hailstrike : plus de perforation en Sentinelle, et le Storm Speeder tire avec lui.");
      if (u.ds) add("ds", trIcon("TeleportStrike"), "Assaut en profondeur : ne peut être ciblé ni subir de dégâts avant d'avoir agi ou terminé son tour ; peut se téléporter sur n'importe quel hexagone libre non adjacent à un ennemi.");
      if (u.noRanged) add("noranged", fxIcon("debuffed"), "S'est téléporté : pas d'attaque à distance jusqu'à la fin de son tour.");
      const wg = fxOn(u, "waaagh");
      if (wg) add("waaagh", abIcon("Waaagh"), "Waaagh ! : +" + ((wg.v && wg.v.extraMovement) || 1) + " déplacement, +" + num((wg.v && wg.v.extraDmg) || 0) + " dégâts et un coup de plus à ses attaques normales de mêlée (jusqu'à la fin du tour).");
      const tn = fxOn(u, "taunt");
      if (tn) add("taunt", fxIcon("taunted"), "Provoqué par " + (tn.taunt ? tn.taunt.name : "?") + " : ne peut viser que lui s'il le peut " + (tn.until >= 999 ? "(tant que l'un des deux n'est pas tombé)" : "(jusqu'au round " + tn.until + ")") + ".");
      if (u.twisted) add("twist", abIcon("TwistedScience"), "Science distordue : PV max augmentés" + (u.rules.fa === "Genestealers" ? ", +" + u.twistDmg + " dégâts" : "") + ".");
      if (u.marked) add("mark", fxIcon("markerlight"), "Pointeur lumineux : les attaques à distance de certains alliés de l'ennemi font plus de dégâts.");
      if (u.annBy && u.annBy.alive) add("annih", abIcon("MasterAnnihilator"), "Maître annihilateur (" + u.annBy.name + ") : les attaques normales des alliés de " + u.annBy.name + " portent un coup de plus.");
      if (u.shun) add("shun" + u.shun.kind, abIcon("SereneUnifier"), ["", "Sens de la pierre : −50 % de dégâts reçus.", "Grâce du Zéphyr : +1 déplacement.", "Tempête de feu : +1 044 dégâts."][u.shun.kind] + " (Aun'Shi)");
      if (u.shroud) add("shroud", abIcon("Nightshroud"), "Voile de nuit : −" + u.shroud + " dégâts à chaque coup reçu.");
      aurasOn(u, u.t).forEach(function (a) {  // one tag per ability whose aura reaches it
        const ab = (a.e.rules.ab || []).filter(function (x) { return x[0] === a.id; })[0], nm = (ab ? ab[1] : a.id) + (a.e === u ? "" : " (" + a.e.name + ")");
        out.push({ id: "aura-" + a.id + "-" + a.e.i, icon: abIcon(a.id), title: nm + " : aura d'une capacité qui l'aide" + ((a.id === "RelentlessMarch" || a.id === "CursedPlagueBell") && u.moveBonus > 0 ? " (+" + (a.id === "RelentlessMarch" ? 1 : parseInt(a.v.extraMovement, 10) || 1) + " déplacement ce tour)" : "") + ".", label: nm });
      });
      // (the +movement of an aura is told in the aura's own tag: no second one)
      if (!T.ContagionsOfNurgle && live().some(function (e) { return e.side !== u.side && e.tset.ContagionsOfNurgle && RULES.dist(e.t, u.t) <= contagionRange(); })) add("conta", trIcon("ContagionsOfNurgle"), "Contagion de Nurgle : l'armure est réduite dans l'aura d'un ennemi.");
      const cell = RULES.cell(u.t[0], u.t[1]) || {};
      if (cell.tile === "Swamp" && !u.rules.fl && !u.rules.us) add("wire", fxIcon("debuffed"), "Fils barbelés : +" + (TV.swampBonus || 50) + " % de dégâts reçus.");
      if (cell.tile === "DryBush" && !T.BigTarget) add("grass", fxIcon("light_cover"), "Hautes herbes : −" + (TV.lightCoverHitReduction || 2) + " coups à distance reçus.");
      return out;
    }
    function syncStatuses() {  // the icons under each token: new ones pop in, spent ones fly up and fade
      units.forEach(function (u) {
        if (!u.stG) return;
        const now = statuses(u), ids = {};
        now.forEach(function (x) { ids[x.id] = x; });
        Object.keys(u.stShown).forEach(function (id) {
          if (ids[id]) return;
          const el = u.stShown[id]; delete u.stShown[id];
          el.classList.add("is-used");
          setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 900);
        });
        now.forEach(function (x, i) {
          let el = u.stShown[x.id];
          if (!el) {
            el = document.createElementNS(NS, "g");
            el.setAttribute("class", "tk-ab tk-st tk-pop");
            const kd = statusKind(x.id);
            el.innerHTML = '<title></title><circle r="6" fill="#0b0e12" stroke="' + (kd === "debuff" ? "#f87171" : kd === "buff" ? "#34d399" : "rgba(255,255,255,.55)") + '" stroke-width="' + (kd ? "1.6" : "0.8") + '"/><image x="-5.2" y="-5.2" width="10.4" height="10.4" preserveAspectRatio="xMidYMid meet"/>';
            u.stG.appendChild(el); u.stShown[x.id] = el;
            setTimeout(function () { el.classList.remove("tk-pop"); }, 400);
          }
          el.querySelector("image").setAttribute("href", x.icon);
          el.querySelector("title").textContent = x.title;
          el.style.setProperty("--x", ((i - (now.length - 1) / 2) * 13).toFixed(1) + "px");
        });
      });
    }
    const deathText = function (list, m) {  // every unit defeated in the step (a guard already said to be defeated is not repeated)
      const said = (m.guards || []).concat(((m.auto || []).concat(m.autoNow || [])).reduce(function (a, r) { return a.concat(r.guards || []); }, [])).filter(function (g) { return g.died; }).map(function (g) { return g.g; });
      return (list || []).filter(function (u) { return said.indexOf(u) < 0 && !u.decoy; }).map(function (u) { return " · <b>" + esc(u.name) + " est vaincu</b>"; }).join("");
    };
    const boomText = function (list) {
      return (list || []).map(function (x) { return " · " + esc(x.from.name) + " " + esc(x.label || "explose") + " → " + esc(x.tgt.name) + " <b>−" + num(x.dmg) + "</b>"; }).join("");
    };
    const regenText = function (list) {
      return (list || []).map(function (x) {
        if (x.flee) return " · " + esc(x.u.name) + " " + esc(x.label);
        if (x.shielded) return " · " + esc(x.u.name) + " : " + esc(x.label) + " " + num(x.amt);
        if (x.shield) return " · " + esc(x.u.name) + " reçoit un bouclier de " + num(x.amt);
        if (x.spawn) return " · " + esc(x.u.name) + " " + esc(x.label) + " (" + num(x.amt) + " PV)";
        if (x.revive) return " · " + esc(x.u.name) + " " + (x.label.indexOf("réanimé") === 0 ? "est " : "") + esc(x.label) + " (" + num(x.amt) + " PV)";
        return " · " + esc(x.u.name) + " régénère +" + num(x.amt) + " (" + esc(x.label) + ")";
      }).join("");
    };
    const hxText = function (list) {  // the hexes an action covers
      const names = { fire: "embrase", ice: "recouvre de glace", contam: "contamine", despoiled: "souille" }, n = {};
      (list || []).forEach(function (x) { n[x.kind] = (n[x.kind] || 0) + 1; });
      return Object.keys(n).map(function (k) { return " · " + names[k] + " " + n[k] + " hexagone" + (n[k] > 1 ? "s" : ""); }).join("");
    };
    // the impacts of one attack on a guarded character: the consecutive hits that land on the same one (a Gemini, then the next one, then the owner) make one impact
    const impactsOf = function (gl, tgt) {
      const out = [];
      (gl || []).filter(function (e) { return e.g && (!tgt || e.from === tgt); }).forEach(function (e) {
        const last = out[out.length - 1];
        if (last && last.g === e.g && !e.fresh && !last.died && last.dmg !== undefined && e.dmg !== undefined) { last.dmg += e.dmg; last.hits++; if (e.died) last.died = true; }
        else out.push({ g: e.g, from: e.from, own: !!e.own, fresh: !!e.fresh, died: !!e.died, hit: e.hit, dmg: e.dmg, hits: 1, n: e.n });
      });
      return out;
    };
    const guardText = function (list) {  // who took a hit in the place of its owner
      if ((list || []).some(function (x) { return x.n; })) return impactsOf(list).map(function (x) {  // attack by attack: one line per impact
        const gn = x.own ? "" : esc(x.g.name) + (x.from.pool && x.from.pool.length > 1 ? " n°" + (x.from.pool.indexOf(x.g) + 1) : ""), nb = x.hits > 1 ? " (" + x.hits + " coups)" : "";
        if (x.hit === false) return '<span class="sb-sub">↳ ' + gn + " apparaît près de " + esc(x.from.name) + "</span>";
        return '<span class="sb-sub">↳ ' + (x.own ? esc(x.from.name) + " <b>−" + num(x.dmg) + "</b>" + nb : (x.fresh ? gn + " apparaît sur un hexagone adjacent et encaisse <b>−" : gn + " encaisse <b>−") + num(x.dmg) + "</b>" + nb + " à la place de " + esc(x.from.name) + (x.died ? " ; " + gn + " est vaincue" : "")) + "</span>";
      }).join("");
      return (list || []).map(function (x) { return x.hit === false ? " · " + esc(x.g.name) + " apparaît près de " + esc(x.from.name) : " · " + (x.fresh ? esc(x.g.name) + " apparaît et " : "") + esc(x.g.name) + " encaisse " + (x.dmg ? "<b>−" + num(x.dmg) + "</b> " : "") + "à la place de " + esc(x.from.name) + (x.died ? " et est vaincue" : ""); }).join("");
    };
    // the states shown on a character: a debuff in red, a buff in green, the rest neutral (the colour of the icon's ring and of the chip in the panel)
    const statusKind = function (id) {
      if (/^(web|terror|euph|mind|taunt|noranged|stun|pin|hfire|hice|hcontam|hdesp|brazier|weak|mark|annih|conta|wire|hated|chrono)/.test(id)) return "debuff";
      if (/^(nano|duty|facade|fear|decoyb|term|resil|ambush|rapid|heavy|crush|empl|rspec|prio|betray|twist|shun|shroud|aura-|move|mvup|waaagh|montka|howl|crusade|dr|chalice|shield|stance|ow|ds|observed|wrath|reanim|hail|conflag|grass|infusion|sentinel|aug)/.test(id)) return "buff";
      return "";
    };
    const autoText = function (list) {  // what acted by itself: the summons, Khârn's Betrayer
      return (list || []).map(function (x) { if (x.env) return " · " + esc(x.label) + (x.tgt ? " → " + esc(x.tgt.name) + " −" + num(x.dmg) : ""); return " · " + esc(x.u.name) + (x.label !== "Attaque" ? " (" + esc(x.label) + ")" : "") + (x.to ? " se déplace" : "") + (x.tgt ? " → " + esc(x.tgt.name) + ((x.guards || []).some(function (g) { return g.n; }) ? "" : " −" + num(x.dmg)) + (x.hits > 1 ? " (" + x.hits + " coups)" : "") : "") + (x.more || []).map(function (y) { return " · " + esc(y.tgt.name) + " −" + num(y.dmg); }).join("") + guardText(x.guards) + autoText(x.trig) + (x.leaves ? " · " + esc(x.u.name) + " quitte le champ de bataille (sa machine peut resservir)" : ""); }).join("");
    };
    const allyHex = function (u) { return !!(u.t && u !== sel && sel && u.alive && !u.decoy && !tgtSet[u.i] && hexSet[u.t[0] + "," + u.t[1]]); };  // a unit standing on a hex the chosen ability can aim at (L'Accélération swaps places with an ally; a machine of war can bombard a hex with a unit on it): clickable
    const isDone = function (u) {  // greyed: everything of the side that does not play, and the units of the side that plays that have nothing left to do (no move, no attack, no ability)
      if (!u.alive || u.decoy) return false;
      if (u.side !== active) return true;  // the other side is waiting: everything of it is greyed
      if (u.summon || u.auto) return false;  // the summons of the side that plays act by themselves
      if (!u.mow && budget(u) > 0) return false;
      return !options(u).some(function (o) { return o.ok && (targetsOf(u, o).length || hexesOf(u, o).length); });
    };
    // The damage preview of the chosen character or ability, on the health bar of each enemy it can hit, read from left to right: yellow = the damage that is certain (the worst dice: -20 %, no critical hit, every hit blocked),
    // orange = what may come on top of it (the best dice: +20 %, every hit critical, no block). A whole yellow bar is a sure kill; green after the orange part: the health left even with the maximum damage (it cannot be killed).
    // No preview for an ability that deals no damage or whose damage is not clear (summons, zones, lines, redistributions ...).
    const previewDamage = function () {
      units.forEach(function (x) { if (x.pvO) { x.pvO.style.display = "none"; x.pvY.style.display = "none"; x.pvG.style.display = "none"; } });
      if (!sel || !sel.alive || !mine() || seqActive) return;
      const o = options(sel).filter(function (x) { return x.id === (act ? act.id : "atk"); })[0];
      if (!o || !o.ok) return;
      if (act) {
        const sp = o.ab && CULT[o.ab[0]];
        if (!o.ab || (sp && (sp.noDmg || sp.hex || sp.leap || sp.kauyon || sp.mark || sp.self || sp.line || sp.redist || sp.summon || sp.barrage || sp.nob || sp.disp || sp.duel || sp.debuff || sp.pend || sp.possess || sp.dash || sp.chargeAb || sp.charge || sp.swoop || sp.focus || sp.ambush || sp.drach || sp.psyAlly || sp.allyAdj))) return;
      }
      const grab = function (F) { previewForce = F; try { return targetsOf(sel, o); } finally { previewForce = null; } };
      const LO = { dv: -(TV.dmgSpread || 20), crit: false, block: true }, HI = { dv: TV.dmgSpread || 20, crit: true, block: false };
      // every enemy it could hit from where it stands or after a move (the character can walk and attack): for each one the hex that gives the most damage decides what is shown
      const reach = sel.mow ? { cur: 0 } : stepsOf(sel, budget(sel)), saved = { spent: sel.spent, moves: sel.moves }, best = {};
      Object.keys(reach).forEach(function (key) {
        const h = sel.mow ? null : key.split(",").map(Number), c = h && RULES.cell(h[0], h[1]), k0 = reach[key];
        if (h && (!c || c.kind !== 0)) return;
        sel.spent = saved.spent + k0; sel.moves = k0 ? saved.moves + 1 : saved.moves;  // the walk counts for what depends on it
        try {
          const run = function () { return { hi: grab(HI), lo: grab(LO) }; }, r = h ? withPos(sel, h, run) : run();
          r.hi.forEach(function (x) {
            if (x.heal || !(x.dmg > 0) || x.u.side === sel.side) return;
            const l = r.lo.filter(function (y) { return y.u === x.u; })[0], cur = best[x.u.i];
            if (!cur || x.dmg > cur.hi) best[x.u.i] = { u: x.u, hi: x.dmg, lo: l ? l.dmg : 0 };
          });
        } finally { sel.spent = saved.spent; sel.moves = saved.moves; }
      });
      Object.keys(best).forEach(function (k) {
        const b = best[k], t = b.u;
        if (!t.pvO || !t.max) return;
        const low = Math.min(t.hp, b.lo), high = Math.min(t.hp, Math.max(b.hi, low)), W = t.pvW;
        const put = function (el, from, to) { if (to <= from) { el.style.display = "none"; return; } el.style.display = ""; el.setAttribute("x", (1 + W * from / t.max).toFixed(2)); el.setAttribute("width", Math.max(0.6, W * (to - from) / t.max).toFixed(2)); };
        put(t.pvY, 0, low);  // from the left: the certain damage, what may come on top, then the health that stays even in the best case
        put(t.pvO, low, high);
        put(t.pvG, high, t.hp);
      });
    };
    function render() {
      if (seqActive && !seqRender) { endSeq(); $("sb-fx").innerHTML = ""; }
      if ($("sb-auto") && typeof autoLabel === "function") autoLabel();  // the player clicked: the beats stop, the board shows the settled state
      units.forEach(function (u) {
        if (!u.g) return;
        u.g.classList.toggle("tk-sel", u === sel);
        u.g.classList.toggle("gone", !u.alive);
        if (u.ov) u.ov.classList.toggle("gone", !u.alive);
        u.g.classList.toggle("tk-done", isDone(u));
        u.g.classList.toggle("tk-ds", !!(u.ds && u.alive));  // Deep Strike (it has not come down yet): a blue tint on its portrait  // nothing left to do this turn: greyed
        u.g.classList.toggle("tk-target", !!(act && sel && (tgtSet[u.i] || allyHex(u))));  // (a machine of war that casts on itself lights up too)
        if (u.mow) return;
        pos(u.g, home(u));
        if (u.ov) pos(u.ov, home(u));
        u.g.classList.toggle("sb-drag", u.side === active && u.alive);  // only the side whose turn it is can be moved
        u.g.classList.toggle("tk-target", !!(act && sel && (tgtSet[u.i] || allyHex(u))));
        if (u.hpEl) { const pct = u.max ? Math.max(0, Math.min(1, u.hp / u.max)) : 1; u.hpEl.style.transform = "scaleX(" + pct.toFixed(3) + ")"; u.hpEl.setAttribute("fill", pct > 0.5 ? "#34d399" : pct > 0.25 ? "#f2b134" : "#f87171"); }
        if (u.shEl) { const sa = u.shield && round <= u.shield.until && u.shield.amt > 0 ? u.shield.amt : 0; u.shEl.style.display = sa ? "" : "none"; u.shEl.style.transform = "scaleX(" + Math.max(0.04, Math.min(1, u.max ? sa / u.max : 1)).toFixed(3) + ")"; }  // the shield: extra health that cannot be regenerated, a blue bar under the health bar
      });
      previewDamage();
      const TILE = { fire: ["#ff7a1a", "fire"], ice: ["#7dd3fc", "ice"], contam: ["#7bd34a", "poisoned"], despoiled: ["#a855f7", "possessed"] };
      $("sb-tiles").innerHTML = Object.keys(hexfx).filter(function (k) { return hexKind(k.split(",").map(Number)); }).map(function (k) {  // the hex effects on the map: a tint and the effect's icon
        const f = hexfx[k], h = f.h, col = TILE[f.kind], x = cx(h[0]), y = cy(h[0], h[1]), z = R * 0.5;
        return '<polygon class="sb-tile" fill="' + col[0] + '" fill-opacity="0.32" stroke="' + col[0] + '" stroke-width="1.4"' + maskAttr(h[0], h[1]) + ' points="' + hexAt(x, y, 0.94) + '"/><image href="' + fxIcon(col[1]) + '" x="' + (x - z / 2).toFixed(1) + '" y="' + (y - R * 0.86).toFixed(1) + '" width="' + z.toFixed(1) + '" height="' + z.toFixed(1) + '" pointer-events="none"/>';
      }).join("");
      $("sb-tiles").innerHTML += field.filter(function (u) { return u.alive && u.ghost && u.img && u.t; }).map(function (u) {  // Toth's time ghost: his portrait in grey-blue under a blue veil, a faint blue line linking it to him
        const x = cx(u.ghost[0]), y = cy(u.ghost[0], u.ghost[1]), r = R * 0.62, x0 = cx(u.t[0]), y0 = cy(u.t[0], u.t[1]), id = "sbg" + u.i;
        return '<g class="sb-ghost"><line x1="' + x0.toFixed(1) + '" y1="' + y0.toFixed(1) + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="#60a5fa" stroke-opacity="0.28" stroke-width="5" stroke-linecap="round"/>' +
          '<line x1="' + x0.toFixed(1) + '" y1="' + y0.toFixed(1) + '" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="#bfdbfe" stroke-opacity="0.6" stroke-width="1.5" stroke-linecap="round" stroke-dasharray="2 5"/>' +
          '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="#10151c" fill-opacity="0.8"/>' +
          '<clipPath id="' + id + '"><circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (r - 1).toFixed(1) + '"/></clipPath>' +
          '<image href="' + esc(u.img) + '" x="' + (x - r).toFixed(1) + '" y="' + (y - r).toFixed(1) + '" width="' + (2 * r).toFixed(1) + '" height="' + (2 * r).toFixed(1) + '" clip-path="url(#' + id + ')" preserveAspectRatio="xMidYMid slice" opacity="0.7" style="filter: grayscale(1) contrast(1.05)"/>' +
          '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (r - 1).toFixed(1) + '" fill="#3b82f6" fill-opacity="0.5"/>' +
          '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="none" stroke="#93c5fd" stroke-width="2" stroke-opacity="0.9"/><title>Fantôme temporel de ' + esc(u.name) + '</title></g>';
      }).join("");
      $("sb-tiles").innerHTML += field.filter(function (u) { return u.alive && u.foot; }).map(function (u) {  // the other two hexes of a big stationary unit
        return u.foot.map(function (h) { return '<polygon class="sb-zmark" fill="' + (u.side === 0 ? "#4ad1c0" : "#f06b6b") + '" fill-opacity="0.18" stroke="' + (u.side === 0 ? "#4ad1c0" : "#f06b6b") + '" stroke-width="1.4"' + maskAttr(h[0], h[1]) + ' points="' + hexAt(cx(h[0]), cy(h[0], h[1]), 0.94) + '"/>'; }).join("");
      }).join("");
      $("sb-tiles").innerHTML += zmarks.map(function (mk) {  // the zones marked for later: dashed outline with the ability's name
        return mk.hexes.map(function (h) { return '<polygon class="sb-zmark" fill="' + (mk.kind === "mine" ? "#ef4444" : mk.kind === "zone" ? "#a855f7" : "#f59e0b") + '" fill-opacity="0.16" stroke="' + (mk.kind === "mine" ? "#ef4444" : "#f59e0b") + '" stroke-width="1.6" stroke-dasharray="4 3"' + maskAttr(h[0], h[1]) + ' points="' + hexAt(cx(h[0]), cy(h[0], h[1]), 0.94) + '"><title>' + esc(mk.ab[1]) + " (" + esc(mk.by.name) + ')</title></polygon>'; }).join("");
      }).join("");
      zones();
      $("sb-hexes").innerHTML = Object.keys(hexSet).map(function (k) { const h = k.split(",").map(Number); return '<polygon class="rp-z rp-z-act" data-c="' + h[0] + '" data-r="' + h[1] + '"' + maskAttr(h[0], h[1]) + ' points="' + hexAt(cx(h[0]), cy(h[0], h[1]), 0.94) + '"/>'; }).join("");
      syncStatuses();
      const panels = unitPanel();
      $("sb-unit").innerHTML = panels[0];
      $("sb-stats").innerHTML = panels[1];
      const o = act && sel && options(sel).filter(function (x) { return x.id === act.id; })[0];
      $("sb-tip").hidden = !o;
      if (o) $("sb-tip").innerHTML = tipHtml(o);
      $("sb-turnlab").textContent = turnText(round, active);
      const bh = vb[3] * 0.075, bl = vb[3] * 0.007, bx = vb[0].toFixed(1), bw = vb[2].toFixed(1);  // the band along the map: green along its bottom edge on our turn, red along its top edge on theirs (drawn in the picture's own frame)
      $("sb-turnband").innerHTML = active === 0 ? '<rect x="' + bx + '" y="' + (vb[1] + vb[3] - bh).toFixed(1) + '" width="' + bw + '" height="' + bh.toFixed(1) + '" fill="url(#sbBandG)"/><rect x="' + bx + '" y="' + (vb[1] + vb[3] - bl).toFixed(1) + '" width="' + bw + '" height="' + bl.toFixed(1) + '" fill="#34d399" fill-opacity="0.85"/>'
        : '<rect x="' + bx + '" y="' + vb[1].toFixed(1) + '" width="' + bw + '" height="' + bh.toFixed(1) + '" fill="url(#sbBandR)"/><rect x="' + bx + '" y="' + vb[1].toFixed(1) + '" width="' + bw + '" height="' + bl.toFixed(1) + '" fill="#f06b6b" fill-opacity="0.85"/>';
      let r = 1, side = 0;
      $("sb-log").innerHTML = '<li data-k="0" class="rp-turn' + (cur === 0 ? " is-cur" : "") + '"><button type="button">' + turnText(1, 0) + "</button></li>" + steps.map(function (m, i) {
        let text;
        if (m.k === "end") {
          if (side === 0) side = 1; else { side = 0; r++; }
          text = turnText(r, side) + autoText(m.auto);  // what acts by itself at the start of the turn
        }
        else if (m.k === "atk") {
          const made = (m.adds || []).filter(function (a) { return !a.decoy; }), deco = (m.adds || []).filter(function (a) { return a.decoy; }).length;
          const sums = made.length || deco ? "invoque " + made.map(function (a) { return esc(a.name); }).join(", ") + (deco ? (made.length ? " et " : "") + deco + " leurre" + (deco > 1 ? "s" : "") : "") : "";
          text = esc(m.u.name) + " · " + esc(m.label) + (m.dmg > 0 ? " → " + esc(m.tgt.name) + ((m.guards || []).some(function (x) { return x.n; }) ? "" : " <b>−" + num(m.dmg) + "</b>") + (m.hits > 1 ? " (" + m.hits + " coups de " + num(m.per) + ")" : "") + diceText(m) : m.tgt !== m.u ? " → " + esc(m.tgt.name) : "") + (sums ? " · " + sums : "") +
            (m.more || []).map(function (x) { return " · " + (x.by ? esc(x.by.name) + " (" + esc(x.label) + ")" : esc(x.label)) + " → " + esc(x.tgt.name) + " <b>−" + num(x.dmg) + "</b>" + (x.hits > 1 ? " (" + x.hits + " coups)" : ""); }).join("") +
            (m.moves || []).map(function (x) { return " · " + esc(x.u.name) + " se déplace"; }).join("") + (m.mk && m.mk.length ? " · marque " + m.mk.reduce(function (a, x) { return a + x.hexes.length; }, 0) + " hexagone" + (m.mk.reduce(function (a, x) { return a + x.hexes.length; }, 0) > 1 ? "s" : "") : "") + (m.pend && m.tgt ? " (tir au début de son prochain tour)" : "") + hxText(m.hx) + autoText(m.react) + guardText(m.guards) + (m.heals && m.heals.length ? " · soigne " + m.heals.map(function (h) { return esc(h.u.name) + " +" + num(h.amt); }).join(", ") : "") + autoText(m.autoNow);
        }
        else text = esc(m.u.name) + (m.tp ? (m.tpm ? " se téléporte près de la marque" : " se téléporte (assaut en profondeur)") : " se déplace") + autoText(m.trig);
        text += regenText(m.regen) + boomText(m.booms) + deathText(m.deaths, m);
        return '<li data-k="' + (i + 1) + '" class="' + (m.k === "end" ? "rp-turn " : "") + (cur === i + 1 ? "is-cur" : "") + (i >= cur ? " sb-later" : "") + '"><button type="button">' + text + "</button></li>";
      }).join("");
      const on = $("sb-log").querySelector("li.is-cur"), box = $("sb-log");
      if (on) box.scrollTop = on.offsetTop - box.clientHeight / 2 + on.clientHeight / 2;
      const sk = $("sb-seek");
      sk.max = steps.length; sk.value = cur;
      $("sb-reset").disabled = !steps.length;
      $("sb-prev").disabled = cur === 0;
      $("sb-next").disabled = cur >= steps.length;
    }
    // ---- an action made of many actions (Waaagh!: the buffs, the summons that appear and hit, the passive's second attack ...) is played one beat at a time: the board first shows the state before it,
    // then each hit, each summon, each heal comes in turn (a beam, the figure, the health bar moving); the final state is the one the step settles to ----
    let seqTimers = [], seqActive = false, seqRender = false;
    const endSeq = function () { seqTimers.forEach(clearTimeout); seqTimers = []; seqActive = false; };
    const snapshot = function () { const o = {}; units.forEach(function (x) { o[x.i] = { t: x.t ? x.t.slice() : null, hp: x.hp, alive: x.alive }; }); return o; };
    const hexXY = function (h) { return [cx(h[0]), cy(h[0], h[1])]; };
    const hasBeats = function (m) {
      if (!m) return false;
      const recs = (m.auto || []).concat(m.autoNow || []).concat(m.react || []).concat(m.trig || []);
      const extra = (m.more || []).length + (m.adds || []).filter(function (a) { return !a.decoy; }).length + recs.length + (m.guards || []).length + recs.reduce(function (a, r) { return a + (r.guards || []).length; }, 0) + (m.booms || []).length + (m.regen || []).filter(function (r) { return r.amt > 0; }).length + (m.heals || []).length;
      return m.k === "atk" ? extra > 0 && (m.dmg > 0 || extra > 1) : extra > 1;
    };
    function overkillFx(list) {  // "Overkill" in red rises from the centre of the avatar of a unit that is exterminated, and fades, like the states that fly off
      const fx = $("sb-fx");
      (list || []).forEach(function (u) {
        if (!u.t || u.decoy) return;
        const xy = home(u);
        fx.insertAdjacentHTML ? fx.insertAdjacentHTML("beforeend", '<text class="sb-overkill" x="' + xy[0].toFixed(1) + '" y="' + xy[1].toFixed(1) + '" text-anchor="middle">Overkill</text>') : (fx.innerHTML += '<text class="sb-overkill" x="' + xy[0].toFixed(1) + '" y="' + xy[1].toFixed(1) + '" text-anchor="middle">Overkill</text>');
      });
      seqTimers.push(setTimeout(function () { Array.prototype.slice.call(fx.querySelectorAll ? fx.querySelectorAll(".sb-overkill") : []).forEach(function (e) { if (e.parentNode) e.parentNode.removeChild(e); }); }, 1500));
    }
    function playBeats(m, pre) {
      endSeq(); seqActive = true; units.forEach(function (x) { x.overShown = false; });
      const fx = $("sb-fx"), vis = {}, hp = {}, gap = 620 / 4 / speed;  // the beats of one action go four times faster than the pace of the steps (x4 on its own)
      const place = function (x, h) { if (!x.g || x.mow || !h) return; vis[x.i] = h; const xy = hexXY(h); pos(x.g, xy); if (x.ov) pos(x.ov, xy); };
      const bar = function (x) {
        if (!x.hpEl) return;
        const pct = x.max ? Math.max(0, Math.min(1, hp[x.i] / x.max)) : 1;
        x.hpEl.style.transform = "scaleX(" + pct.toFixed(3) + ")"; x.hpEl.setAttribute("fill", pct > 0.5 ? "#34d399" : pct > 0.25 ? "#f2b134" : "#f87171");
      };
      const show = function (x, on) { if (!x.g) return; x.g.classList.toggle("gone", !on); if (x.ov) x.ov.classList.toggle("gone", !on); };
      // the state before the action
      units.forEach(function (x) {
        const p = pre[x.i]; if (!x.g || x.mow) return;
        hp[x.i] = p ? p.hp : x.hp;
        if (p && p.t) place(x, p.t); else vis[x.i] = x.t;
        show(x, !!(p && p.alive)); bar(x);
        x.g.classList.remove("tk-hit", "tk-act");
      });
      fx.innerHTML = "";
      const at = function (x) { return vis[x.i] ? hexXY(vis[x.i]) : home(x); };
      const beam = function (from, to, text, cls) {  // a beam from one token to another and the figure over the target
        const a = at(from), t = at(to);
        fx.innerHTML = (from !== to ? '<line class="rp-beam" x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + t[0].toFixed(1) + '" y2="' + t[1].toFixed(1) + '"/>' : "") +
          '<text class="rp-fig' + (cls ? " " + cls : "") + '" x="' + t[0].toFixed(1) + '" y="' + (t[1] - R * 0.55).toFixed(1) + '" text-anchor="middle">' + text + "</text>";
        units.forEach(function (x) { if (x.g) x.g.classList.remove("tk-hit", "tk-act"); });
        if (to.g) to.g.classList.add("tk-hit"); if (from.g && from !== to) from.g.classList.add("tk-act");
      };
      const hit = function (from, to, dmg, keep) {  // keep: a guard that falls stays in view for a beat (it disappears in the next one)
        if (!from || !to || !(dmg > 0)) return;
        beam(from, to, "\u2212" + num(dmg));
        hp[to.i] = Math.max(0, (hp[to.i] || 0) - dmg); bar(to);
        if (hp[to.i] <= 0 && !to.alive && !keep) { show(to, false); if ((m.over || []).indexOf(to) >= 0 && !to.overShown) { to.overShown = true; overkillFx([to]); } }
      };
      const healed = function (x, amt) { if (!x || !(amt > 0)) return; beam(x, x, "+" + num(amt), "rp-heal"); hp[x.i] = Math.min(x.max, (hp[x.i] || 0) + amt); bar(x); };
      const frame = window.requestAnimationFrame || function (f) { return setTimeout(f, 32); };
      frame(function () { frame(function () { svgBox.classList.remove("sb-notrans"); }); });  // two frames later the beats move and fade normally
      const beats = [];
      const add = function (fn, w) { beats.push({ fn: fn, w: w || 1 }); };  // w: how many beats it lasts (the guards' hits are given more time, one at a time)
      // a guard (Celestine's Geminae, Kell ...) comes in, then takes the hit in the place of its owner: one beat each, the owner only keeps what the guards did not take
      const strikeBeat = function (by, tgt, dmg, gl) {  // one attack: for each impact (a guard that comes in, takes it, falls; then the next one; then the owner) a beat or three
        const ents = impactsOf(gl, tgt);
        let rest = dmg;
        ents.forEach(function (e) {
          const guard = e.g !== tgt;
          if (e.fresh) add(function () {
            const g = e.g; if (g.t) place(g, g.t); show(g, true); hp[g.i] = g.max; bar(g);
            if (e.from.guardSwap && e.from.t) place(e.from, e.from.t);  // Kell and Creed swap hexes
            if (g.g) { g.g.classList.add("tk-new"); setTimeout(function () { g.g.classList.remove("tk-new"); }, 500); }
          }, 3);
          const d = e.dmg !== undefined ? e.dmg : dmg;
          if (e.hit && d > 0) { rest -= d; add(function () { hit(by, e.g, d, guard && e.died); }, guard ? 3 : 2); }
          if (guard && e.died) add(function () { fx.innerHTML = ""; show(e.g, false); }, 3);  // the guard that fell goes away
        });
        if (rest > 0) add(function () { hit(by, tgt, rest); });
      };
      if (m.k === "mv" && m.to) add(function () { place(m.u, m.to); }, 3);  // a plain walk is the first beat: the character walks, and what watches reacts once it has arrived
      (m.moves || []).forEach(function (mv) { add(function () { place(mv.u, mv.to); }); });  // the moves of the action (a charge, a pull, a swap)
      if (m.k === "atk" && m.tgt && m.tgt !== m.u) strikeBeat(m.u, m.tgt, m.dmg > 0 ? m.dmg : 0, m.guards);
      (m.more || []).forEach(function (x) { strikeBeat(x.by || m.u, x.tgt, x.dmg, m.guards); });
      (m.adds || []).filter(function (a) { return !a.decoy; }).forEach(function (a) { add(function () { if (a.t) place(a, a.t); show(a, a.alive); if (a.g) { a.g.classList.add("tk-new"); setTimeout(function () { a.g.classList.remove("tk-new"); }, 500); } hp[a.i] = a.max; bar(a); }); });
      (m.heals || []).forEach(function (h) { add(function () { healed(h.u, h.amt); }); });
      const recs = (m.react || []).concat(m.trig || []).concat(m.auto || []).concat(m.autoNow || []);
      recs.forEach(function (r) {
        if (r.u && r.u.alive !== undefined && pre[r.u.i] && !pre[r.u.i].alive && r.u.alive) add(function () { if (r.u.t) place(r.u, r.u.t); show(r.u, true); hp[r.u.i] = r.u.max; bar(r.u); });  // a unit that comes in to play
        if (r.to) add(function () { place(r.u, r.to); });
        if (r.tgt && r.dmg > 0) strikeBeat(r.u, r.tgt, r.dmg, r.guards);
        (r.more || []).forEach(function (x) { strikeBeat(x.by || r.u, x.tgt, x.dmg, r.guards); });
      });
      (m.booms || []).forEach(function (x) { add(function () { hit(x.from, x.tgt, x.dmg); }); });
      (m.regen || []).filter(function (r) { return r.amt > 0 && !r.shield && !r.shielded && !r.spawn && !r.revive && !r.flee; }).forEach(function (r) { add(function () { healed(r.u, r.amt); }); });
      let when = 100;
      beats.forEach(function (b) { seqTimers.push(setTimeout(b.fn, when)); when += b.w * gap; });
      seqTimers.push(setTimeout(function () {  // the end: the settled state, everything in its place
        seqRender = true; render(); seqRender = false; seqActive = false; fx.innerHTML = "";
        units.forEach(function (x) { if (x.g) x.g.classList.remove("tk-hit", "tk-act"); });
        reviveFx(m);
      }, when + 350));
    }
    const go = function (k) {
      const before = cur, back = Math.max(0, Math.min(steps.length, k));
      if (back < before) salts[back] = (salts[back] || 0) + 1;
      const forward = back === before + 1 && steps[back - 1] ? snapshot() : null;  // the state before the step that is played
      endSeq();
      cur = back; settle(cur);  // the step is settled first: what reacts to it (the Sentinels, the guards, the summons) is only known once it has been played
      const seq = !!forward && hasBeats(steps[back - 1]);
      if (seq) svgBox.classList.add("sb-notrans");  // the settled state is drawn only to be replaced at once by the state before the action: no fade, no pop for that
      act = null; tgtSet = {}; hexSet = {}; render();
      const m = cur === before + 1 ? steps[cur - 1] : null;  // one step forward (a launch, Suiv., the player): its effects are played
      if (seq) { flash(null); playBeats(m, forward); }
      else { flash(m); reviveFx(m); if (m && m.over && m.over.length) overkillFx(m.over); }
    };
    const stop = function () { if (timer) { clearInterval(timer); timer = null; } $("sb-play").innerHTML = I_PLAY + '<span class="rp-lab"> Lecture</span>'; };
    let tgtSet = {}, hexSet = {};  // the characters the chosen action can hit (by index)
    const push = function (step) { step.salt = salts[cur] || 0; steps.length = cur; steps.push(step); go(steps.length); };

    // ---- the zones of the chosen character (rules in hex-rules.js): the hexes it can reach, and those the other side can hit after moving ----
    const RULES = window.HexRules ? window.HexRules(d.cells) : null;
    let tpNow = {};  // the hexes a unit in Deep Strike mode can teleport to
    let reachNow = {};  // reachNow: "c,r" -> cost, the hexes the chosen character can move to now
    function zones() {
      const layer = $("sb-zone");
      layer.innerHTML = ""; reachNow = {};
      if (!RULES || !sel || sel.mow || !sel.alive) return;
      const occ = {};
      live().forEach(function (u) { footOf(u).forEach(function (h) { occ[h[0] + "," + h[1]] = u; }); });
      const reachOf = function (u, mov) {
        const r = u.rules;
        return RULES.reach({ from: u.t, mov: mov, fly: !!r.fl, free: !!r.us || !!fxOn(u, "howl"),
          enemy: function (c, rr) { const o = occ[c + "," + rr]; return !!o && o.side !== u.side; },
          any: function (c, rr) { const o = occ[c + "," + rr]; return !!o && o !== u; }, stop: stopFor(u) });
      };
      if (sel.side !== active) {  // a character of the side that is not playing: every hex it can hit, after moving, with an attack or an ability (red)
        const hit = {};
        reachOf(sel, mvOf(sel)).forEach(function (p) { const rngA = hitReachAt(sel, adjFoeAt(sel, [p.c, p.r])); if (rngA > 0) RULES.hits([p.c, p.r], rngA, !!sel.rules.id).forEach(function (t) { hit[t[0] + "," + t[1]] = 1; }); });
        let h = "";
        d.cells.forEach(function (c) { if (hit[c[0] + "," + c[1]] && c[4] === 0) h += '<polygon class="rp-z rp-z-dg"' + maskAttr(c[0], c[1]) + ' points="' + hexAt(cx(c[0]), cy(c[0], c[1]), 0.94) + '"/>'; });
        layer.innerHTML = h;
        return;
      }
      const go = reachOf(sel, budget(sel)), danger = {};
      go.forEach(function (p) { if (p.k) reachNow[p.c + "," + p.r] = p.k; });
      tpNow = {};
      if (sel.ds && !sel.acted && sel.spent === 0) {  // Deep Strike: any free hex of the board that is not next to an enemy (then no ranged attack this turn)
        const adjFoe = function (c, rr) { return live().some(function (x) { return x.side !== sel.side && RULES.dist([c, rr], x.t) === 1; }); };
        d.cells.forEach(function (c) {
          const k = c[0] + "," + c[1];
          if (c[4] !== 0 || occ[k] || reachNow[k] !== undefined || adjFoe(c[0], c[1])) return;
          reachNow[k] = mvOf(sel); tpNow[k] = "ds";
        });
      }
      const tpm = fxOn(sel, "tpm");  // Titanhammer: the marked hex and the ones around it can be reached by the units it chose
      if (tpm && sel.moves === 0 && sel.spent === 0) [tpm.hex].concat(RULES.around(tpm.hex[0], tpm.hex[1])).forEach(function (h) {
        const k = h[0] + "," + h[1], c = RULES.cell(h[0], h[1]);
        if (c && c.kind === 0 && !occ[k] && reachNow[k] === undefined) { reachNow[k] = mvOf(sel); tpNow[k] = "tpm"; }
      });
      live().forEach(function (u) {
        if (u.side === sel.side) return;
        reachOf(u, mvOf(u)).forEach(function (p) { const rng = hitReachAt(u, adjFoeAt(u, [p.c, p.r])); if (rng > 0) RULES.hits([p.c, p.r], rng, !!u.rules.id).forEach(function (t) { danger[t[0] + "," + t[1]] = 1; }); });
      });
      let html = "", exposed = 0, n = 0;
      d.cells.forEach(function (c) { if (danger[c[0] + "," + c[1]] && c[4] === 0) html += '<polygon class="rp-z rp-z-dg"' + maskAttr(c[0], c[1]) + ' points="' + hexAt(cx(c[0]), cy(c[0], c[1]), 0.94) + '"/>'; });
      Object.keys(tpNow).forEach(function (k) { const h = k.split(",").map(Number); go.push({ c: h[0], r: h[1], k: reachNow[k], tp: true }); });
      go.forEach(function (p) {
        const hot = !!danger[p.c + "," + p.r], own = p.k === 0;
        if (!own) { n++; if (hot) exposed++; }
        html += '<polygon class="rp-z rp-z-mv' + (hot ? " rp-z-hot" : "") + (own ? " rp-z-own" : "") + (p.tp ? " rp-z-tp" : "") + '" data-c="' + p.c + '" data-r="' + p.r + '"' + maskAttr(p.c, p.r) + ' points="' + hexAt(cx(p.c), cy(p.c, p.r), 0.94) + '"/>';
      });
      layer.innerHTML = html;
    }
    // a move: the chosen character goes to a hex it can reach (what it spends of its movement is kept until the end of the turn)
    const moveTo = function (u, c, r) {
      const cost = reachNow[c + "," + r];
      if (!cost || !mine() || u !== sel) return false;
      push({ k: "mv", u: u, from: u.t.slice(), to: [c, r], cost: cost, tp: !!tpNow[c + "," + r], tpm: tpNow[c + "," + r] === "tpm" });
      return true;
    };
    // one ability-style hit series (an average figure of the game's configuration: it ignores the attacker's bonuses): {tot, per, hits}
    const abilityHit = function (u, t, avg, profile, hits, pierce) {
      return damageOf(u, t, { ab: ["", "", "a", (function () { const o = {}; o[rar] = avg; return o; })(), "Ranged", profile, hits], pierce: pierce || 0 }, u.mow ? 3 : RULES.dist(u.t, t.t));
    };
    const avgOf = function (vals, suf) { return ((vals["minDmg" + suf] || 0) + (vals["maxDmg" + suf] || 0)) / 2; };
    const foes = function (u) { return live().filter(function (x) { return x.side !== u.side && !x.ds; }); };  // a unit in Deep Strike mode cannot be targeted
    // the other hits of an action: the splash of Plague Wind (the target, the enemies next to it, then the enemies next to those), the second attack that follows a normal attack
    // (Light Im Up: the same enemy, the hits left when it falls go to another within 3; The Betrayer: an adjacent enemy), the heal of Revitalizing Malignancy
    function extras(u, o, t, main) {
      const more = [], vals = (o.ab && o.ab[8] && o.ab[8][rar]) || {};
      if (o.ab && AOE[o.ab[0]]) AOE[o.ab[0]](u, o, t, vals).forEach(function (x) { more.push(x); });  // the area of the ability
      if (o.ab && CULT[o.ab[0]] && CULT[o.ab[0]].adj) {  // up to N units next to the target take the same hit
        const nMax = parseInt(vals.maxAdjacentTargets, 10) || 0;
        foes(u).filter(function (e) { return e !== t && RULES.dist(t.t, e.t) === 1; }).sort(function (x, y) { return RULES.dist(u.t, x.t) - RULES.dist(u.t, y.t); }).slice(0, nMax).forEach(function (e) {
          const r = abilityHit(u, e, avgOf(vals, ""), o.ab[5], o.ab[6] || 1); more.push({ tgt: e, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: o.name });
        });
      }
      if (o.ab && CULT[o.ab[0]] && CULT[o.ab[0]].hitAll) {  // Stormcaller: every enemy on the 7 covered hexes takes the hits (the target's own are the main hit)
        const cover = [t.t].concat(RULES.around(t.t[0], t.t[1]));
        foes(u).filter(function (e) { return e !== t && cover.some(function (h) { return h[0] === e.t[0] && h[1] === e.t[1]; }); }).forEach(function (e) {
          const r = abilityHit(u, e, avgOf(vals, ""), o.ab[5], parseInt(vals.nrOfHits, 10) || o.ab[6] || 1); more.push({ tgt: e, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: o.name });
        });
      }
      if (o.ab && o.ab[0] === "KillMaimBurn") {  // three attacks on the same target until it falls, then on the weakest in reach (the eliminations come first)
        const prof = o.ab[10] || {}, hp = {}, left = function (e) { return hp[e.i]; };
        foes(u).forEach(function (e) { hp[e.i] = e.hp; });
        hp[t.i] -= main;
        let cur = t;
        [["_2", 1], ["_3", 2]].forEach(function (leg) {
          if (!cur || left(cur) <= 0) cur = foes(u).filter(function (e) { return left(e) > 0 && RULES.dist(u.t, e.t) <= leg[1]; }).sort(function (x, y) { return left(x) - left(y); })[0];
          if (!cur) return;
          const n = parseInt(vals["nrOfHits" + leg[0]], 10) || 1, r = abilityHit(u, cur, avgOf(vals, leg[0]), prof["damageProfile" + leg[0]] || o.ab[5], n);
          more.push({ tgt: cur, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: o.name });
          hp[cur.i] -= r.tot;
        });
      }
      if (o.ab && CULT[o.ab[0]] && CULT[o.ab[0]].tiers) {
        const t1 = [t], t2 = foes(u).filter(function (e) { return e !== t && RULES.dist(t.t, e.t) === 1; });
        const t3 = foes(u).filter(function (e) { return e !== t && t2.indexOf(e) < 0 && t2.some(function (x) { return RULES.dist(x.t, e.t) === 1; }); });
        [[t2, "_2"], [t3, "_3"]].forEach(function (g) {
          g[0].forEach(function (e) { const r = abilityHit(u, e, avgOf(vals, g[1]), o.ab[5], 1); more.push({ tgt: e, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: o.name }); });
        });
      }
      if (!o.ab && RULES.dist(u.t, t.t) === 1 && fxOn(u, "cord")) { const cv = fxOn(u, "cord").v, r = abilityHit(u, t, avgOf(cv, "_2"), "DirectDamage", parseInt(cv.nrOfHits_2, 10) || 2); more.push({ tgt: t, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: "Griffe-câble" }); }  // Exitor-Rho: more direct hits on his next attacks
      if (!o.ab && RULES.dist(u.t, t.t) === 1 && fxOn(u, "drach")) { const dv = fxOn(u, "drach").v, e2 = foes(u).filter(function (e) { return RULES.dist(u.t, e.t) === 1 && (e !== t || healthAfter(t, main) > 0); }).sort(function (a, b2) { return a.hp - b2.hp; })[0]; if (e2) { const r = abilityHit(u, e2, avgOf(dv, ""), "Piercing", parseInt(dv.nrOfHits, 10) || 3); more.push({ tgt: e2, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: "Drachnyen" }); } }  // Abaddon: a second melee attack after each normal one
      if (!o.ab && RULES.dist(u.t, t.t) === 1 && fxOn(u, "infusion")) { const fi = fxOn(u, "infusion").v, r = abilityHit(u, t, fi.dmg || 0, "Toxic", parseInt(fi.nrOfHits, 10) || 1); more.push({ tgt: t, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: "Infusion impie" }); }  // Foul Infusion: extra toxic hits on melee attacks
      if (!o.ab) {  // a normal attack: the extra hits the allies' auras and its own passives add
        const ranged = RULES.dist(u.t, t.t) > 1;
        const scm = abOf(u, "SpecialIssueCombiMelta"), ffd = abOf(u, "FuryFromTheDelve"), sqh = abOf(u, "SquigHound"), flm = abOf(u, "FleshmetalGuns");
        const dd0 = RULES.dist(u.t, t.t);
        if (scm && dd0 === 2) { const r = abilityHit(u, t, avgOf(scm, ""), "Bolter", parseInt(scm.nrOfHits, 10) || 1); more.push({ tgt: t, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: abName(u, "SpecialIssueCombiMelta") }); }  // exactly 2 hexes: more hits
        if (ffd && t.hp <= t.max * (parseInt(ffd.hpPct, 10) || 50) / 100 && healthAfter(t, main) > 0) { const r = abilityHit(u, t, avgOf(ffd, ""), "Eviscerate", parseInt(ffd.nrOfHits, 10) || 2); more.push({ tgt: t, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: abName(u, "FuryFromTheDelve") }); }
        if (sqh) { const r = abilityHit(u, t, avgOf(sqh, ""), "Physical", parseInt(sqh.nrOfHits, 10) || 2); more.push({ tgt: t, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: abName(u, "SquigHound") }); }  // Snotflogga: more physical hits
        if (flm && dd0 > 1) { const k = (round - 1) % 3, suf = ["", "_2", "_3"][k], r = abilityHit(u, t, avgOf(flm, suf), ["Melta", "Flame", "HeavyRound"][k], parseInt(flm["nrOfHits" + suf], 10) || 2); more.push({ tgt: t, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: ["Malveillance concentrée", "Salve désastreuse", "Grêle du warp"][k] }); }  // Volk: the effect of the round
        const rr = abOf(u, "RighteousRepugnance"), bs = abOf(u, "Boltstorm"), fa2 = abOf(u, "FireOfAbsolution"), vh = abOf(u, "VisionsOfHeresy");
        if (rr && !ranged) [t].concat(foes(u).filter(function (e) { return e !== t && RULES.dist(e.t, t.t) === 1 && RULES.dist(e.t, u.t) === 1; })).forEach(function (e) {  // Morvenn: intensity hits on the target and on the enemies next to both of them
          const r = abilityHit(u, e, avgOf(rr, ""), "Power", parseInt(rr.nrOfHits, 10) || 3); more.push({ tgt: e, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: abName(u, "RighteousRepugnance") });
        });
        if (bs && ranged) [t].concat(foes(u).filter(function (e) { return e !== t && RULES.dist(e.t, t.t) === 1 && RULES.dist(e.t, u.t) <= weaponReach(u); })).forEach(function (e) {  // Burchard: bolter hits on the target and its neighbours in range, which are pinned
          const r = abilityHit(u, e, avgOf(bs, ""), "Bolter", parseInt(bs.nrOfHits, 10) || 3); more.push({ tgt: e, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: abName(u, "Boltstorm"), pinIt: true });
        });
        if (fa2 && ranged) adjUnits(t.t, u).filter(function (e) { return e !== t; }).forEach(function (e) {  // Retributor: flame hits on every unit next to the target
          const r = abilityHit(u, e, fa2.dmg || 0, "Flame", parseInt(fa2.nrOfHits, 10) || 3); more.push({ tgt: e, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: abName(u, "FireOfAbsolution") });
        });
        if (vh && healthAfter(t, main) >= 0) {  // Lucien: a second attack on an enemy within 2
          const e2 = foes(u).filter(function (e) { return RULES.dist(u.t, e.t) <= (parseInt(vh.range, 10) || 2) && (e !== t || healthAfter(t, main) > 0); }).sort(function (a, b2) { return a.hp - b2.hp; })[0];
          if (e2) { const r = abilityHit(u, e2, avgOf(vh, ""), "Bolter", parseInt(vh.nrOfHits, 10) || 2); more.push({ tgt: e2, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: abName(u, "VisionsOfHeresy") }); }
        }
        aurasOn(u, u.t).forEach(function (a) {
          const v = a.v, ab = (a.e.rules.ab || []).filter(function (x) { return x[0] === a.id; })[0] || [];
          if ((a.id === "InfernalPacts" && (ranged || u.tset.Daemon)) || (a.id === "ExplosiveMaladies" && (ranged || u.rules.al === "Chaos"))) {
            const avg = a.id === "InfernalPacts" ? avgOf(v, "") : v.extraDmg, r = abilityHit(u, t, avg, ab[5] || (a.id === "InfernalPacts" ? "Psychic" : "Blast"), parseInt(v.nrOfHits, 10) || 1);
            more.push({ tgt: t, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: ab[1] || a.id });
          }
        });
        const fs = live().filter(function (x) { return x.side === u.side && (x.rules.ab || []).some(function (a) { return a[0] === "WayOfTheShortBlade"; }); })[0];
        if (fs && u.rules.fa === "Tau" && RULES.dist(u.t, t.t) === 1 && (fs === u || RULES.dist(u.t, fs.t) <= 2) && healthAfter(t, main) > 0) {  // Farsight: a melee attack of a T'au within 2 is followed by a ranged one on the same unit
          const rw = (u.rules.wp || []).filter(function (w) { return w[0] > 1; })[0];
          if (rw) { const r = damageOf(u, t, { w: rw }, 1); more.push({ tgt: t, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: "Voie de la lame courte" }); }
        }
        (u.rules.ab || []).forEach(function (a) {
          if (a[0] !== "CyclicIonBlaster") return;  // Re'vas: every attack adds 3 hits, more against a marked or mechanical target
          const v = (a[8] && a[8][rar]) || {}, bonus = t.marked || t.tset.Mechanical ? v.extraDmg || 0 : 0, r = abilityHit(u, t, avgOf(v, "") + bonus, a[5], parseInt(v.nrOfHits, 10) || 3);
          more.push({ tgt: t, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: a[1] });
        });
        const fg = abOf(u, "CalibaniteGreatsword");
        if (fg && u.stance === 1) foes(u).filter(function (e) { return e !== t && RULES.dist(e.t, u.t) === 1 && RULES.dist(e.t, t.t) === 1; }).forEach(function (e) {  // sweeping stance: every enemy next to both Forcas and his target takes intensity hits
          const r = abilityHit(u, e, avgOf(fg, ""), "Power", parseInt(fg.nrOfHits_2, 10) || 3); more.push({ tgt: e, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: "Posture de balayage" });
        });
        (u.rules.ab || []).forEach(function (a) {
          const v = (a[8] && a[8][rar]) || {}, n = parseInt(v.nrOfHits, 10) || a[6] || 1;
          if (a[0] === "LightImUp" || a[0] === "TheBetrayer") {
            const alive = healthAfter(t, main) > 0, nearby = function (d) { return foes(u).filter(function (e) { return e !== t && RULES.dist(u.t, e.t) <= d; }).sort(function (x, y) { return RULES.dist(u.t, x.t) - RULES.dist(u.t, y.t); })[0]; };
            let tg = a[0] === "LightImUp" ? (alive ? t : nearby(3)) : (RULES.dist(u.t, t.t) === 1 && alive ? t : foes(u).filter(function (e) { return RULES.dist(u.t, e.t) === 1 && e !== t; })[0]);  // the same enemy; if it fell, one within 3 (the nearest here)
            if (!tg) return;  // nothing left to hit
            const left = tg === t ? healthAfter(t, main) : tg.hp, r = abilityHit(u, tg, avgOf(v, ""), a[5], n), need = Math.max(1, Math.ceil(left / Math.max(1, r.per))), first = Math.min(n, need);
            more.push({ tgt: tg, dmg: Math.round(r.per * first), hits: first, per: Math.round(r.per), label: a[1] });
            if (a[0] === "LightImUp" && n > first) {  // the hits left after the target falls go to another enemy within 3
              const other = foes(u).filter(function (e) { return e !== tg && RULES.dist(u.t, e.t) <= 3; }).sort(function (x, y) { return RULES.dist(u.t, x.t) - RULES.dist(u.t, y.t); })[0];
              if (other) { const r2 = abilityHit(u, other, avgOf(v, ""), a[5], n - first); more.push({ tgt: other, dmg: Math.round(r2.per * (n - first)), hits: n - first, per: Math.round(r2.per), label: a[1] }); }
            }
          }
        });
      }
      return more;
    }
    function healsOf(u, o) {  // Revitalizing Malignancy: the caster and its adjacent allies, more for the Chaos units, none for the Imperial ones, none for the Mechanical ones
      const v = (o.ab[8] && o.ab[8][rar]) || {};
      return live().filter(function (x) { return x.side === u.side && (x === u || RULES.dist(u.t, x.t) === 1) && !x.tset.Mechanical; })
        .map(function (x) { return { u: x, amt: Math.min(x.max - x.hp, x.rules.al === "Imperial" ? 0 : (v.hpToHeal || 0) + (x.rules.al === "Chaos" ? v.hpToHeal_2 || 0 : 0)) }; }).filter(function (h) { return h.amt > 0; });  // what is missing at most
    }
    // a pull or a push of 1 hex (Lash of Torment, Grapnel Launcher, Mortis Round): the unit goes to a free adjacent hex one step nearer to / farther from the caster, over any elevation but not through a
    // wall; a Big Target or an Immune unit cannot be displaced; with no free hex around at all, the others take 20 % of their maximum health instead
    function displaceOf(u, t, kind) {
      if (t.tset.BigTarget || t.tset.Immune) return null;
      const dd = RULES.dist(u.t, t.t);
      if (kind === "pull" && dd <= 1) return { to: null, hurt: 0 };  // already adjacent: it stays
      const taken = {};
      live().forEach(function (x) { footOf(x).forEach(function (h) { taken[h[0] + "," + h[1]] = 1; }); });
      const free = RULES.around(t.t[0], t.t[1]).filter(function (h) { const c = RULES.cell(h[0], h[1]); return c && c.kind === 0 && !taken[h[0] + "," + h[1]]; });
      const ok = free.filter(function (h) { return RULES.dist(u.t, h) === (kind === "pull" ? dd - 1 : dd + 1); });
      if (ok.length) return { to: ok[0], hurt: 0 };
      return free.length ? { to: null, hurt: 0 } : { to: null, hurt: Math.round(0.2 * t.max) };
    }
    // ---- the machines of war: they stay on their platform, cannot attack, defend or heal; once per turn one of their two abilities, with the game's recharge (no ammunition here), aimed anywhere on the board ----
    // Each entry: ally (aims at an allied unit), hex (aims at a hex: hexes() lists them), plan / hexPlan return what the action does: {main, more, hx, fx, adds, heals, buff, mark, pend, mk, deploy}
    const vals_ = function (o) { return (o.ab[8] && o.ab[8][rar]) || {}; };
    const nI = function (x, dflt) { return parseInt(x, 10) || dflt; };
    const vOf = function (o) { return (o.ab[8] && o.ab[8][rar]) || {}; };
    const mh = function (u, e, raw, prof, n, label, pierce) { const r = abilityHit(u, e, raw, prof, n, pierce); return { tgt: e, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: label, prof: prof }; };
    // ---- the area of the abilities of characters: what a hit adds around its target (the hits come as `more` entries of the step). Friendly fire only where the text says "toutes les unités". ----
    const adjUnits = function (c, but, enemyOf) { return live().filter(function (x) { return x !== but && !x.ds && RULES.dist(x.t, c) === 1 && (enemyOf === undefined || x.side !== enemyOf); }); };
    const AOE = {
      SanctorumMissile: function (u, o, t, v) { return adjUnits(t.t, u).filter(function (e) { return e !== t; }).map(function (e) { return mh(u, e, avgOf(v, ""), o.ab[5], nI(v.nrOfHits_2, 1), o.name); }); },  // every unit next to the target but her
      Stikkbomb: function (u, o, t, v) { return adjUnits(t.t, u, u.side).filter(function (e) { return e !== t; }).map(function (e) { return mh(u, e, avgOf(v, ""), o.ab[5], nI(v.nrOfHits_2, 1), o.name); }); },  // Ork Boyz: the enemies next to the target
      PlasmaGrenade: function (u, o, t, v) { return adjUnits(t.t, u, u.side).filter(function (e) { return e !== t; }).map(function (e) { return mh(u, e, avgOf(v, ""), o.ab[5], nI(v.nrOfHits_2, 1), o.name); }); },  // Guardian
      Fragstorm: function (u, o, t, v) { return adjUnits(t.t, u, u.side).filter(function (e) { return e !== t; }).slice(0, nI(v.nrOfTargets, 4)).map(function (e) { return mh(u, e, avgOf(v, ""), o.ab[5], nI(v.nrOfHits_2, 2), o.name); }); },  // Aggressor: up to 4 of the hexes around the target
      ScythingTalons: function (u, o, t, v) { return foes(u).filter(function (e) { return e !== t && RULES.dist(e.t, t.t) === 1 && RULES.dist(e.t, u.t) === 1; }).map(function (e) { return mh(u, e, avgOf(v, ""), o.ab[5], nI(v.nrOfHits_2, 2), o.name); }); },  // Tyranid Warrior: the enemies next to both
      EmperorsExecutioner: function (u, o, t, v) { return foes(u).filter(function (e) { return e !== t && RULES.dist(e.t, u.t) === 1; }).map(function (e) { return mh(u, e, avgOf(v, ""), o.ab[5], nI(v.nrOfHits, 5), o.name); }); },  // Boudicari: every adjacent enemy
      FragBomb: function (u, o, t, v) { return adjUnits(t.t, u).filter(function (e) { return e !== t; }).map(function (e) { return mh(u, e, avgOf(v, ""), o.ab[5], nI(v.nrOfHits_2, 3), o.name); }); },  // every unit next to the target but him
      FrenziedFiring: function (u, o, t, v) {  // the target's enemies around it; one more hit on the target per free hex around it (10 hits at most)
        const free = RULES.around(t.t[0], t.t[1]).filter(function (h) { const c = RULES.cell(h[0], h[1]); return c && c.kind === 0 && !live().some(function (x) { return sameHex(x.t, h); }); }).length;
        const out = adjUnits(t.t, u, u.side).filter(function (e) { return e !== t; }).map(function (e) { return mh(u, e, avgOf(v, ""), o.ab[5], nI(v.nrOfHits, 1), o.name); });
        const extra = Math.min(nI(v.maxNrOfHits, 10), nI(v.nrOfHits, 1) + free) - nI(v.nrOfHits, 1);
        if (extra > 0) out.push(mh(u, t, avgOf(v, ""), o.ab[5], extra, o.name));
        return out;
      },
      HarvesterOfSouls: function (u, o, t, v) {  // the target's neighbours within range of Maugan Ra; one more hit each if he has not moved
        const n = nI(v.nrOfHits, 2) + (u.spent === 0 ? 1 : 0), out = adjUnits(t.t, u, u.side).filter(function (e) { return e !== t && RULES.dist(u.t, e.t) <= nI(v.range, 3); }).map(function (e) { return mh(u, e, avgOf(v, ""), o.ab[5] || "HeavyRound", n, o.name); });
        if (u.spent === 0) out.push(mh(u, t, avgOf(v, ""), o.ab[5] || "HeavyRound", 1, o.name));
        return out;
      },
      DoomSiren: function (u, o, t, v) { return adjUnits(t.t, u, u.side).filter(function (e) { return e !== t; }).sort(function (a, b2) { return RULES.dist(u.t, a.t) - RULES.dist(u.t, b2.t); }).slice(0, nI(v.nrOfUnits, 2)).map(function (e) { return mh(u, e, avgOf(v, ""), o.ab[5], nI(v.nrOfHits, 3), o.name); }); },
      Supercharge: function (u, o, t, v) {  // up to two enemies next to the target and farther from Sarquael, with more pierce
        return adjUnits(t.t, u, u.side).filter(function (e) { return e !== t && RULES.dist(u.t, e.t) > RULES.dist(u.t, t.t); }).sort(function (a, b2) { return a.hp - b2.hp; }).slice(0, 2).map(function (e) { return mh(u, e, avgOf(v, "_2"), o.ab[5], nI(v.nrOfHits_2, 1), o.name, v.extraPierceRatio || 0); });
      },
      HeraldOfTheApocalypse: function (u, o, t, v) {  // the enemy right behind the target
        const dir = RULES.around(u.t[0], u.t[1]).findIndex(function (h) { return sameHex(h, t.t); });
        if (dir < 0) return [];
        const back = RULES.around(t.t[0], t.t[1])[dir];
        return foes(u).filter(function (e) { return sameHex(e.t, back); }).map(function (e) { return mh(u, e, avgOf(v, ""), o.ab[5], nI(v.nrOfHits, 2), o.name); });
      },
      HellfyreMissileRack: function (u, o, t, v) { return foes(u).filter(function (e) { return e !== t && e.psyTurn === turnNo; }).map(function (e) { return mh(u, e, avgOf(v, ""), o.ab[5], nI(v.nrOfHits, 1), o.name); }); },  // every enemy that took psychic damage this turn
      MurderousSwing: function (u, o, t, v) {  // every adjacent enemy; with a single one the hit is stronger
        const adj = foes(u).filter(function (e) { return RULES.dist(u.t, e.t) === 1; }), out = adj.filter(function (e) { return e !== t; }).map(function (e) { return mh(u, e, avgOf(v, ""), o.ab[5], nI(v.nrOfHits, 1), o.name); });
        if (adj.length === 1) { const a = mh(u, t, avgOf(v, "") + (v.extraDmg || 0), o.ab[5], nI(v.nrOfHits, 1), o.name), b2 = mh(u, t, avgOf(v, ""), o.ab[5], nI(v.nrOfHits, 1), o.name); out.push({ tgt: t, dmg: a.dmg - b2.dmg, hits: 0, per: 0, label: o.name }); }
        return out;
      },
      ProclivityForMurder: function (u, o, t, v) { return foes(u).filter(function (e) { return e !== t && RULES.dist(u.t, e.t) === 1; }).map(function (e) { return mh(u, e, avgOf(v, ""), o.ab[5], nI(v.nrOfHits, 3), o.name); }); },
      GauntletsOfUltramar: function (u, o, t, v) { return foes(u).filter(function (e) { return RULES.dist(u.t, e.t) <= 2; }).map(function (e) { return mh(u, e, avgOf(v, ""), o.ab[5], nI(v.nrOfHits_2, 1) + (RULES.dist(u.t, e.t) === 1 ? 1 : 0), o.name); }); },  // every enemy within 2 hexes, one more hit on the surrounding (adjacent) ones
    };
    // abilities that hit along a straight line in one of the 6 directions: its length, and whether it hits allies too
    const LINE = {
      RadBombardment: { len: function () { return 2 + Math.max(0, round - 1); }, all: true, hx: "contam", pin: true },
      PowerVomit: { len: function () { return 3; }, all: true },
      ExcruciatingFrequencies: { len: function (v) { return nI(v.nrOfTiles, 3); }, pin: true },
    };
    const lineDir = function (from, to, n) {
      for (let dir = 0; dir < 6; dir++) if (dirLine(from, dir, n + 1).slice(1).some(function (h) { return sameHex(h, to); })) return dir;
      return -1;
    };
    const dirLine = function (h, dir, n) {  // up to n hexes in a straight line from h (h included) in a direction
      const out = [h.slice()];
      let c = h;
      while (out.length < n) { const nx = RULES.around(c[0], c[1])[dir]; if (!RULES.cell(nx[0], nx[1])) break; out.push(nx); c = nx; }
      return out;
    };
    const bestLine = function (u, o, from, n, skipFirst, raw, prof, hits) {  // the direction whose line holds the most damage: [hit on each enemy of it]
      let best = null;
      for (let dir = 0; dir < 6; dir++) {
        const line = dirLine(from, dir, n).slice(skipFirst ? 1 : 0), hs = enemiesOn(u.side, line).map(function (e) { return mh(u, e, raw, prof, hits, o.name); });
        const tot = hs.reduce(function (a, x) { return a + x.dmg; }, 0), kills = hs.filter(function (x) { return x.dmg >= x.tgt.hp; }).length;
        if (!best || kills > best.kills || (kills === best.kills && tot > best.tot)) best = { hs: hs, tot: tot, kills: kills, line: line };
      }
      return best;
    };
    const freeHex = function (h) { const c = RULES.cell(h[0], h[1]); return c && c.kind === 0 && !live().some(function (x) { return sameHex(x.t, h); }); };
    const playable = function () { return d.cells.filter(function (c) { return c[4] === 0; }).map(function (c) { return [c[0], c[1]]; }); };
    const bigSpot = function (u, h) {  // a big unit needs its 3 hexes free, walkable and at the same elevation: the first shape in the side's order that fits
      const c0 = RULES.cell(h[0], h[1]);
      return c0 ? footprints(u, h).filter(function (fp) { return fp.every(function (x) { const c = RULES.cell(x[0], x[1]); return c && freeHex(x) && c.el === c0.el; }); })[0] || null : null;
    };
    const lineSpot = function (u, h) {  // the 3 hexes a marking ability covers: the first shape whose hexes are all walkable, else the hex alone
      return footprints(u, h).filter(function (fp) { return fp.every(function (x) { const c = RULES.cell(x[0], x[1]); return c && c.kind === 0; }); })[0] || [h.slice()];
    };
    const mineAt = function (u, h, v) {  // a spore mine: 2 610 health, its blast is the ability's toxic hits
      const a = spawn("tyranSmnSporeMine", u.side, u, h, [v.summonHp || 1, 1, 0], false);
      a.boom = { raw: avgOf(v, ""), prof: "Toxic", n: nI(v.nrOfHits, 1) };
      return a;
    };
    const STATION = { WrathfulAdvance: "custoSmnDreadnought", DutyEternal: "ultraSmnDreadnought", AetherStride: "thousSmnDaemonPrince" };
    const MOW = {
      EntropyCannons: { plan: function (u, o, t, v) { return armorOf(t) < t.arm ? { main: mh(u, t, avgOf(v, ""), o.ab[5], nI(v.nrOfHits, 2), o.name) } : null; } },  // an enemy whose armour is reduced
      RelentlessPersecution: { plan: function (u, o, t, v) {  // an enemy an ally hit this turn: +dmg per active ability used this turn
        if (!t.hitNow) return null;
        const used = field.filter(function (x) { return x.side === u.side && x.usedActive; }).length + units.filter(function (x) { return x.mow && x.side === u.side && x.acted; }).length;
        return { main: mh(u, t, avgOf(v, "") + (v.extraDmg || 0) * used, o.ab[5], nI(v.nrOfHits, 1), o.name) };
      } },
      DeathOnTheWind: { plan: function (u, o, t, v) {  // an enemy hit this turn: the line of 3 hexes from it that holds the most damage
        if (!t.hitNow) return null;
        const b = bestLine(u, o, t.t, nI(v.nrOfTiles, 3), false, avgOf(v, ""), o.ab[5], nI(v.nrOfHits, 6)), main = b.hs.filter(function (x) { return x.tgt === t; })[0];
        return { main: main, more: b.hs.filter(function (x) { return x.tgt !== t; }) };
      } },
      TwinSmartMissileSystem: { plan: function (u, o, t, v) {  // every enemy with a markerlight takes the hits, then the target gets one for 2 rounds
        const hs = foes(u).filter(function (e) { return e.marked; }).map(function (e) { return mh(u, e, avgOf(v, ""), o.ab[5], nI(v.nrOfHits, 3), o.name); });
        return { main: hs.filter(function (x) { return x.tgt === t; })[0] || null, more: hs.filter(function (x) { return x.tgt !== t; }), mark: true };
      } },
      SquigLaunchas: { plan: function (u, o, t, v) {  // an enemy with Orks or allied units next to it takes the hits; with more of them a Large Squig appears next to it
        const near = live().filter(function (x) { return x.side === u.side && RULES.dist(x.t, t.t) === 1; }), orks = near.filter(function (x) { return x.rules.fa === "Orks"; }).length;
        if (orks < nI(v.nrOfUnits, 1) && near.length < nI(v.nrOfUnits_2, 2)) return null;
        const p = { main: mh(u, t, avgOf(v, ""), o.ab[5], nI(v.nrOfHits, 3), o.name) };
        if (orks >= nI(v.nrOfUnits_3, 2) || near.length >= nI(v.nrOfUnits_4, 4)) { const hs = prio(u, freeAdj(t), t.t); if (hs.length) p.addsFn = function () { return [spawn("orksSmnSquig", u.side, u, hs[0], [v.summonHp || 1, v.summonDmg || 1, v.summonArmor || 0], false)]; }; }
        return p;
      } },
      HadesAutocannons: { plan: function (u, o, t, v) {  // an enemy summon and the other enemy summons within 2 of it
        if (!t.summon) return null;
        const hs = foes(u).filter(function (e) { return e.summon && RULES.dist(e.t, t.t) <= 2; }).map(function (e) { return mh(u, e, avgOf(v, ""), o.ab[5], nI(v.nrOfHits, 6), o.name); });
        return { main: hs.filter(function (x) { return x.tgt === t; })[0], more: hs.filter(function (x) { return x.tgt !== t; }) };
      } },
      HeavyRailRifle: { plan: function (u, o, t, v) {  // fires at the start of its next turn: less for each hex the target walked in its last turn, more against vehicles and big targets
        return { main: null, pend: { by: u, tgt: t, ab: o.ab, noMark: true, calc: function (p) {
          let raw = avgOf(v, "") * Math.max(0, 1 - nI(v.dmgPctReduction, 30) * (p.tgt.lastSpent || 0) / 100);
          if (p.tgt.tset.Vehicle) raw *= 1 + nI(v.extraDmgPct, 75) / 100;
          if (p.tgt.tset.BigTarget) raw *= 1 + nI(v.extraDmgPct, 75) / 100;
          return abilityHit(p.by, p.tgt, raw, o.ab[5], nI(v.nrOfHits, 2));
        } } };
      } },
      ForwardSpotter: { ally: true, plan: function (u, o, t, v) {  // a Cadian Guardsman next to the allied unit you click; it plays at once (it walks and attacks like any summon)
        const hs = prio(u, freeAdj(t), t.t);
        if (!hs.length) return null;
        return { main: null, addsFn: function () { const g = spawn("astraSmnGuardsman", u.side, u, hs[0], [v.summonHp || 1, v.summonDmg || 1, v.summonArmor || 0], false); g.immediate = true; return [g]; } };
      } },
      NanoscarabRepairProtocols: { ally: true, plan: function (u, o, t, v) { return t.tset.Mechanical && !t.nano ? { main: null, buff: [{ u: t, hp: v.hp || 0, rep: v.hpToRepair || 0 }] } : null; } },
      ThriceBlessedConflagration: { ally: true, plan: function (u, o, t, v) {  // the ally hits harder at range on burning hexes; the Exorcist burns the line from it that holds the most enemies
        const b = bestLine(u, o, t.t, 99, true, avgOf(v, ""), o.ab[5], nI(v.nrOfHits, 1));
        return { main: null, more: b.hs, hx: b.hs.map(function (x) { return hexCover(x.tgt.t, "fire"); }), fx: [{ u: t, id: "conflag", until: round + nI(v.nrOfRounds, 5) - 1, v: v }] };
      } },
      DevastatingRefrain: { hex: true, hexPlan: function (u, o, h, v) {  // the hex and 3 of its neighbours that do not touch each other (the better of the two ways)
        const ring = RULES.around(h[0], h[1]).filter(function (x) { const c = RULES.cell(x[0], x[1]); return c && c.kind !== 2; });
        const pick = function (par) { return ring.filter(function (x, i) { return RULES.around(h[0], h[1]).findIndex(function (y) { return sameHex(x, y); }) % 2 === par; }); };
        const score = function (set) { return enemiesOn(u.side, set).length; }, a = pick(0), b2 = pick(1), set = score(a) >= score(b2) ? a : b2;
        return { main: null, mk: [{ kind: "bomb", hexes: [h.slice()].concat(set), ab: o.ab }] };
      } },
      MalleusRocketLauncher: { hex: true, hexPlan: function (u, o, h) { return { main: null, mk: [{ kind: "bomb", hexes: [h.slice()], ab: o.ab }] }; } },
      PlagueburstMortar: { hex: true, hexPlan: function (u, o, h, v) {  // enemies with reduced armour on the hex or around it: toxic hits and pinned; then those hexes are contaminated
        const cover = [h].concat(RULES.around(h[0], h[1])).filter(function (x) { const c = RULES.cell(x[0], x[1]); return c && c.kind === 0; });
        const hs = enemiesOn(u.side, cover).filter(function (e) { return armorOf(e) < e.arm; }).map(function (e) { return mh(u, e, avgOf(v, ""), o.ab[5], nI(v.nrOfHits, 3), o.name); });
        return { main: null, more: hs, fx: hs.map(function (x) { return { u: x.tgt, id: "pin", until: stunUntil(x.tgt) }; }), hx: cover.slice(0, nI(v.nrOfTiles, 7)).map(function (x) { return hexCover(x, "contam"); }) };
      } },
      InfernalCannon: { hex: true, hexPlan: function (u, o, h, v) {  // every enemy on a burning hex takes the hits, then the target hex is set on fire
        const hs = foes(u).filter(function (e) { return hexKind(e.t) === "fire" || e.psyTurn === turnNo; }).map(function (e) { return mh(u, e, avgOf(v, ""), o.ab[5], nI(v.nrOfHits, 3), o.name); });  // on a burning hex, or hurt by psychic damage this turn
        return { main: null, more: hs, hx: [hexCover(h, "fire")] };
      } },
      SporeMineLauncher: { hex: true, hexes: function (u) { return playable().filter(function (h) { return freeHex(h) && !foes(u).some(function (e) { return RULES.dist(e.t, h) === 1; }); }); },  // a free hex that is not next to an enemy
        hexPlan: function (u, o, h, v) { return { main: null, addsFn: function () { return [mineAt(u, h, v)]; } }; } },
      BioMinefield: { plan: function (u, o, t, v) {  // with 3 mines or more on the board they all play at once toward the target; otherwise 3 new ones appear around it and go off
        const mines = live().filter(function (x) { return x.side === u.side && isMine(x); });
        if (mines.length >= nI(v.nrOfSummons, 3)) return { main: null, also: mines, force: t };
        const hs = prio(u, freeAdj(t), t.t).slice(0, nI(v.nrOfSummons_2, 3));
        if (!hs.length) return null;
        return { main: null, force: t, addsFn: function () { return hs.map(function (h) { const a = mineAt(u, h, v); a.immediate = true; return a; }); } };
      } },
      ReanimationBeam: { self: true, plan: function (u, o, t, v) {  // the units with the Nanoscarab protocols are repaired; the summons play at once; the first time such a unit would fall before the Reanimator's next turn it comes back
        const nano = live().filter(function (x) { return x.side === u.side && x.nano; });
        return { main: null, heals: nano.map(function (x) { return { u: x, amt: Math.min(x.max - x.hp, v.hpToRepair || 0) }; }).filter(function (h) { return h.amt > 0; }),
          fx: nano.map(function (x) { return { u: x, id: "reanim", hp: v.hp || 1, until: u.side === 0 ? round : round + 1 }; }), also: live().filter(function (x) { return x.side === u.side && x.summon; }) };
      } },
      Hailstrike: { ally: true, plan: function (u, o, t, v) {  // the ally's ranged Sentinelle shots get more pierce this round, and the Storm Speeder shoots the same target
        return { main: null, fx: [{ u: t, id: "hail", by: u, v: v, until: (t.side === 0 ? round : round + 1) + nI(v.nrOfRounds, 1) - 1 }] };
      } },
      MacroPlasmaIncinerator: { hex: true, hexPlan: function (u, o, h, v) {  // the hex and 2 more are marked for this round: the first time an enemy ends a move there, every enemy in the zone takes the blast
        return { main: null, mk: [{ kind: "zone", hexes: lineSpot(u, h), ab: o.ab, raw: avgOf(v, ""), prof: o.ab[5], n: nI(v.nrOfHits, 3), until: round }] };
      } },
      DaemonicOrdnance: { hex: true, hexPlan: function (u, o, h, v) {  // 3 hexes are set on fire; the enemies already standing on a burning one of them take plasma hits
        const fp = lineSpot(u, h), hs = foes(u).filter(function (e) { return fp.some(function (x) { return sameHex(x, e.t); }) && hexKind(e.t) === "fire"; }).map(function (e) { return mh(u, e, avgOf(v, ""), o.ab[5], nI(v.nrOfHits, 3), o.name); });
        return { main: null, more: hs, hx: fp.map(function (x) { return hexCover(x, "fire"); }) };
      } },
      SquigMine: { hex: true, hexes: function () { return playable().filter(freeHex); }, hexPlan: function (u, o, h, v) {  // the hex and N free hexes at random within 2: the first enemy to end a move on one takes the blast
        const rnd = mulberry(((cur + 1) * 40503) ^ 0x2545f491), near = playable().filter(function (x) { return !sameHex(x, h) && RULES.dist(x, h) <= nI(v.range, 2) && freeHex(x); }), pick = [];
        while (near.length && pick.length < nI(v.nrOfTiles, 4)) pick.push(near.splice(Math.floor(rnd() * near.length), 1)[0]);
        return { main: null, mk: [{ kind: "mine", hexes: [h.slice()].concat(pick), ab: o.ab, raw: avgOf(v, ""), prof: o.ab[5], n: nI(v.nrOfHits, 3) }] };
      } },
    };
    ["WrathfulAdvance", "DutyEternal", "AetherStride"].forEach(function (id) {  // a big stationary unit put on the board (its machine cannot be used again); it hits at once when it lands next to an allied character
      MOW[id] = { hex: true, hexes: function (u) { return playable().filter(function (h) { return freeHex(h) && bigSpot(u, h); }); }, hexPlan: function (u, o, h, v) {
        const fp = bigSpot(u, h);
        if (!fp) return null;
        return { main: null, deploy: true, addsFn: function () {
          const a = spawn(STATION[id], u.side, u, h, [v.summonHp || 1, v.summonDmg || 1, v.summonArmor || 0], true);
          a.foot = fp.slice(1);  // the two other hexes of its shape
          a.immediate = live().some(function (x) { return x.side === u.side && !x.summon && RULES.dist(x.t, h) === 1 && (id !== "AetherStride" || x.tset.Psyker); });  // Z'Kar hits at once only next to an allied psyker
          if (id === "AetherStride") { a.zkar = true; a.mowOf = u; }
          return [a];
        } };
      } };
    });
    function mowTargets(u, o) {  // the units a machine of war's ability can be aimed at now
      const out = [], M = o && o.ab && MOW[o.ab[0]];
      if (!M || M.hex || !o.ok || u.acted || !abReady(u, o.ab)) return out;
      const v = vOf(o);
      if (M.self) { const p0 = M.plan(u, o, u, v); return p0 ? [{ u: u, dmg: 0, hits: 0, per: 0, plan: p0 }] : out; }  // no target: click the machine itself
      (M.ally ? live().filter(function (x) { return x.side === u.side; }) : foes(u)).forEach(function (t) {
        const p = M.plan(u, o, t, v);
        if (p) out.push({ u: t, dmg: p.main ? p.main.dmg : 0, hits: p.main ? p.main.hits : 0, per: p.main ? p.main.per : 0, plan: p });
      });
      return out;
    }
    function mowHexes(u, o) {
      const M = o && o.ab && MOW[o.ab[0]];
      if (!M || !M.hex || !o.ok || u.acted || !abReady(u, o.ab)) return [];
      return M.hexes ? M.hexes(u, o) : playable();
    }
    function strikeMow(u, o, t, h) {
      const M = MOW[o.ab[0]], v = vOf(o), p = h ? M.hexPlan(u, o, h, v) : M.plan(u, o, t, v);
      if (!p) return;
      const main = p.main;
      push({ k: "atk", u: u, tgt: t || u, dmg: main ? main.dmg : 0, hits: main ? main.hits : 0, per: main ? main.per : 0, abId: o.ab[0], label: o.name, dead: !!main && healthAfter(t, main.dmg) <= 0 && !guardOf(t),
        more: p.more || [], hx: p.hx || [], fx: p.fx || null, adds: p.addsFn ? p.addsFn() : p.adds || null, heals: p.heals || null, mk: p.mk || null, pend: p.pend || null, mark: !!p.mark, buff: p.buff || null, deploy: !!p.deploy, also: p.also || null, force: p.force || null });
    }
    // Unstoppable Momentum (Nob): he runs in a straight line, pushing every unit on his way to a random free hex next to it (allies too, without harm); each enemy takes the hits (+130 per hex run) and is pinned
    // (a big target is stunned instead and stops him); he stops at a wall, a step of more than one level or a unit that cannot be pushed
    function nobPlan(u, o, t) {
      const v = (o.ab[8] && o.ab[8][rar]) || {}, dir = lineDir(u.t, t.t, 99);
      if (dir < 0) return null;
      const rnd = mulberry(((cur + 1) * 40503) ^ 0x2545f491), at = {}, taken = {}, moves = [], hits = [], fx = [];
      live().forEach(function (x) { if (x !== u) at[x.t[0] + "," + x.t[1]] = x; });
      let pos = u.t.slice(), run = 0;
      for (let step = 0; step < 30; step++) {
        const nx = RULES.around(pos[0], pos[1])[dir], c = RULES.cell(nx[0], nx[1]), here = RULES.cell(pos[0], pos[1]);
        if (!c || c.kind !== 0 || Math.abs(c.el - here.el) > 1 || taken[nx[0] + "," + nx[1]]) break;
        const x = at[nx[0] + "," + nx[1]];
        if (x) {
          const enemy = x.side !== u.side;
          if (enemy) { const r = abilityHit(u, x, avgOf(v, "") + (v.extraDmg || 0) * (run + 1), o.ab[5] || "DirectDamage", nI(v.nrOfHits, 1)); hits.push({ tgt: x, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: o.name }); }
          if (x.tset.BigTarget || x.tset.Immune) { if (enemy) fx.push({ u: x, id: "stun", until: stunUntil(x) }); break; }  // it stays: the Nob stops in front of it
          const free = RULES.around(nx[0], nx[1]).filter(function (h) { const k = RULES.cell(h[0], h[1]); return k && k.kind === 0 && !at[h[0] + "," + h[1]] && !taken[h[0] + "," + h[1]] && !sameHex(h, pos) && !sameHex(h, u.t); });
          if (!free.length) break;
          const pick = free[Math.floor(rnd() * free.length)];
          moves.push({ u: x, to: pick.slice() }); taken[pick[0] + "," + pick[1]] = 1; delete at[nx[0] + "," + nx[1]];
          if (enemy) fx.push({ u: x, id: "pin", until: stunUntil(x) });
        }
        pos = nx; run++;
      }
      const main = hits.filter(function (h) { return h.tgt === t; })[0];
      if (!main) return null;
      if (run) moves.push({ u: u, to: pos });
      return { moves: moves, more: hits.filter(function (h) { return h !== main; }), fx: fx, main: main };
    }
    // Multi-Threat Eliminator / Doombolt: the hits go to the target until it falls, then to the next enemy (those next to it for the Eliminator, +1 hit per kill); Doombolt shares its hits equally between
    // the enemies in range (+1 hit per burning hex, 9 at most) and a fallen enemy's share goes to the others
    const CARRY = {
      FragstormGrenadeLauncher: { hits: function (u, v) { return nI(v.nrOfHits, 6); }, pool: function (u, t, v) { return foes(u).filter(function (e) { return RULES.dist(e.t, t.t) <= nI(v.range, 2); }); } },
      HeavyWarpFlamer: { hits: function (u, v) { return Math.min(nI(v.maxNrOfHits, 9), nI(v.nrOfHits, 4) + (psyCount[u.side] || 0)); }, pool: function (u, t, v) { return foes(u).filter(function (e) { return RULES.dist(e.t, t.t) <= nI(v.range, 2) && RULES.dist(e.t, t.t) === 1; }); } },
      DakkaDakkaDakka: { hits: function (u, v) { return Math.min(nI(v.maxNrOfHits, 16), nI(v.nrOfHits, 6) + nI(v.extraHits, 2) * (u.repairs || 0)); }, pool: function (u, t, v) { return foes(u).filter(function (e) { return RULES.dist(e.t, u.t) <= nI(v.range_2, 3); }); } },
      BloodyFury: { hits: function (u, v) { return Math.min(nI(v.maxNrOfHits, 8), nI(v.nrOfHits, 1) + nI(v.extraHit, 1) * (u.attacked || 0)); }, pool: function (u) { return foes(u).filter(function (e) { return RULES.dist(e.t, u.t) === 1; }); } },
    };
    function redistSim(u, o, t, v, kind) {
      const prof = o.ab[5] || "Psychic", hp = {}, res = {}, per = {};
      const hit1 = function (e) { if (per[e.i] === undefined) per[e.i] = abilityHit(u, e, avgOf(v, ""), prof, 1).per; return per[e.i]; };
      const apply = function (e) { const r = res[e.i] = res[e.i] || { e: e, dmg: 0, hits: 0 }, d1 = hit1(e); r.dmg += d1; r.hits++; hp[e.i] = (hp[e.i] === undefined ? e.hp : hp[e.i]) - d1; return hp[e.i] <= 0; };
      const alive = function (e) { return (hp[e.i] === undefined ? e.hp : hp[e.i]) > 0; };
      if (kind === "multi") {
        let left = 6, cur2 = t, lastDead = null;
        while (left > 0 && cur2) {
          left--;
          if (apply(cur2)) {
            left += parseInt(v.extraHit, 10) || 1; lastDead = cur2;
            cur2 = foes(u).filter(function (e) { return alive(e) && e !== lastDead && RULES.dist(u.t, e.t) <= (parseInt(v.range, 10) || 2) && RULES.dist(e.t, lastDead.t) === 1; })
              .sort(function (a, b2) { return ((hit1(b2) >= (hp[b2.i] === undefined ? b2.hp : hp[b2.i])) - (hit1(a) >= (hp[a.i] === undefined ? a.hp : hp[a.i]))) || a.hp - b2.hp; })[0];
          }
        }
      } else if (kind === "carry") {  // the hits go to the target until it falls, then to the next enemy of the pool (kills first); some abilities count extra hits
        const C = CARRY[o.ab[0]];
        let left = C.hits(u, v), cur2 = t;
        const pool = function () { return C.pool(u, t, v).filter(function (e) { return alive(e) && e !== t; }).sort(function (a, b2) { return ((hit1(b2) >= (hp[b2.i] === undefined ? b2.hp : hp[b2.i])) - (hit1(a) >= (hp[a.i] === undefined ? a.hp : hp[a.i]))) || a.hp - b2.hp; }); };
        while (left > 0 && cur2) { left--; if (apply(cur2)) cur2 = pool()[0]; }
      } else {
        const fires = Object.keys(hexfx).filter(function (k) { return hexKind(k.split(",").map(Number)) === "fire"; }).length;
        let n = Math.min(9, (parseInt(v.nrOfHits, 10) || 3) + fires), pool = foes(u).filter(function (e) { return RULES.dist(u.t, e.t) <= (parseInt(v.range, 10) || 2); });
        pool.sort(function (a, b2) { return (b2 === t) - (a === t) || RULES.dist(u.t, a.t) - RULES.dist(u.t, b2.t); });
        for (let i = 0; n > 0 && pool.length; i++) { const e = pool[i % pool.length]; apply(e); n--; if (!alive(e)) { pool.splice(pool.indexOf(e), 1); i--; } }
      }
      const mk = function (r) { return { tgt: r.e, dmg: Math.round(r.dmg), hits: r.hits, per: Math.round(r.dmg / Math.max(1, r.hits)), label: o.name }; };
      return { main: res[t.i] ? mk(res[t.i]) : null, more: Object.keys(res).map(function (k) { return res[k]; }).filter(function (r) { return r.e !== t; }).map(mk) };
    }
    const strike = function (u, o, t) {
      if (u.mow) return strikeMow(u, o, t);
      const ts0 = targetsOf(u, o).filter(function (x) { return x.u === t; })[0];
      if (!ts0) return;
      if (o.ab && (o.ab[0] === "CalibaniteGreatsword" || o.ab[0] === "DoctrinaImperatives")) { push({ k: "atk", u: u, tgt: u, dmg: 0, hits: 0, per: 0, abId: o.ab[0], label: o.name + (o.ab[0] === "DoctrinaImperatives" ? " (" + (u.stance ? "impératif protecteur" : "impératif conquérant") + ")" : " (posture " + (u.stance ? "de frappe" : "de balayage") + ")"), dead: false, stance: true, more: [] }); return; }
      const ts = Object.assign({}, ts0), sp = o.ab && CULT[o.ab[0]], lgbHx = [];
      let redistMore = [], reviveL = null, reuseL = null, setHpL = null;
      if (sp && sp.redist) { const sim = redistSim(u, o, t, vals_(o), sp.redist); if (sim.main) { ts.dmg = sim.main.dmg; ts.hits = sim.main.hits; ts.per = sim.main.per; } redistMore = sim.more; }
      if (u.tset.LetTheGalaxyBurn && ts.dmg > 0 && ts.per) {  // Let the Galaxy Burn: 33 % of an extra hit and despoiled ground under the target; if its hex already has an effect the extra hit is certain and nothing is added
        const r0 = mulberry(((cur + 1) * 40503) ^ 0x7f4a7c15)(), has = !!hexKind(t.t), ch = TV.LetTheGalaxyBurnChancePct || 33;
        if (has || r0 * 100 < ch) { ts.dmg += ts.per; ts.hits += 1; if (!has) lgbHx.push(hexCover(t.t, "despoiled")); }
      }
      let adds = sp && sp.summon ? cultAdds(u, o, t) : null, gone = null, mark = false;
      let also = sp && sp.also ? live().filter(function (x) { return x.summon && x.id === sp.also && x.side === u.side && (!sp.r || RULES.dist(u.t, x.t) <= sp.r); }) : null;  // the summons the ability orders to play at once
      const drone = !o.ab && ts.heal === undefined && ts.dmg > 0 && RULES.dist(u.t, t.t) > 1 ? (u.rules.ab || []).filter(function (a) { return a[0] === "MV71SniperDroneSquad"; })[0] : null;
      if (drone) {  // Sho'syl: instead of a ranged attack a Sniper Drone is summoned (next to him, toward the target) and ordered to shoot, with his damage; the lowest-health drone goes when he has 3; the target gets a markerlight
        const v = (drone[8] && drone[8][rar]) || {}, hs = prio(u, freeAround(u), u.t), mine2 = field.filter(function (x) { return x.parent === u && x.id === "tauSmnDroneSniper" && x.alive; }).sort(function (a, b2) { return a.hp - b2.hp; });
        mark = true;
        if (hs.length) {
          if (mine2.length >= (parseInt(v.maxSummons, 10) || 3)) gone = [mine2[0]];
          adds = [spawn("tauSmnDroneSniper", u.side, u, hs[0], [v.summonHp || 1, v.summonDmg || 1, v.summonArmor || 0], false)];
        }
      }
      let heals = sp && sp.heal ? healsOf(u, o) : null, buff = null;
      if (sp && sp.healAdj) {  // Defend the Divine Work / Combat Restoratives: the caster and the allies next to him
        const hv = vals_(o);
        heals = live().filter(function (x) { return x.side === u.side && (x === u || RULES.dist(u.t, x.t) === 1) && !x.decoy && (sp.healAdj.mech ? mech(x) : !mech(x)); })
          .map(function (x) { return { u: x, amt: Math.min(x.max - x.hp, (sp.healAdj.key2 && x.rules.al === "Imperial" ? hv[sp.healAdj.key2] : hv[sp.healAdj.key]) || 0) }; }).filter(function (h) { return h.amt > 0; });
      }
      if (ts.heal !== undefined) heals = [{ u: t, amt: ts.heal }];  // the attack heals an ally
      const pend = sp && sp.pend ? { by: u, tgt: t, ab: o.ab } : null, plan = ts.plan || {};
      let moves = plan.moves || null, fx = plan.fx || null, more = (plan.more || []).concat(extras(u, o, t, ts.dmg), redistMore);
      const rnd = mulberry(((cur + 1) * 40503) ^ 0x2545f491), hx = lgbHx.slice();  // the chances of this action, drawn once and kept in the step
      if (ts.prof === "Flame" || (sp && sp.fire)) hx.push(hexCover(t.t, "fire"));  // a flame hit sets the target's hex on fire
      if (ts.prof === "Toxic" && rnd() < 0.25) hx.push(hexCover(t.t, "contam"));  // toxic: 25 % to contaminate it
      if (sp && sp.ice) [t.t].concat(RULES.around(t.t[0], t.t[1])).forEach(function (h) { const c = RULES.cell(h[0], h[1]); if (c && c.kind === 0) hx.push(hexCover(h, "ice")); });
      if (!o.ab && ts.dmg > 0 && (u.rules.ab || []).some(function (a) { return a[0] === "LordOfTempests"; })) hx.push(hexCover(t.t, "ice"));  // Njal's normal attacks cover the hex of the enemy they hit with ice
      if (sp && sp.hitAll) [t].concat(more.map(function (x) { return x.tgt; })).forEach(function (e) { if (e.rules.fl) fx = (fx || []).concat([{ u: e, id: "stun", until: stunUntil(e) }]); });  // the flying enemies it hits are stunned
      if (o.ab && o.ab[0] === "BrazierOfHolyFire") {  // every Daemon within 2 of the target takes +60 % (+20 % with Immunity) this round and the next
        const bv = (o.ab[8] && o.ab[8][rar]) || {};
        fx = (fx || []).concat(foes(u).filter(function (e) { return e.tset.Daemon && RULES.dist(e.t, t.t) <= (parseInt(bv.range_2, 10) || 2); }).map(function (e) { return { u: e, id: "brazier", until: round + 1, pct: e.tset.Immune ? bv.extraDmgPct_2 : bv.extraDmgPct }; }));
      }
      if (o.ab && o.ab[0] === "EarlyWarningOverride") fx = (fx || []).concat([{ u: u, id: "sentinel", until: u.side === 0 ? round : round + 1, extra: vals_(o).extraDmg, cut: vals_(o).hitsReduction }]);  // Re'vas also watches until her next turn, with more damage
      if (sp && sp.charge && adds) fx = (fx || []).concat(adds.map(function (a) { return { u: a, id: "waaagh", until: round, v: (o.ab[8] && o.ab[8][rar]) || {} }; }));  // the new Boyz are next to Gulgortz too
      let linch = false;
      if (!o.ab && ts.dmg > 0 && u.tset.Synapse && healthAfter(t, ts.dmg) > 0) {  // Synaptic Linchpin: a normal attack by the Winged Prime or another Synapse unit that does not kill brings a Hormagaunt next to the target, which attacks it at once
        const wp = live().filter(function (x) { return x.side === u.side && abOf(x, "SynapticLinchpin"); })[0], lv = wp ? abOf(wp, "SynapticLinchpin") : null;
        if (lv && field.filter(function (x) { return x.parent === wp && x.id === "tyranSmnHormagaunt" && x.alive; }).length < (parseInt(lv.maxSummons, 10) || 4)) {
          const hs = prio(u, freeAdj(t), t.t);
          if (hs.length) { const a = spawn("tyranSmnHormagaunt", u.side, wp, hs[0], [lv.summonHp || 1, lv.summonDmg || 1, lv.summonArmor || 0], true); a.immediate = true; adds = (adds || []).concat([a]); linch = true; }
        }
      }
      if (sp && sp.revive) {  // Resurrection Orb / Rites of Restoration: the fallen come back on free hexes next to the caster (they cannot act this turn)
        const v = vals_(o), spots = prio(u, freeAround(u), u.t).slice();
        reviveL = [];
        if (sp.revive === "orb") {
          const deadMech = field.filter(function (x) { return x.side === u.side && !x.alive && x.hp <= 0 && !x.summon && !x.decoy && mech(x); });
          if (deadMech.length && spots.length) reviveL.push({ u: deadMech[0], hex: spots.shift(), pct: v.hpPct || 80 });
          const n = Math.min(parseInt(v.maxSummons, 10) || 5, round + deadMech.length);
          adds = (adds || []).concat(spots.splice(0, n).map(function (h) { const a = spawn("necroSmnWarrior", u.side, u, h, [v.summonHp || 1, v.summonDmg || 1, v.summonArmor || 0], false); a.hpPct = v.hpPct || 80; return a; }));
        } else {
          const chars = field.filter(function (x) { return x.side === u.side && !x.alive && x.hp <= 0 && !x.summon && !x.decoy && !mech(x) && x.rules.al === "Imperial"; });
          const sums = field.filter(function (x) { return x.side === u.side && !x.alive && x.hp <= 0 && x.summon && !x.decoy && !mech(x) && x.rules.al === "Imperial" && x.t0; });
          chars.slice(0, parseInt(v.nrOfHeroes, 10) || 1).concat(sums.slice(0, parseInt(v.nrOfSummons, 10) || 2)).forEach(function (x) { if (spots.length) reviveL.push({ u: x, hex: spots.shift(), pct: Math.min(100, (v.hp || 1) / x.max * 100) }); });
        }
      }
      if (sp && sp.buffs) {  // buffs and debuffs that need no damage: who gets what, until when
        const v = vals_(o), b = sp.buffs, mine3 = live().filter(function (x) { return x.side === u.side; }), til = u.side === 0 ? round : round + 1, rg = nI(v.range, 2);
        fx = fx || [];
        const melee1 = function (e) { return withPos(u, u.t, function () { return damageOf(u, e, { w: mainWeapon(u, true) }, 1); }); };
        const adjFoes = foes(u).filter(function (e) { return RULES.dist(u.t, e.t) === 1; }).sort(function (a, b2) { return a.hp - b2.hp; });
        const attack = function (label) { if (!adjFoes.length) return; const e = adjFoes[Math.floor(rnd() * adjFoes.length)], r = melee1(e); more.push({ tgt: e, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: label }); };
        if (b === "montka") mine3.filter(function (x) { return (x.rules.wp || []).some(function (w) { return w[0] > 1; }); }).forEach(function (x) { fx.push({ u: x, id: "montka", until: round, v: v }); });
        else if (b === "howl") mine3.filter(function (x) { return !x.summon && !(x.rules.wp || []).some(function (w) { return w[0] > 1; }); }).forEach(function (x) { fx.push({ u: x, id: "howl", until: round, v: v }); });
        else if (b === "crusade") { mine3.filter(function (x) { return x !== u && RULES.dist(u.t, x.t) <= rg; }).forEach(function (x) { fx.push({ u: x, id: "crusade", until: round + 1, v: v }); }); attack(o.name); }
        else if (b === "duty") {
          mine3.filter(function (x) { return x === u || RULES.dist(u.t, x.t) <= rg; }).forEach(function (x) { fx.push({ u: x, id: "dr", pct: v.dmgReductionPct || 33, until: til, src: "UnbreakableDuty" }); });
          if (field.filter(function (x) { return x.side === u.side && !x.alive && x.hp <= 0 && !x.summon && x.rules.al === "Imperial"; }).length >= 2) { buff = [{ u: u, hp: v.extraHp || 0, rep: 0, dutyDmg: v.extraDmg || 0 }]; attack(o.name); }
        }
        else if (b === "chrono") foes(u).filter(function (e) { return RULES.dist(u.t, e.t) <= rg; }).forEach(function (e) { fx.push({ u: e, id: e.summon ? "stun" : "pin", until: stunUntil(e) + nI(v.nrOfRounds, 1) - 1 }); fx.push({ u: e, id: "chrono", until: 999, extra: v.extraDmg || 0, extra2: v.extraDmg_2 || 0 }); });
        else if (b === "infusion") { mine3.filter(function (x) { return x === u || (x.rules.al === "Chaos" && RULES.dist(u.t, x.t) <= contagionRange()); }).forEach(function (x) { fx.push({ u: x, id: "infusion", until: round + 1, v: v }); }); attack(o.name); }
        else if (b === "chalice") { const al = mine3.filter(function (x) { return x !== u && RULES.dist(u.t, x.t) === 1 && !mech(x); }); setHpL = al.map(function (x) { return { u: x, pct: parseInt(v.healthPct, 10) || 50 }; }); al.forEach(function (x) { fx.push({ u: x, id: "chalice", until: round, v: v }); }); }
        else if (b === "inspire") { reuseL = [{ u: t }]; heals = [{ u: t, amt: Math.min(t.max - t.hp, Object.keys(t.used || {}).length ? v.hpToHeal || 0 : v.hpToHeal_2 || 0) }].filter(function (h) { return h.amt > 0; }); }
        else if (b === "prime") { heals = [{ u: t, amt: Math.min(t.max - t.hp, v.hpToHeal || 0) }].filter(function (h) { return h.amt > 0; }); buff = [{ u: t, hp: v.hp || 0, rep: 0, aug: { dmg: v.extraDmg || 0, pct: v.hpPct || 20, mv: t.rules.al === "Chaos" ? parseInt(v.extraMovement, 10) || 1 : 0, by: u } }]; }
        else if (b === "hate") { fx.push({ u: t, id: "hated", until: round + 1, extra: v.extraDmg || 0 }); if (t.rules.al === "Chaos") { fx.push({ u: t, id: "pin", until: stunUntil(t) }); } }
      }
      if (sp && sp.chargeAb) {  // what each charge adds, seen from where the unit lands
        const v = vals_(o), id = o.ab[0], dest = moves && moves.length ? moves[0].to : u.t;
        fx = fx || [];
        if (id === "MassDriverAccelerator") live().filter(function (x) { return x.side === u.side && (x === u || RULES.dist(x.t, u.t) === 1); }).forEach(function (x) { fx.push({ u: x, id: "mvup", src: "MassDriverAccelerator", until: round, mv: parseInt(v.extraMovement, 10) || 1 }); });  // before she moves: she and the allies around her
        withPos(u, dest, function () {
          if (id === "LightOfSanguinius") foes(u).filter(function (e) { return e === t || RULES.dist(e.t, t.t) === 1; }).forEach(function (e) { fx.push({ u: e, id: "weak", pct: v.dmgReductionPct || 30, half: parseInt(v.healthPct, 10) || 50, until: stunUntil(e) + (parseInt(v.nrOfRounds, 10) || 1) - 1 }); });
          if (id === "HammerOfWrath") {
            const dbl = u.hp <= u.max * (parseInt(v.healthPct, 10) || 50) / 100 ? 2 : 1;
            if (dbl === 2) more.push({ tgt: t, dmg: ts.dmg, hits: 0, per: 0, label: o.name });  // doubled
            foes(u).filter(function (e) { return RULES.dist(e.t, u.t) === 1; }).forEach(function (e) { const r = abilityHit(u, e, avgOf(v, "_2") * dbl, "Physical", nI(v.nrOfHits_2, 1)); more.push({ tgt: e, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: o.name }); });
          }
          if (id === "LeadingTheCharge") adds = (adds || []).concat(freeAround(u).slice(0, nI(v.nrOfSummons, 4)).map(function (h) { const a = spawn("astraSmnDeathRider", u.side, u, h, [v.summonHp || 1, v.summonDmg || 1, v.summonArmor || 0], true); a.immediate = true; return a; }));
          if (id === "MassDriverAccelerator") foes(u).filter(function (e) { return e !== t && RULES.dist(e.t, t.t) === 1; }).forEach(function (e) { const r = abilityHit(u, e, avgOf(v, "_2"), "Physical", nI(v.nrOfHits_2, 1)); more.push({ tgt: e, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: o.name }); });
        });
      }
      const jet0 = abOf(u, "AggressiveOnslaught");
      if (jet0 && t.side !== u.side) {  // Mataneo charges (any attack on an enemy he was not in melee with at the start of the turn, after a move or with a charge ability): jump-pack Intercessors next to the target attack at once
        const mv0 = moves && moves.length && moves[0].u === u ? moves[0].to : null;
        if (charges(u, t, !!mv0)) withPos(u, mv0 || u.t, function () {
          adds = (adds || []).concat(prio(u, freeAdj(t), t.t).slice(0, nI(jet0.nrOfSummons, 2)).map(function (h) { const a = spawn("bloodSmnIntercessor", u.side, u, h, [jet0.summonHp || 1, jet0.summonDmg || 1, jet0.summonArmor || 0], true); a.immediate = true; a.jetFor = u; return a; }));  // they leave at the start of his next turn
        });
      }
      if (!o.ab && ts.dmg > 0 && abOf(u, "FeederTendrils") && charges(u, t) && RULES.dist(u.t, t.t) === 1) {  // Deathleaper charges: she heals and pins the target
        const ft = abOf(u, "FeederTendrils");
        heals = [{ u: u, amt: Math.min(u.max - u.hp, ft.hpToHeal || 0) }].filter(function (h) { return h.amt > 0; });
        fx = (fx || []).concat([{ u: t, id: "pin", until: stunUntil(t) }]);
      }
      let lcUsed = false;
      if (o.ab && ts.dmg > 0 && ts.per > 0 && !(sp && (sp.self || sp.noDmg))) { const lh = legendaryHits(u, t); if (lh > 0) { more.push({ tgt: t, dmg: Math.round(ts.per * lh), hits: lh, per: Math.round(ts.per), label: abName(u, "LegendaryCommander") }); lcUsed = true; } }  // Trajann: 2 more hits
      const lg = abOf(u, "LegacyOfCombat");
      if (lg && u.nAtk === 0) {  // Kariyan's Legacy of Combat: a second attack after his first of the turn, on a big target next to him (piercing) or else on every adjacent enemy (intensity); stronger after Martial Inspiration
        const adjF = foes(u).filter(function (e) { return RULES.dist(u.t, e.t) === 1; }), big = adjF.filter(function (e) { return e.tset.BigTarget; })[0];
        const mi = (o.ab && o.ab[0] === "MartialInspiration") || u.miTurn === turnNo ? 1 + 0.33 * ((u.atkTurns || 0) + (u.lastAtkTurn === turnNo ? 0 : 1)) : 1;
        const lgt = big ? [big] : adjF;
        lgt.forEach(function (e) {
          let n2 = big ? nI(lg.nrOfHits_2, 1) : nI(lg.nrOfHits, 3);
          if (!lcUsed) { const lh2 = legendaryHits(u, e, !!o.ab); if (lh2 > 0) { n2 += lh2; lcUsed = true; } }
          const r = abilityHit(u, e, (big ? avgOf(lg, "_2") : avgOf(lg, "")) * mi, big ? "Piercing" : "Power", n2);
          more.push({ tgt: e, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: abName(u, "LegacyOfCombat") });
        });
      }
      if (sp && sp.barrage) {  // Basilisk Barrage: 5 shells on a target; 3 land at random on its hex or the ring around it, the other 2 around those; each finished round moves one more shell onto the target hex (outer ones first); every unit on a hit hex takes the hits
        const v = vals_(o), center = t.t, ring = RULES.around(center[0], center[1]).filter(function (h) { const c = RULES.cell(h[0], h[1]); return c && c.kind !== 2; });
        const first = [], second = [], nTot = nI(v.nrOfProjectiles, 5), n1 = Math.min(nTot, nI(v.nrOfProjectiles_2, 3)), pool = [center].concat(ring);
        for (let i = 0; i < n1; i++) first.push(pool[Math.floor(rnd() * pool.length)]);
        const around2 = []; first.forEach(function (h) { RULES.around(h[0], h[1]).forEach(function (x) { if (RULES.cell(x[0], x[1])) around2.push(x); }); });
        for (let i = n1; i < nTot; i++) second.push(around2[Math.floor(rnd() * around2.length)] || center);
        const shells = first.map(function (h) { return { h: h, rank: sameHex(h, center) ? 0 : 1 }; }).concat(second.map(function (h) { return { h: h, rank: 2 }; }));
        shells.sort(function (a, b2) { return b2.rank - a.rank; });  // the outermost first
        for (let i = 0; i < Math.min(shells.length, Math.max(0, round - 1)); i++) shells[i].h = center;
        const count = {};
        shells.forEach(function (sh) { const k = sh.h[0] + "," + sh.h[1]; count[k] = (count[k] || 0) + 1; });
        Object.keys(count).forEach(function (k) {
          const hx2 = k.split(",").map(Number);
          live().filter(function (x) { return !x.ds && sameHex(x.t, hx2) && x !== u; }).forEach(function (e) {  // allies too
            const r = abilityHit(u, e, avgOf(v, ""), o.ab[5] || "Blast", nI(v.nrOfHits, 2) * count[k]);
            more.push({ tgt: e, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: o.name });
            if (u.tset.SuppressiveFire) fx = (fx || []).concat([{ u: e, id: "pin", until: stunUntil(e) }]);
          });
        });
      }
      if ((!o.ab || o.ab[0] === "FlailSwing") && ts.dmg > 0) {  // passives of normal attacks that stun, summon or spread (Blightlord's Flail Swing sets off Haze of Corruption too)
        const d1 = RULES.dist(u.t, t.t);
        if (abOf(u, "SpecialIssueCombiMelta") && d1 === 3) fx = (fx || []).concat([{ u: t, id: "pin", until: stunUntil(t) }]);
        if (abOf(u, "FuryFromTheDelve") && t.hp > t.max * (parseInt(abOf(u, "FuryFromTheDelve").hpPct, 10) || 50) / 100) fx = (fx || []).concat([{ u: t, id: "pin", until: stunUntil(t) }]);
        const flm2 = abOf(u, "FleshmetalGuns"); if (flm2 && d1 > 1) hx.push(hexCover(t.t, "despoiled"));
        const sq = abOf(u, "SquigHound");
        if (sq && field.filter(function (x) { return x.side === u.side && x.id === "orksGrot" && x.alive; }).length < (parseInt(sq.maxSummons, 10) || 5)) { const hs2 = prio(u, freeAdj(t), t.t); if (hs2.length) { const g = spawn("orksGrot", u.side, u, hs2[0], [sq.summonHp || 1, sq.summonDmg || 1, 0], true); g.immediate = true; adds = (adds || []).concat([g]); } }
        const hz = abOf(u, "HazeOfCorruption");
        if (hz && healthAfter(t, ts.dmg) <= 0 && !guardOf(t)) {  // Blightlord: the overflow and toxic hits go to a random enemy next to both of them, then once more
          let over = ts.dmg - t.hp, left = 2; const used = [t];
          while (left-- > 0) { const c = foes(u).filter(function (e) { return used.indexOf(e) < 0 && RULES.dist(e.t, u.t) === 1 && RULES.dist(e.t, t.t) === 1; }); if (!c.length) break; const e = c[Math.floor(rnd() * c.length)], r = abilityHit(u, e, hz.extraDmg || 0, "Toxic", parseInt(hz.nrOfHits, 10) || 1), tot = Math.round(Math.max(0, over) + r.tot); more.push({ tgt: e, dmg: tot, hits: 1, per: tot, label: abName(u, "HazeOfCorruption") }); used.push(e); if (healthAfter(e, tot) > 0) break; over = tot - e.hp; }
        }
      }
      if (ts.heal !== undefined && abOf(u, "HealingBalms")) { const hb = abOf(u, "HealingBalms"); fx = (fx || []).concat([{ u: t, id: "balm", until: round + 1, amt: hb.hpToHeal || 0 }]); }  // Baldr: the healed unit is healed again at the start of his next turn
      if (sp && sp.adapt) also = live().filter(function (x) { return x.side === u.side && x.summon && x !== u && RULES.dist(u.t, x.t) === 1; });  // Adaptive Strategy: the adjacent summons act again
      if (sp && sp.possess) {  // Attempted Possession: the target and the summons it made attack the nearest unit of their enemies
        [t].concat(field.filter(function (x) { return x.parent === t && x.alive && x.summon; })).forEach(function (x) {
          const cap = parseInt((vals_(o)).maxDmg, 10) || 7178, best = targetsOf(x, { id: "atk", ok: true }).filter(function (y) { return y.dmg > 0; }).sort(function (a, b2) { return RULES.dist(x.t, a.u.t) - RULES.dist(x.t, b2.u.t); })[0];
          if (best) more.push({ tgt: best.u, dmg: Math.round(Math.min(best.per, cap) * best.hits), hits: best.hits, per: Math.round(Math.min(best.per, cap)), label: "Possession", by: x });
        });
      }
      if (sp && sp.facade) {  // Sorcerous Facade: Yazaghor and the allied psyker deal extra psychic damage with their normal attacks until his next turn; he attacks the nearest enemy, then the two swap places
        const v = vals_(o);
        fx = (fx || []).concat([{ u: u, id: "facade", until: round, v: v }, { u: t, id: "facade", until: round, v: v }]);
        const e0 = targetsOf(u, { id: "atk", ok: true }).filter(function (x) { return x.dmg > 0; }).sort(function (a2, b2) { return RULES.dist(u.t, a2.u.t) - RULES.dist(u.t, b2.u.t) || b2.dmg - a2.dmg; })[0];
        if (e0) { more.push({ tgt: e0.u, dmg: e0.dmg, hits: e0.hits, per: e0.per, label: o.name }); more.push(mh(u, e0.u, avgOf(v, ""), "Psychic", nI(v.nrOfHits, 1), o.name + " (psychique)")); }
        moves = [{ u: u, to: t.t.slice() }, { u: t, to: u.t.slice() }];
      }
      if (sp && sp.fear) {  // Fear of the Unseen: the enemies within 2 are pinned; Deathleaper vanishes (it cannot be targeted, and next turn it can reappear on a free hex that is in tall grass or away from the enemies) and hits harder
        const v = vals_(o);
        fx = (fx || []).concat(foes(u).filter(function (e) { return RULES.dist(u.t, e.t) <= nI(v.range, 2); }).map(function (e) { return { u: e, id: "pin", until: stunUntil(e) }; }), [{ u: u, id: "hide", until: 999 }, { u: u, id: "fear", until: round + 1, v: v }]);
      }
      if (sp && sp.morkai) {  // Rites of Mork-ai: Baldr and the non-mechanical allies next to him are inspired (back from the dead once), then Baldr attacks an adjacent enemy
        const v2 = vals_(o), al = live().filter(function (x) { return x.side === u.side && (x === u || RULES.dist(u.t, x.t) <= 1) && !mech(x); }), til3 = u.side === 0 ? round : round + 1;
        fx = (fx || []).concat(al.map(function (x) { return { u: x, id: "reanim", hp: v2.hp || 1, until: til3 + nI(v2.nrOfRounds, 1) - 1 }; }));
        const e0 = foes(u).filter(function (e) { return RULES.dist(u.t, e.t) === 1; }).sort(function (a, b2) { return a.hp - b2.hp; })[0];
        if (e0) { const r = damageOf(u, e0, { w: mainWeapon(u, true) }, 1); more.push({ tgt: e0, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: o.name }); }
      }
      if (o.ab && !(sp && (sp.line || sp.barrage))) {  // the effects of the abilities that hit around or beyond their target, stun, pin or move it
        const id = o.ab[0], v = vals_(o);
        fx = fx || []; moves = moves ? moves.slice() : [];
        const til2 = u.side === 0 ? round : round + 1, hitMore = function (e, avg, prof, n) { const r = abilityHit(u, e, avg, prof, n); more.push({ tgt: e, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: o.name }); return r; };
        const adjOfU = foes(u).filter(function (e) { return e !== t && RULES.dist(u.t, e.t) === 1; });
        if (id === "SentinelDirectives") fx.push({ u: t, id: "pin", until: stunUntil(t) });
        else if (id === "GravitonRifle") fx.push({ u: t, id: "stun", until: stunUntil(t) + nI(v.nrOfRounds, 1) - 1 });
        else if (id === "Foehammer") fx.push({ u: t, id: "stun", until: stunUntil(t) });
        else if (id === "AugmentedAssault") fx.push({ u: t, id: "armcut", amt: v.armorReduction || 0, until: 999 });
        else if (id === "AncestralFortune") fx.push({ u: t, id: "taunt", taunt: u, until: stunUntil(t), v: {} }, { u: t, id: "noheal", until: stunUntil(t) });
        else if (id === "SpiritLeech") { fx.push({ u: t, id: "pin", until: stunUntil(t) }); heals = (heals || []).concat(live().filter(function (x) { return x.side === u.side && (x === u || (x.rules.fa === "Tyranids" && RULES.dist(x.t, u.t) === 1)); }).map(function (x) { return { u: x, amt: Math.min(x.max - x.hp, Math.round(ts.dmg * (v.hpToHealPct || 60) / 100)) }; }).filter(function (h) { return h.amt > 0; })); }
        else if (id === "JakhalStimms") { foes(u).filter(function (e) { return e !== t && RULES.dist(u.t, e.t) === 1 && RULES.dist(t.t, e.t) === 1; }).forEach(function (e) { hitMore(e, avgOf(v, ""), o.ab[5], nI(v.nrOfHits, 4)); }); const sd = Math.round(u.hp * (parseInt(v.hpPct, 10) || 25) / 100); more.push({ tgt: u, dmg: sd, hits: 1, per: sd, label: o.name + " (contrecoup)" }); }
        else if (id === "BringerOfDespair") { if (adjOfU.length) hitMore(adjOfU[Math.floor(rnd() * adjOfU.length)], avgOf(v, ""), o.ab[5], nI(v.nrOfHits_2, 4)); }
        else if (id === "SilentDeath") { let last = t; const used = [t]; for (let k = 0; k < nI(v.nrOfTargets, 3); k++) { const nx = foes(u).filter(function (e) { return used.indexOf(e) < 0 && RULES.dist(e.t, last.t) === 1; }).sort(function (a, b2) { return a.hp - b2.hp; })[0]; if (!nx) break; hitMore(nx, avgOf(v, ""), o.ab[5], nI(v.nrOfHits, 3)); used.push(nx); last = nx; } }
        else if (id === "VexillaMagnifica") { const e2 = adjOfU.sort(function (a, b2) { return a.hp - b2.hp; })[0]; if (e2) { hitMore(e2, avgOf(v, ""), o.ab[5], nI(v.nrOfHits, 1)); fx.push({ u: e2, id: "stun", until: stunUntil(e2) }); } fx.push({ u: t, id: "stun", until: stunUntil(t) }, { u: u, id: "dr", src: "VexillaMagnifica", pct: v.dmgReductionPct || 66, until: til2 + nI(v.nrOfRounds, 1) - 1 }); }
        else if (id === "PlasmaCannon") { const d0 = RULES.dist(u.t, t.t), back = RULES.around(t.t[0], t.t[1]).filter(function (h) { return RULES.dist(u.t, h) === d0 + 1; })[0]; if (back) { const b2 = RULES.around(back[0], back[1]).filter(function (h) { return RULES.dist(u.t, h) === d0 + 2 && RULES.dist(h, t.t) === 2; })[0]; [back, b2].forEach(function (h) { if (!h) return; foes(u).filter(function (e) { return sameHex(e.t, h); }).forEach(function (e) { hitMore(e, avgOf(v, ""), o.ab[5], nI(v.nrOfHits, 3)); }); }); } }
        else if (id === "DarkTalonStrike") { const line = foes(u).filter(function (e) { return e !== t && RULES.dist(e.t, t.t) <= 3; }); let last = t; const used = [t]; for (let k = 0; k < 4; k++) { const nx = line.filter(function (e) { return used.indexOf(e) < 0 && RULES.dist(e.t, last.t) === 1 && RULES.dist(u.t, e.t) > RULES.dist(u.t, last.t); })[0]; if (!nx) break; hitMore(nx, avgOf(v, "_2"), "Bolter", nI(v.nrOfHits_2, 6)); fx.push({ u: nx, id: "pin", until: stunUntil(nx) }); used.push(nx); last = nx; } fx.push({ u: t, id: "pin", until: stunUntil(t) }); }
        else if (id === "Executioner") { ts.dmg = Math.round(ts.dmg * round); if (healthAfter(t, ts.dmg) <= 0) { const e2 = foes(u).filter(function (e) { return e !== t && RULES.dist(e.t, t.t) === 1; })[0]; if (e2) more.push({ tgt: e2, dmg: Math.round(ts.dmg), hits: 1, per: Math.round(ts.dmg), label: o.name }); } }  // per round started
        else if (id === "PsychicMaelstrom") { let k = 0; [75, 50, 25, 10].forEach(function (c, i) { const ch = nI(v["chance" + (i ? "_" + (i + 1) : "")], c); if (k === i && rnd() * 100 < ch) k++; }); if (k > 0) hitMore(t, avgOf(v, ""), o.ab[5], k); }
        else if (id === "HarbingerOfDestruction") {  // Thutmose: the target and other enemies within 2, up to 3 at ability level 1, 4 from level 18, 5 from level 36 (the data leaves the number out)
          const lv = RAR[rar].lv, nMax = nI(v.nrOfUnits, lv >= 36 ? 5 : lv >= 18 ? 4 : 3);
          foes(u).filter(function (e) { return e !== t && RULES.dist(u.t, e.t) <= nI(v.range, 2); }).sort(function (a, b2) { return ((b2.hp <= ts.per) - (a.hp <= ts.per)) || a.hp - b2.hp; }).slice(0, nMax - 1).forEach(function (e) { hitMore(e, avgOf(v, ""), o.ab[5], nI(v.nrOfHits, 1)); });
        }
        else if (id === "Loki_SwoopingHawk" || id === "SlashingDive") {  // Aethana: the target and the enemies on the 2 hexes behind it take 3 decreasing hits; she lands on the hex behind the last one hit (or the nearest free hex)
          const dir = lineDir(u.t, t.t, 1), line = dirLine(u.t, dir, 5), gone = [];
          let last = 1;
          if (healthAfter(t, ts.dmg) <= 0) gone.push(t);
          [1, 2].forEach(function (k) {
            const h = line[k + 1], e = h ? foes(u).filter(function (x) { return sameHex(x.t, h); })[0] : null;
            if (!e) return;
            const r = hitMore(e, v["dmg" + k] || 0, o.ab[5] || "Piercing", nI(v.nrOfHits, 1));
            last = k + 1; if (healthAfter(e, Math.round(r.tot)) <= 0) gone.push(e);
          });
          const want = line[last + 1] || line[last], free = function (h) { const c = RULES.cell(h[0], h[1]); return c && c.kind === 0 && !live().some(function (x) { return x !== u && gone.indexOf(x) < 0 && sameHex(x.t, h); }); };
          const land = free(want) ? want : playable().filter(free).sort(function (a2, b2) { return RULES.dist(a2, want) - RULES.dist(b2, want); })[0];
          if (land && !sameHex(land, u.t)) moves.push({ u: u, to: land.slice() });
        }
        else if (id === "CordClaw") fx.push({ u: u, id: "cord", until: round + 1, v: v });
        else if (id === "ThunderousAssault") { const dp = displaceOf(u, t, "push"); fx.push({ u: t, id: "stun", until: stunUntil(t) }); if (dp && dp.to) { moves.push({ u: t, to: dp.to.slice() }, { u: u, to: t.t.slice() }); } }
        else if (id === "MomentShackle") { heals = [{ u: u, amt: Math.min(u.max - u.hp, v.hpToHeal || 0) }].filter(function (h) { return h.amt > 0; }); fx.push({ u: u, id: "shackle", v: v, until: til2 }); }
        else if (id === "Drachnyen") {
          setHpL = [{ u: u, pct: Math.min(100, (v.hp || 1) / u.max * 100) }];
          fx.push({ u: u, id: "drach", until: 999, v: v });
        }  // (the normal melee attack is the action itself, on the enemy chosen)
        moves = moves.length ? moves : null;
      }
      if (sp && sp.line) {  // a line: every unit on it takes the hits (allies too when the text says "units"), pinned for some, the hexes contaminated for Rad Bombardment
        const L = LINE[o.ab[0]], v = vals_(o), len = L.len(v), line = dirLine(u.t, lineDir(u.t, t.t, len), len + 1).slice(1);
        const vic = live().filter(function (x) { return x !== u && !x.ds && line.some(function (h) { return sameHex(h, x.t); }) && (L.all || x.side !== u.side); });
        vic.filter(function (e) { return e !== t; }).forEach(function (e) { more.push(mh(u, e, avgOf(v, ""), o.ab[5], nI(v.nrOfHits, 1), o.name)); });
        if (L.pin) fx = (fx || []).concat(vic.map(function (e) { return { u: e, id: "pin", until: stunUntil(e) }; }));
        if (L.hx) line.forEach(function (h) { const c = RULES.cell(h[0], h[1]); if (c && c.kind === 0) hx.push(hexCover(h, L.hx)); });
      }
      if (!o.ab && ts.dmg > 0 && RULES.dist(u.t, t.t) > 1) {  // ranged normal attacks that light fires
        const fa3 = abOf(u, "FireOfAbsolution");
        if (fa3) RULES.around(t.t[0], t.t[1]).forEach(function (h) { const c = RULES.cell(h[0], h[1]); if (c && c.kind === 0 && rnd() * 100 < (parseInt(fa3.chance, 10) || 30)) hx.push(hexCover(h, "fire")); });
        if (abOf(u, "PsychicStalk")) hx.push(hexCover(t.t, "fire"));
      }
      more.forEach(function (x) { if (x.pinIt) fx = (fx || []).concat([{ u: x.tgt, id: "pin", until: stunUntil(x.tgt) }]); });
      if (!o.ab && ts.dmg > 0 && healthAfter(t, ts.dmg) <= 0 && !guardOf(t) && !mech(t) && abOf(u, "BarbedOvipositor")) { const bo = abOf(u, "BarbedOvipositor"); adds = (adds || []).concat([spawn("tyranSmnRipperSwarm", u.side, u, t.t.slice(), [bo.summonHp || 1, bo.summonDmg || 1, bo.summonArmor || 0], false)]); }  // a Ripper Swarm on the hex of what the Parasite killed
      if (ts.heal !== undefined) {  // Actus makes the unit he repairs attack at once; Vynn brings an E-COG each time he repairs
        const gf = abOf(u, "GalvanicField"), ec = abOf(u, "EcogSupport");
        if (gf) { const tg = targetsOf(t, { id: "atk", ok: true }).filter(function (x) { return x.dmg > 0; }).sort(function (a, b2) { return ((b2.dmg >= b2.u.hp) - (a.dmg >= a.u.hp)) || b2.dmg - a.dmg; })[0]; if (tg) more.push({ tgt: tg.u, dmg: tg.dmg, hits: tg.hits, per: tg.per, label: abName(u, "GalvanicField"), by: t }); }
        if (ec) {
          const mine5 = field.filter(function (x) { return x.parent === u && x.id === "votanSmnEcog" && x.alive; }), hs = prio(u, freeAround(u), u.t);
          if (mine5.length < (parseInt(ec.maxSummons, 10) || 3) && hs.length) adds = (adds || []).concat([spawn("votanSmnEcog", u.side, u, hs[0], [ec.summonHp || 1, ec.summonDmg || 1, ec.summonArmor || 0], false)]);
        }
      }
      if (!o.ab && ts.dmg > 0 && abOf(u, "ControlEdict")) {  // Tan Gi'da: protective imperative -> a Skitarii Vanguard next to him; conquering -> his mechanical summons next to him also hit the target
        const ce = abOf(u, "ControlEdict");
        if (!u.stance) { const mine6 = field.filter(function (x) { return x.parent === u && x.id === "admecSmnVanguard" && x.alive; }), hs = prio(u, freeAround(u), u.t); if (mine6.length < (parseInt(ce.maxSummons, 10) || 5) && hs.length) adds = (adds || []).concat([spawn("admecSmnVanguard", u.side, u, hs[0], [ce.summonHp || 1, ce.summonDmg || 1, ce.summonArmor || 0], false)]); }
        else live().filter(function (x) { return x.side === u.side && x.summon && x.tset.Mechanical && RULES.dist(x.t, u.t) === 1; }).forEach(function (x) { const e = targetsOf(x, { id: "atk", ok: true }).filter(function (y) { return y.u === t; })[0]; if (e && e.dmg > 0) more.push({ tgt: t, dmg: e.dmg, hits: e.hits, per: e.per, label: "Édit de contrôle", by: x }); });
      }
      if (!o.ab && ts.dmg > 0 && RULES.dist(u.t, t.t) === 1 && fxOn(u, "chalice")) heals = [{ u: u, amt: Math.min(u.max - u.hp, fxOn(u, "chalice").v.hpToHeal || 0) }].filter(function (h) { return h.amt > 0; });  // Blood Chalice: a melee attack heals
      if (!o.ab && ts.dmg > 0 && u.tset.SuppressiveFire && RULES.dist(u.t, t.t) > 1) fx = (fx || []).concat([{ u: t, id: "pin", until: stunUntil(t) }]);  // Suppressive Fire: a ranged hit pins its target
      let mkS = null;
      if (sp && sp.claws) {  // Crushing Claws: the target is taunted and pinned for a round; the enemies next to the Tyrant Guard or the target take a physical hit, are pushed back a hex and pinned
        const v = vals_(o);
        moves = moves ? moves.slice() : [];
        fx = (fx || []).concat([{ u: t, id: "taunt", taunt: u, until: stunUntil(t), v: {} }, { u: t, id: "pin", until: stunUntil(t) }]);
        foes(u).filter(function (e) { return e !== t && (RULES.dist(e.t, u.t) === 1 || RULES.dist(e.t, t.t) === 1); }).forEach(function (e) {
          const r = abilityHit(u, e, avgOf(v, "_2"), "Physical", nI(v.nrOfHits_2, 1)), dp = displaceOf(u, e, "push");
          more.push({ tgt: e, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: o.name });
          if (dp && dp.to) moves.push({ u: e, to: dp.to.slice() });
          fx.push({ u: e, id: "pin", until: stunUntil(e) });
        });
      }
      if (sp && sp.itches) {  // It Itches: an adjacent enemy and the enemies touching both it and the Parasite are pinned and pushed back a hex; a Ripper Swarm appears on each hex they leave and may attack at once; the Parasite can move again
        const v = vals_(o), hit = [t].concat(foes(u).filter(function (e) { return e !== t && RULES.dist(e.t, t.t) === 1 && RULES.dist(e.t, u.t) === 1; }));
        moves = moves ? moves.slice() : []; adds = adds || [];
        hit.forEach(function (e) {
          const dp = displaceOf(u, e, "push");
          fx = (fx || []).concat([{ u: e, id: "pin", until: stunUntil(e) }]);
          if (dp && dp.to) { moves.push({ u: e, to: dp.to.slice() }); const a = spawn("tyranSmnRipperSwarm", u.side, u, e.t, [v.summonHp || 1, v.summonDmg || 1, v.summonArmor || 0], false); a.immediate = true; adds.push(a); }
        });
      }
      if (sp && sp.wrath) {  // Overwhelming Wrath: every adjacent enemy is taunted until Azkor's next turn, he takes less from ranged attacks, and at the start of that turn the enemies around him are hit
        const v = vals_(o), til = u.side === 0 ? round : round + 1;
        fx = (fx || []).concat(foes(u).filter(function (e) { return RULES.dist(e.t, u.t) === 1; }).map(function (e) { return { u: e, id: "taunt", taunt: u, until: til, v: {} }; })).concat([{ u: u, id: "wrath", until: til, red: v.dmgReductionPct }]);
        mkS = [{ kind: "bomb", hexes: [u.t.slice()], ab: o.ab, adj: true }];
      }
      if (sp && sp.patrons) {  // Daemonic Patrons: the adjacent enemy is taunted, Hascule is observed until the end of his next turn
        fx = (fx || []).concat([{ u: t, id: "taunt", taunt: u, until: round + 1, v: {} }, { u: u, id: "observed", until: round + 1, v: vals_(o), kill: false }]);
      }
      if (sp && sp.disp && !(ts.dmg > 0 && healthAfter(t, ts.dmg) <= 0)) {  // the target is pulled or pushed, and may be taunted, and the caster may take its place
        const dp = displaceOf(u, t, sp.disp), v = (o.ab[8] && o.ab[8][rar]) || {}, at = dp && dp.to ? dp.to : t.t;
        moves = moves ? moves.slice() : [];
        if (dp && dp.to) moves.push({ u: t, to: dp.to.slice() });
        if (dp && dp.hurt) more.push({ tgt: t, dmg: dp.hurt, hits: 1, per: dp.hurt, label: "Déplacement impossible (20 % des PV max)" });
        if (sp.taunt && RULES.dist(u.t, at) === 1) fx = (fx || []).concat([{ u: t, id: "taunt", until: round + (parseInt(v.nrOfRounds, 10) || 3) - 1, taunt: u, v: {} }]);
        if (sp.swapIn && dp && dp.to) {  // Tjark takes the hex the target left, or a free one next to it
          const old = t.t, spots = [old].concat(RULES.around(old[0], old[1])).filter(function (h) {
            const c = RULES.cell(h[0], h[1]);
            return c && c.kind === 0 && !live().some(function (x) { return x !== u && x !== t && x.t[0] === h[0] && x.t[1] === h[1]; }) && !(h[0] === dp.to[0] && h[1] === dp.to[1]);
          });
          if (spots.length) moves.push({ u: u, to: spots[0].slice() });
        }
      }
      if (sp && sp.focus && live().some(function (x) { return x !== u && x.side === u.side && x.rules.fa === "DarkAngels" && RULES.dist(u.t, x.t) === 1; })) reuseL = [{ u: u }];  // next to another Dark Angel: usable again at once, with no recharge
      if (!o.ab && ts.dmg > 0 && t.side !== u.side) {  // normal attacks: the passives of summons
        const d1 = RULES.dist(u.t, t.t), pd = function (salt) { return mulberry(diceSeed() ^ (u.i * 40503) ^ (t.i * 9973) ^ salt)() * 100; };
        const hbp = abOf(u, "HeavyBoltPistol"); if (hbp && d1 === 1) more.push(mh(u, t, hbp.dmg || 0, "Bolter", nI(hbp.nrOfHits, 1), abName(u, "HeavyBoltPistol")));
        const fl2 = abOf(u, "FragLance"); if (fl2 && d1 === 1 && charges(u, t)) more.push(mh(u, t, avgOf(fl2, ""), "Blast", nI(fl2.nrOfHits, 1), abName(u, "FragLance")));
        const af = abOf(u, "AncientFury");
        if (af && d1 === 1) foes(u).filter(function (e) { return e !== t && RULES.dist(e.t, t.t) === 1 && RULES.dist(e.t, u.t) <= 2; }).forEach(function (e) { const r = damageOf(u, e, { w: mainWeapon(u, true) }, RULES.dist(u.t, e.t)); more.push({ tgt: e, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: "Doyen en furie" }); });  // Galatian: the enemies next to the target and next to him (or 2 away) are hit too
        const es2 = abOf(u, "ElectroShock");
        if (es2 && d1 === 1) {  // Electro-priest: a random enemy next to the target takes a share of the hit; both are pinned
          const c2 = foes(u).filter(function (e) { return e !== t && RULES.dist(e.t, t.t) === 1; }), e4 = c2.length ? c2[Math.floor(pd(11) / 100 * c2.length)] : null;
          fx = (fx || []).concat([{ u: t, id: "pin", until: stunUntil(t) }]);
          if (e4) { more.push({ tgt: e4, dmg: Math.round(ts.dmg * (parseInt(es2.dmgPct, 10) || 50) / 100), hits: ts.hits, per: Math.round(ts.per * (parseInt(es2.dmgPct, 10) || 50) / 100), label: abName(u, "ElectroShock") }); fx.push({ u: e4, id: "pin", until: stunUntil(e4) }); }
        }
        const mm2 = abOf(u, "MischiefMakers");
        if (mm2) { fx = (fx || []).concat([{ u: t, id: "noheal", until: stunUntil(t) + nI(mm2.nrOfRounds, 1) - 1 }]); if (pd(12) < (parseInt(mm2.chance, 10) || 25)) fx.push({ u: t, id: "pin", until: stunUntil(t) }); }  // Nurglings: no healing, and a chance to pin
        const sh2 = abOf(u, "Shrapnel");
        if (sh2 && d1 > 1) {  // Mortar team: 3 of the hexes around the target take blast hits too, and the units there are pinned
          const ring = RULES.around(t.t[0], t.t[1]).filter(function (h) { const c = RULES.cell(h[0], h[1]); return c && c.kind !== 2; });
          for (let k = 0, left = nI(sh2.nrOfProjectiles, 3); left > 0 && ring.length && k < 9; k++, left--) {
            const h2 = ring[Math.floor(pd(20 + k) / 100 * ring.length)];
            foes(u).filter(function (e) { return sameHex(e.t, h2); }).forEach(function (e) { more.push(mh(u, e, avgOf(sh2, ""), "Blast", nI(sh2.nrOfHits, 2), abName(u, "Shrapnel"))); fx = (fx || []).concat([{ u: e, id: "pin", until: stunUntil(e) }]); });
          }
        }
        const pyr = abOf(u, "Pyreblaster");
        if (pyr && d1 > 1) {  // Pyreblaster: the hex behind the target catches fire and burns whoever stands there
          const back = RULES.around(t.t[0], t.t[1]).filter(function (h) { return RULES.dist(u.t, h) === d1 + 1; })[0];
          if (back) { hx.push(hexCover(back, "fire")); foes(u).filter(function (e) { return sameHex(e.t, back); }).forEach(function (e) { more.push(mh(u, e, avgOf(pyr, ""), "Flame", nI(pyr.nrOfHits, 3), abName(u, "Pyreblaster"))); }); }
        }
      }
      if (!o.ab && ts.dmg > 0 && t.side !== u.side) {  // normal attacks: what states and passives add
        const fcx = fxOn(u, "facade"), frx = fxOn(u, "fear");
        if (fcx) more.push(mh(u, t, avgOf(fcx.v, ""), "Psychic", nI(fcx.v.nrOfHits, 1), "Façade de sorcier"));
        if (frx) more.push(mh(u, t, avgOf(frx.v, ""), "DirectDamage", nI(frx.v.nrOfHits, 3), "Peur de l'invisible"));
        if (RULES.dist(u.t, t.t) > 1 && abOf(u, "WhisperingWeb")) fx = (fx || []).concat([{ u: t, id: "web", until: 999, by: u, v: abOf(u, "WhisperingWeb") }]);  // Lhykhis: the target is affected until she attacks another one at range
        const tcv = abOf(u, "TerrorchemPoison");
        if (tcv && RULES.dist(u.t, t.t) === 1) fx = (fx || []).concat([{ u: t, id: "terror", until: stunUntil(t) + nI(tcv.nrOfRounds, 2) - 1, by: u, v: tcv }]);  // Daras: his melee attacks poison
        const sa = abOf(u, "ShockAssault");
        if (sa) live().filter(function (x) { return x.side === u.side && x.id === "ultraSmnInceptor" && RULES.dist(u.t, x.t) === 1; }).forEach(function (x) {  // Bellator: the adjacent Inceptors attack too, +damage
          const c = targetsOf(x, { id: "atk", ok: true }).filter(function (y) { return y.dmg > 0; }).map(function (y) { const r = damageOf(x, y.u, { w: mainWeapon(x, RULES.dist(x.t, y.u.t) === 1), extra: sa.extraDmg || 0 }, RULES.dist(x.t, y.u.t)); return { e: y.u, r: r }; })
            .sort(function (a2, b2) { return ((b2.r.tot >= b2.e.hp) - (a2.r.tot >= a2.e.hp)) || b2.r.tot - a2.r.tot; })[0];
          if (c) more.push({ tgt: c.e, dmg: Math.round(c.r.tot), hits: c.r.hits, per: Math.round(c.r.per), label: abName(u, "ShockAssault"), by: x });
        });
      }
      let drT = null;
      const dr = abOf(u, "DiabolicRegeneration");
      if (dr && ts.heal !== undefined && t !== u && t.rules.al === "Chaos" && RULES.dist(u.t, t.t) === 1 && t.drTurn !== turnNo) {  // Fabius: an adjacent Chaos unit he heals for the first time this turn attacks at once
        const c = targetsOf(t, { id: "atk", ok: true }).filter(function (y) { return y.dmg > 0; }).map(function (y) { const per = Math.min(y.per * (dr.dmgPct || 100) / 100, dr.maxDmg || 1e9); return { e: y.u, per: per, hits: y.hits, tot: per * y.hits }; })
          .sort(function (a2, b2) { return ((b2.tot >= b2.e.hp) - (a2.tot >= a2.e.hp)) || b2.tot - a2.tot; })[0];
        if (c) more.push({ tgt: c.e, dmg: Math.round(c.tot), hits: c.hits, per: Math.round(c.per), label: abName(u, "DiabolicRegeneration"), by: t });
        drT = t;
      }
      push({ k: "atk", u: u, tgt: t, pend: pend, dmg: ts.dmg, hits: ts.hits, per: ts.per, dv: ts.dv, cr: ts.cr, bl: ts.bl, abId: o.ab ? o.ab[0] : null, label: ts.heal !== undefined ? (u.tset.Healer ? "Soin" : "Réparation") : o.ab ? o.name : "Attaque",
        drT: drT, dead: ts.dmg > 0 && healthAfter(t, ts.dmg) <= 0 && !guardOf(t), adds: adds, heals: heals, moves: moves, fx: fx, more: more, buff: buff, also: also, force: (sp && (sp.wave || sp.forceT)) || linch ? t : null, keep: !!(sp && sp.keep), revive: reviveL, reuse: reuseL, setHp: setHpL, gone: gone, mark: mark, hx: hx, mk: mkS, lcUsed: lcUsed, prof: ts.prof || (o.ab ? o.ab[5] : null) });
    };
    // the game's shortcut: with a character chosen, a click on an enemy makes it walk to the best hex from which it can hit it and attack (its normal attack). The best hex is the one that does the most damage
    // (higher ground counts, razor wire and the hexes it cannot reach with a clear shot do not), then tall grass, higher ground, the shortest walk, then the clockwise order
    function autoAttack(u, t) {
      const o = options(u).filter(function (x) { return x.id === "atk"; })[0];
      if (!o || !o.ok || u.acted || !u.alive) return false;
      const reach = stepsOf(u, budget(u)), occ = {}, saved = { spent: u.spent, moves: u.moves };
      live().forEach(function (x) { if (x !== u) footOf(x).forEach(function (h) { occ[h[0] + "," + h[1]] = 1; }); });
      let best = null;
      Object.keys(reach).forEach(function (k) {
        const h = k.split(",").map(Number), c = RULES.cell(h[0], h[1]), k0 = reach[k];
        if (!c || c.kind !== 0 || occ[k]) return;
        u.spent = saved.spent + k0; u.moves = k0 ? saved.moves + 1 : saved.moves;  // the walk counts for the traits that depend on it
        let e = null;
        try { e = withPos(u, h, function () { return targetsOf(u, o).filter(function (x) { return x.u === t; })[0]; }); } finally { u.spent = saved.spent; u.moves = saved.moves; }
        if (!e || !(e.dmg > 0 || e.heal)) return;
        const key = [!(c.tile === "Swamp" && !u.rules.us && !u.rules.fl) ? 1 : 0, e.dmg, c.tile === "DryBush" && !u.tset.BigTarget ? 1 : 0, c.el || 0, -k0, -clockRank(u, t.t, h)];
        let better = !best;
        if (best) for (let i = 0; i < key.length; i++) if (key[i] !== best.key[i]) { better = key[i] > best.key[i]; break; }
        if (better) best = { h: h, k0: k0, key: key };
      });
      if (!best) return false;
      if (best.k0 > 0) push({ k: "mv", u: u, from: u.t.slice(), to: best.h, cost: best.k0, tp: false, tpm: false });
      strike(u, options(u).filter(function (x) { return x.id === "atk"; })[0], t);
      return true;
    }
    const strikeHex = function (u, o, h) {  // an ability that targets a hex: L'Accélération, Fusillade héroïque
      if (u.mow) return strikeMow(u, o, null, h);
      if (CULT[o.ab[0]].mark) {  // Titanhammer Squad: Lysander and the Terminator-armour allies within 2 are healed; those that have not moved may then be moved by the player onto or next to the marked hex
        const v = (o.ab[8] && o.ab[8][rar]) || {}, el = live().filter(function (x) { return x.side === u.side && (x === u || x.tset.TerminatorArmour) && RULES.dist(u.t, x.t) <= (parseInt(v.range, 10) || 2); });
        push({ k: "atk", u: u, tgt: u, dmg: 0, hits: 0, per: 0, abId: o.ab[0], label: o.name, dead: false, keep: true, more: [],
          heals: el.map(function (x) { return { u: x, amt: Math.min(x.max - x.hp, v.hpToHeal || 0) }; }).filter(function (x) { return x.amt > 0; }),
          fx: el.filter(function (x) { return x.moves === 0 && x.spent === 0; }).map(function (x) { return { u: x, id: "tpm", hex: h.slice(), until: round }; }), hx: [] });
        return;
      }
      if (CULT[o.ab[0]].pick) { pickedHex = h.slice(); try { strike(u, o, u); } finally { pickedHex = null; } return; }  // the summon goes on the chosen hex
      if (CULT[o.ab[0]].kauyon) {  // Exemplar of the Kauyon: Shadowsun goes to the hex, hits the nearest enemy with a normal attack plus 2 blast hits, and a stationary Command Drone takes the hex she left
        const v = (o.ab[8] && o.ab[8][rar]) || {}, old = u.t.slice(), drone = spawn("tauSmnDroneCommandLink", u.side, u, old, [v.summonHp || 1, v.summonDmg || 1, v.summonArmor || 0], true);
        const hit = withPos(u, h, function () {
          const c = targetsOf(u, { id: "atk", ok: true }).filter(function (x) { return x.dmg > 0; }).sort(function (a2, b2) { return RULES.dist(u.t, a2.u.t) - RULES.dist(u.t, b2.u.t) || b2.dmg - a2.dmg; })[0];
          const near = foes(u).sort(function (a2, b2) { return RULES.dist(u.t, a2.t) - RULES.dist(u.t, b2.t); })[0];
          const tg = c ? c.u : near;
          if (!tg) return null;
          const extra = abilityHit(u, tg, v.dmg || 0, o.ab[5] || "Blast", parseInt(v.nrOfHits, 10) || 2);
          return { tgt: tg, main: c, extra: { tgt: tg, dmg: Math.round(extra.tot), hits: extra.hits, per: Math.round(extra.per), label: o.name } };
        });
        push({ k: "atk", u: u, tgt: hit ? hit.tgt : u, dmg: hit && hit.main ? hit.main.dmg : 0, hits: hit && hit.main ? hit.main.hits : 0, per: hit && hit.main ? hit.main.per : 0, abId: o.ab[0], label: o.name,
          dead: !!(hit && hit.main && healthAfter(hit.tgt, hit.main.dmg) <= 0), moves: [{ u: u, to: h.slice() }], more: hit ? [hit.extra] : [], adds: [drone] });
        return;
      }
      if (CULT[o.ab[0]].leap) {
        const r = planFusillade(u, o, h);
        if (!r) return;
        push({ k: "atk", u: u, tgt: r.tgt, dmg: r.plan.main.dmg, hits: r.plan.main.hits, per: r.plan.main.per, abId: o.ab[0], label: o.name, dead: healthAfter(r.tgt, r.plan.main.dmg) <= 0, moves: r.plan.moves, more: r.plan.more });
        return;
      }
      const plan = planQuickening(u, o, h);
      push({ k: "atk", u: u, tgt: u, dmg: 0, hits: 0, per: 0, abId: o.ab[0], label: o.name, dead: false, moves: plan.moves, more: plan.more });
    };

    // ---- clicks on the characters (a move is a click on a hex it can reach, see below) ----
    const choose = function (u) {  // picking a character: its reach is computed for the zones
      if (sel !== u) { act = null; tgtSet = {}; hexSet = {}; }
      sel = u;
    };
    tokLayer.addEventListener("click", function (ev) {
      const g = ev.target.closest(".tk");
      if (!g) return;
      const u = units[+g.dataset.i];
      stop();
      // an action is chosen and this character is one of its targets: the click hits it
      if (act && sel && allyHex(u)) { const o = options(sel).filter(function (x) { return x.id === act.id; })[0]; if (o && o.ab) { strikeHex(sel, o, u.t.slice()); return; } }  // an ability that aims at a hex: a click on the unit standing there aims at its hex
      if (act && sel && tgtSet[u.i]) { const o = options(sel).filter(function (x) { return x.id === act.id; })[0]; strike(sel, o, u); return; }
      if (!act && sel && !sel.mow && mine() && u.side !== sel.side && u.alive && !u.ds && autoAttack(sel, u)) return;  // a character is chosen and an enemy is clicked: it walks to the best hex and attacks
      if (sel === u) { sel = null; act = null; tgtSet = {}; hexSet = {}; } else choose(u);  // clicking the chosen character again lets go of it
      render();
    });
    // a click on a hex the chosen character can reach moves it there; anywhere else on the board lets go of the choice
    svg.addEventListener("click", function (ev) {
      if (ev.target.closest(".tk")) return;
      const za = ev.target.closest(".rp-z-act");
      if (za && sel && act) { strikeHex(sel, options(sel).filter(function (x) { return x.id === act.id; })[0], [+za.dataset.c, +za.dataset.r]); return; }  // an ability that targets a hex
      const z = ev.target.closest(".rp-z-mv"), cell = z || ev.target.closest(".rp-cell");
      const c = cell ? [+cell.dataset.c, +cell.dataset.r] : null;
      if (c && sel && !(act) && reachNow[c[0] + "," + c[1]] && !occupant(c[0], c[1], sel) && moveTo(sel, c[0], c[1])) return;
      if (sel) { sel = null; act = null; tgtSet = {}; hexSet = {}; render(); }
    });
    // the character panel: the action buttons, then the targets
    $("sb-unit").addEventListener("click", function (ev) {
      const b = ev.target.closest(".sb-act");
      if (!b || !sel) return;
      if (act && act.id === b.dataset.act && tgtSet[sel.i]) { strike(sel, options(sel).filter(function (x) { return x.id === act.id; })[0], sel); return; }  // the ability is already chosen and the character is one of its targets: a second click on the button applies it to the character itself
      act = act && act.id === b.dataset.act ? null : { id: b.dataset.act };
      tipOpen = false;  // a freshly chosen ability: its tooltip shows only its title and the Infos button, closed
      tgtSet = {}; hexSet = {};
      const o = act && options(sel).filter(function (x) { return x.id === act.id; })[0];
      if (o && mine() && o.ok) targetsOf(sel, o).forEach(function (x) { tgtSet[x.u.i] = 1; });  // the characters it can hit light up: click one to launch it
      if (o && mine() && o.ok) hexesOf(sel, o).forEach(function (h) { hexSet[h[0] + "," + h[1]] = 1; });  // the hexes it can go to light up: click one
      render();
    });
    $("sb-tip").addEventListener("click", function (ev) {
      if (ev.target.closest(".sb-tip-x")) { act = null; tgtSet = {}; hexSet = {}; render(); }
      else if (ev.target.closest(".sb-tip-tog, .sb-tip-head, .sb-tip-ico")) { tipOpen = !tipOpen; render(); }
    });
    $("sb-tip").addEventListener("pointerdown", function (ev) { ev.stopPropagation(); });
    $("sb-log").onclick = function (e) { const li = e.target.closest("li[data-k]"); if (li) { stop(); go(+li.dataset.k); } };
    $("sb-seek").oninput = function (e) { stop(); go(+e.target.value); };
    $("sb-prev").onclick = function () { stop(); if (cur === steps.length && steps.length) steps.pop();  /* at the end: the last action is removed, to play it again with other dice */ go(cur - 1); };
    $("sb-next").onclick = function () { stop(); go(cur + 1); };
    $("sb-speed").onclick = function (e) { speed = speed === 1 ? 2 : speed === 2 ? 4 : 1; e.currentTarget.dataset.v = speed; e.currentTarget.textContent = "Vitesse ×" + speed; if (timer) { stop(); $("sb-play").click(); } };
    $("sb-play").onclick = function () {
      if (timer) return stop();
      if (!steps.length) return;
      if (cur >= steps.length) go(0);
      $("sb-play").innerHTML = I_PAUSE + '<span class="rp-lab"> Pause</span>';
      timer = setInterval(function () { if (seqActive) return; if (cur >= steps.length) return stop(); go(cur + 1); }, 900 / speed);
    };
    $("sb-end").onclick = function () { stop(); sel = null; push({ k: "end" }); };
    // ---- Auto: the side that has the move is played by the page. Each character in turn goes where it hurts most (a kill first, then the most damage; a normal attack or an active ability that hits a
    // target) and attacks; one that cannot hit anything walks toward the nearest enemy; then the turn ends. The summons already play by themselves at the start of the turn. ----
    let autoRun = false;
    const autoLabel = function () { const b = $("sb-auto"); b.textContent = autoRun ? "Stop" : "Auto"; b.disabled = !autoRun && active !== 1; };
    // The choice of a character (the summons' way, with the actives first): what it can do, from every hex it can reach: an active ability first (the character walks, then uses it as soon as it can; Mephiston and Judh
    // may not in round 1), then an overkill (the target is exterminated), then a kill, then the most damage; among the hexes that give the same hit: its guard in place, no razor wire, the help of an ally's ability, the highest ground, tall grass, the shortest walk.
    const planFor = function (u) {
      const opts = options(u).filter(function (o) { return o.ok && !(o.ab && o.ab[2] !== "a") && !(round <= 1 && o.ab && (o.ab[0] === "TheQuickening" || o.ab[0] === "HeroicFusillade")); });  // Mephiston and Judh may not use their active in round 1 (a deliberate nerf of the game's AI)
      const reach = u.mow ? { cur: 0 } : stepsOf(u, budget(u)), saved = { spent: u.spent, moves: u.moves };
      let best = null;
      Object.keys(reach).forEach(function (key) {
        const h = u.mow ? null : key.split(",").map(Number), c = h && RULES.cell(h[0], h[1]), k0 = reach[key];
        if (h && (!c || c.kind !== 0)) return;
        u.spent = saved.spent + k0; u.moves = k0 ? saved.moves + 1 : saved.moves;  // the walk counts for what depends on it
        try {
          const probe = function () { return { lists: opts.map(function (o) { return targetsOf(u, o); }), guard: guardAt(u) ? 1 : 0, buff: buffedAt(u, u.t) ? 1 : 0 }; };
          const here = h ? withPos(u, h, probe) : probe();
          opts.forEach(function (o, oi) {
            here.lists[oi].forEach(function (r) {
              if (!(r.dmg > 0) || r.heal || r.u.side === u.side) return;
              const over = r.dmg - r.u.hp >= r.u.max ? 1 : 0, kill = healthAfter(r.u, r.dmg) <= 0 ? 1 : 0;
              const wire = c && c.tile === "Swamp" && !u.rules.us && !u.rules.fl ? 0 : 1, grass = c && c.tile === "DryBush" && !u.tset.BigTarget ? 1 : 0;
              const rank = [o.ab ? 1 : 0, over, kill, Math.round(r.dmg), here.guard, wire, here.buff, c ? c.el || 0 : 0, grass, -k0];
              let better = !best;
              if (best) for (let i2 = 0; i2 < rank.length; i2++) if (rank[i2] !== best.rank[i2]) { better = rank[i2] > best.rank[i2]; break; }
              if (better) best = { h: h, k0: k0, o: o, t: r.u, rank: rank };
            });
          });
        } finally { u.spent = saved.spent; u.moves = saved.moves; }
      });
      return best;
    };
    const preActives = function (u) {  // an ability that buffs the character or its allies and does not end its turn (Waaagh!, the Mont'ka ...): used first
      options(u).filter(function (o) { const sp = o.ab && CULT[o.ab[0]]; return o.ok && sp && sp.self && sp.keep && sp.buffs; }).forEach(function (o) {
        if (u.alive && targetsOf(u, o).some(function (x) { return x.u === u; })) strike(u, o, u);
      });
    };
    // The abilities that deal no damage (a summon, a buff, a heal, a mark, a control) are used as soon as they can be, before the character moves and attacks: on itself, on the weakest ally
    // for a heal, on the nearest enemy for a control, on the hex nearest to it for a summon it can place.
    const useUtility = function (u) {
      options(u).filter(function (o) { return o.ok && o.ab && o.ab[2] === "a" && CULT[o.ab[0]]; }).forEach(function (o) {
        const sp = CULT[o.ab[0]];
        if (!u.alive || u.acted || fxOn(u, "stun") || !abReady(u, o.ab)) return;
        if (sp.hex || sp.leap || sp.kauyon || sp.mark || sp.dash || sp.barrage || sp.mow) return;  // aimed at a hex of the board: not in Auto
        if ((sp.heal || sp.healAdj) && !live().some(function (x) { return x.side === u.side && (x === u || RULES.dist(u.t, x.t) <= 1) && x.hp < x.max; })) return;  // nothing to heal
        if (sp.pick) {
          const hs = hexesOf(u, o);
          if (hs.length) strikeHex(u, o, prio(u, hs, u.t)[0]);
          return;
        }
        const ts = targetsOf(u, o);
        if (!ts.length || ts.some(function (x) { return x.dmg > 0; })) return;  // those that hit are the attack's business
        const ally = ts.filter(function (x) { return x.u.side === u.side; }), foe = ts.filter(function (x) { return x.u.side !== u.side; });
        const pick = ally.length ? ally.sort(function (a2, b2) { return a2.u.hp / a2.u.max - b2.u.hp / b2.u.max; })[0] : foe.sort(function (a2, b2) { return RULES.dist(u.t, a2.u.t) - RULES.dist(u.t, b2.u.t); })[0];
        if (pick) strike(u, o, pick.u);
      });
    };
    // Who plays next, as the game's AI chooses it (cascade: summons first -- they play by themselves at the start of the turn --, non-bosses before the boss, units that have just appeared, a score by
    // unit, then the one closest to an enemy). The score adds up, from the unit's id, its traits and its abilities: Hailstrike +10; Sorcerous Facade, Master of the Tutelaries +2; Psyker, Doombolt,
    // Master Annihilator, Cord Claw, Blood Chalice +1; Weaver of Fate, Voltagheist Field -2. The higher the earlier.
    const ORDER_SCORE = { Hailstrike: 10, SorcerousFacade: 2, MasterOfTheTutelaries: 2, Psyker: 1, Doombolt: 1, MasterAnnihilator: 1, CordClaw: 1, BloodChalice: 1, WeaverOfFate: -2, VoltagheistField: -2 };
    const orderScore = function (u) {
      const keys = [u.id].concat(Object.keys(u.tset || {})).concat((u.rules.ab || []).map(function (a) { return a[0]; }));
      return Object.keys(ORDER_SCORE).reduce(function (sum, w) { return sum + (keys.some(function (x) { return String(x).indexOf(w) >= 0; }) ? ORDER_SCORE[w] : 0); }, 0);
    };
    const nearestFoe = function (u) { return u.mow || !u.t ? 99 : Math.min.apply(null, foes(u).map(function (e) { return RULES.dist(u.t, e.t); }).concat([99])); };
    // A machine of war: its primary ability the first time it can be used (one use is all it has), then every turn its secondary one if it can; each time the plan (a target or a hex) that gives the most:
    // damage, or heals, buffs and summons when there is no damage to deal.
    const mowValue = function (p, u) {
      if (!p) return 0;
      const dmg = (p.main ? p.main.dmg : 0) + (p.more || []).reduce(function (a, x) { return a + (x.dmg || 0); }, 0);
      const heal = (p.heals || []).reduce(function (a, x) { return a + (x.amt || 0); }, 0);
      const buffs = (p.fx || []).filter(function (x) { return x.u && x.u.side === u.side; }).length * 1500 + (p.fx || []).filter(function (x) { return x.u && x.u.side !== u.side; }).length * 800;
      return dmg + heal + buffs + ((p.addsFn ? 3000 : (p.adds || []).length * 3000)) + (p.buff ? 1500 : 0);
    };
    const mowBest = function (u, o) {
      const M = MOW[o.ab[0]];
      if (!M || !o.ok || u.acted || !abReady(u, o.ab)) return null;
      let best = null;
      const consider = function (p, t, h) { const v = mowValue(p, u); if (v > 0 && (!best || v > best.v)) best = { v: v, t: t, h: h }; };
      if (M.hex) mowHexes(u, o).forEach(function (h) { consider(M.hexPlan(u, o, h, vOf(o)), null, h); });
      else mowTargets(u, o).forEach(function (x) { consider(x.plan, x.u, null); });
      return best;
    };
    const autoMow = function (u) {
      const opts = options(u).filter(function (o) { return o.ab && o.ab[2] === "a" && MOW[o.ab[0]]; });  // in the order of the unit: primary, then secondary
      for (let i = 0; i < opts.length; i++) {
        const pick = mowBest(u, opts[i]);
        if (pick) { strikeMow(u, opts[i], pick.t, pick.h); return true; }  // the primary is tried first; if it cannot be used the secondary is
      }
      return false;
    };
    const walkToward = function (u) {  // nothing to hit this turn: as far as it can go toward the nearest enemy by the way it would really walk (walls, cliffs), not into razor wire unless it must
      if (u.mow) return;
      const reach = stepsOf(u, budget(u)), foesNow = foes(u);
      if (!foesNow.length) return;
      const fly = !!u.rules.fl, pd = {}, queue = [];
      foesNow.forEach(function (e) { footOf(e).forEach(function (h) { const k = h[0] + "," + h[1]; if (pd[k] === undefined) { pd[k] = 0; queue.push(h); } }); });
      for (let i = 0; i < queue.length; i++) {  // the walking distance from the enemies (a flyer crosses walls, nobody climbs more than one level)
        const q = queue[i], here = RULES.cell(q[0], q[1]);
        RULES.around(q[0], q[1]).forEach(function (n) {
          const key = n[0] + "," + n[1], c = RULES.cell(n[0], n[1]);
          if (pd[key] !== undefined || !c || c.kind === 2 || (c.kind === 1 && !fly) || (!fly && here && Math.abs(c.el - here.el) > 1)) return;
          pd[key] = pd[q[0] + "," + q[1]] + 1; queue.push(n);
        });
      }
      const dist = function (h) { const v = pd[h[0] + "," + h[1]]; return v !== undefined ? v : 500 + Math.min.apply(null, foesNow.map(function (e) { return RULES.dist(h, e.t); })); };
      let best = null;
      Object.keys(reach).forEach(function (key) {
        const h = key.split(",").map(Number), c = RULES.cell(h[0], h[1]);
        if (!c || c.kind !== 0 || reach[key] === 0) return;
        const rank = [c.tile === "Swamp" && !u.rules.us && !u.rules.fl ? 0 : 1, -dist(h), c.el || 0, c.tile === "DryBush" && !u.tset.BigTarget ? 1 : 0, -reach[key]];  // at the same distance: the highest ground, then tall grass, then the shortest walk
        let better = !best;
        if (best) for (let i = 0; i < rank.length; i++) if (rank[i] !== best.rank[i]) { better = rank[i] > best.rank[i]; break; }
        if (better) best = { h: h, k0: reach[key], rank: rank };
      });
      if (best && -best.rank[1] < dist(u.t)) { push({ k: "mv", u: u, from: u.t.slice(), to: best.h, cost: best.k0, tp: false, tpm: false }); return true; }
      return false;
    };
    // An active that summons around its caster (Re'vas's Early Warning Override: two drones and the Sentinel mode) is used after a walk: to a hex that is not next to an enemy, as near as possible to the nearest
    // one (2 hexes from it), with room around for the summons. It returns true when the character has walked (the active then waits for the walk to end).
    const moveForActive = function (u) {
      if (u.mow || u.acted || !u.alive || fxOn(u, "stun")) return false;
      const o = options(u).filter(function (x) { const sp = x.ab && CULT[x.ab[0]]; return x.ok && x.ab && x.ab[2] === "a" && sp && sp.self && sp.summon && !sp.unmoved && !sp.pick && abReady(u, x.ab); })[0];
      if (!o) return false;
      const foesNow = foes(u);
      if (!foesNow.length) return false;
      const reach = stepsOf(u, budget(u)), saved = { spent: u.spent, moves: u.moves }, near = function (h) { return Math.min.apply(null, foesNow.map(function (e) { return RULES.dist(h, e.t); })); };
      let best = null;
      Object.keys(reach).forEach(function (key) {
        const h = key.split(",").map(Number), c = RULES.cell(h[0], h[1]), k0 = reach[key];
        if (!c || c.kind !== 0) return;
        u.spent = saved.spent + k0; u.moves = k0 ? saved.moves + 1 : saved.moves;
        let room = 0;
        try { room = withPos(u, h, function () { return freeAround(u).length; }); } finally { u.spent = saved.spent; u.moves = saved.moves; }
        if (!room) return;
        const d = near(h), far = d >= 2 ? 1 : 0;
        const rank = [far, far ? -d : d, c.tile === "Swamp" && !u.rules.us && !u.rules.fl ? 0 : 1, Math.min(room, 2), c.el || 0, c.tile === "DryBush" && !u.tset.BigTarget ? 1 : 0, -k0];
        let better = !best;
        if (best) for (let i = 0; i < rank.length; i++) if (rank[i] !== best.rank[i]) { better = rank[i] > best.rank[i]; break; }
        if (better) best = { h: h, k0: k0, rank: rank };
      });
      if (!best || best.k0 === 0) return false;
      push({ k: "mv", u: u, from: u.t.slice(), to: best.h, cost: best.k0, tp: false, tpm: false });
      return true;
    };
    const autoTurn = function () {
      if (autoRun) { autoRun = false; autoLabel(); return; }  // a second click stops it
      if (active !== 1) return;
      autoRun = true; stop(); autoLabel();
      const side = active, pool = units.filter(function (u) { return u.side === side && (u.mow || (field.indexOf(u) >= 0 && u.alive && !u.decoy && !u.summon && !u.auto)); });  // the machines of war are not in `field`: they are added here
      const next = function () {
        if (!autoRun) return;
        if (seqActive) { setTimeout(next, 120); return; }  // the beats of the last action are still playing
        if (active !== side) { autoRun = false; autoLabel(); return; }
        pool.sort(function (a, b2) { return orderScore(b2) - orderScore(a) || nearestFoe(a) - nearestFoe(b2) || a.i - b2.i; });  // asked again after every action: the board has changed
        const u = pool.shift();
        if (!u) { autoRun = false; autoLabel(); $("sb-end").onclick(); return; }
        if (!u.mow && (!u.alive || u.acted)) { next(); return; }
        sel = u; choose(u);
        if (u.mow) { autoMow(u); setTimeout(next, 450 / speed); return; }  // a machine of war: its primary ability, else its secondary
        preActives(u);
        const play = function () {  // the active that deals no damage (if it has one), then the walk and the attack
          useUtility(u);
          const plan = u.acted ? null : planFor(u);
          if (plan) {
            if (plan.h && plan.k0 > 0) {  // the walk first, and the attack once the character has arrived (the attack's beats redraw the board without transitions: played at once they would cut the walk short)
              push({ k: "mv", u: u, from: u.t.slice(), to: plan.h, cost: plan.k0, tp: false, tpm: false });
              setTimeout(function () { if (!autoRun) return; strike(u, plan.o, plan.t); setTimeout(next, 450 / speed); }, 480 / speed);
              return;
            }
            strike(u, plan.o, plan.t);
          } else if (!u.acted && walkToward(u)) {  // it only walked: once it has arrived, its active (or its attack) is used if the new hex allows it
            setTimeout(function () {
              if (!autoRun) return;
              const p2 = u.acted || !u.alive ? null : planFor(u);
              if (p2 && !(p2.h && p2.k0 > 0)) strike(u, p2.o, p2.t);
              setTimeout(next, 450 / speed);
            }, 480 / speed);
            return;
          }
          setTimeout(next, 450 / speed);
        };
        if (moveForActive(u)) setTimeout(function () { if (autoRun) play(); }, 480 / speed); else play();
      };
      next();
    };
    $("sb-auto").onclick = autoTurn;
    const undoLast = function () { stop(); if (!steps.length) return; steps.pop(); go(Math.min(cur, steps.length)); };  // « Préc. » at the end does the same; Ctrl/Cmd+Z too
    $("sb-reset").onclick = function () { stop(); steps.length = 0; sel = null; go(0); };
    // the toggles: classes on the board (altitude figures, grid lines), see style.css
    const toggle = function (id, cls, shownWhenOn) {
      $(id).onclick = function () { const on = svgBox.classList.toggle(cls); $(id).setAttribute("aria-pressed", String(shownWhenOn ? on : !on)); };
    };
    toggle("sb-el", "show-el", true);
    toggle("sb-grid", "no-grid", false);
    document.addEventListener("keydown", function (e) {
      if (/INPUT|SELECT|TEXTAREA/.test((e.target.tagName || "")) && e.target.type !== "range") return;
      if (e.key === "Escape" && (sel || act)) { if (act) { act = null; tgtSet = {}; hexSet = {}; } else sel = null; render(); }
      else if (e.key === "ArrowRight") { stop(); go(cur + 1); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { stop(); go(cur - 1); e.preventDefault(); }
      else if ((e.key === "z" || e.key === "Z") && (e.metaKey || e.ctrlKey)) { undoLast(); e.preventDefault(); }
    });
    settle(0);
    render();
  }
})();
