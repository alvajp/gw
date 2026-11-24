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
    const initUnit = function (u) {
      u.t = u.t0 && u.t0.slice();
      const st = u.rules.st && u.rules.st[rar];
      u.max = st ? st[0] : 0; u.max0 = u.max; u.atk = st ? st[1] : 0; u.arm = st ? st[2] : 0;  // health, damage, armour at the top of the rarity
      u.hp = u.max; u.alive = true; u.spent = 0; u.acted = false; u.nAtk = 0; u.hitNow = false; u.advStart = false;
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
      '<div class="rp-left"><div class="rp-boardwrap"><div class="sb-turn sb-turn-map"><button type="button" class="rp-btn rp-play" id="sb-end" title="Passer la main à l\'autre camp">Fin de tour</button><div class="sb-turnlab" id="sb-turnlab"></div></div><div class="rp-board sb-board" id="sb-board"></div></div></div>' +
      '<div class="rp-right"><div class="rp-ledger sb-unit" id="sb-unit"></div><div class="rp-ledger sb-stats" id="sb-stats"></div></div>' +
      '<div class="rp-logcol"><h3>Fil du combat</h3><ol class="rp-log" id="sb-log"></ol></div></div>' +
      '<div class="rp-dock"><input type="range" class="rp-seek" id="sb-seek" min="0" max="0" value="0" aria-label="Position dans le combat">' +
      '<div class="rp-ctl"><button type="button" class="rp-btn" id="sb-prev" title="Action précédente">' + I_PREV + '<span class="rp-lab"> Préc.</span></button>' +
      '<button type="button" class="rp-btn rp-play" id="sb-play" title="Lecture / pause">' + I_PLAY + '<span class="rp-lab"> Lecture</span></button>' +
      '<button type="button" class="rp-btn" id="sb-next" title="Action suivante"><span class="rp-lab">Suiv. </span>' + I_PLAY + "</button>" +
      '<button type="button" class="rp-btn" id="sb-undo" title="Supprimer la dernière action" disabled>Annuler</button><button type="button" class="rp-btn" id="sb-reset" title="Remettre tout le monde au départ" disabled>Réinitialiser</button>' +
      '' +
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
    hexes.forEach(function (c) {
      cells += '<polygon class="rp-cell" data-c="' + c[0] + '" data-r="' + c[1] + '" data-k="' + c[4] + '" points="' + hexAt(cx(c[0]), cy(c[0], c[1]), 0.97) + '" fill="' + tint(c) + '" stroke="rgba(0,0,0,.35)" stroke-width="1"' +
        (maskOf[c[0] + "," + c[1]] ? ' mask="url(#' + maskOf[c[0] + "," + c[1]] + ')"' : "") + "/>";
    });
    d.cells.forEach(function (c) { cells += '<text class="rp-el" x="' + (cx(c[0]) - R * 0.55).toFixed(1) + '" y="' + (cy(c[0], c[1]) - R * 0.45).toFixed(1) + '">' + c[3] + "</text>"; });
    const svgBox = $("sb-board");
    svgBox.innerHTML = '<svg viewBox="' + vb.map(function (v) { return v.toFixed(1); }).join(" ") + '" role="img" aria-label="Plateau">' +
      '<image x="' + vb[0].toFixed(1) + '" y="' + vb[1].toFixed(1) + '" width="' + vb[2].toFixed(1) + '" height="' + vb[3].toFixed(1) + '" preserveAspectRatio="none" href="' + assets + esc(pic.src) + '"/>' +
      cells + '<g id="sb-mk" class="sb-starts"></g><g id="sb-tiles"></g><g id="sb-zone"></g><g id="sb-hexes"></g><g id="sb-tok"></g><g id="sb-fx"></g><g id="sb-nums" class="sb-starts"></g></svg>';
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
    const home = function (u) { return u.mow ? dock(u.side) : [cx(u.t[0]), cy(u.t[0], u.t[1])]; };
    const makeToken = function (u) {  // the token of a character, a summon or a decoy
      if (!u.mow && !u.t) return;
      const col = u.side === 0 ? "#4ad1c0" : "#f06b6b", r = u.mow ? R * 0.88 : u.decoy ? R * 0.42 : R * 0.72;
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
      u.hpEl = g.querySelector(".tk-hp");
      u.stG = g.querySelector(".tk-sts"); u.stShown = {};
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
    const occupant = function (c, r, but) { return live().filter(function (o) { return o !== but && o.t[0] === c && o.t[1] === r; })[0]; };
    const turnStart = function () {  // a turn begins: nobody has moved or acted; the fallen of the side that plays come back on a decoy (Ambush); who stood next to an enemy is noted
      units.forEach(function (u) { if (u.side === active) { u.ow = false; u.owCut = 0; u.owForce = false; }  // Sentinelle ends as its owner's turn begins
        u.spent = 0; u.acted = false; u.noRanged = false; u.hitNow = false; u.usedActive = false; if (u.markedBy === active) { if (u.markFresh) u.markFresh = false; else { u.marked = false; u.markedBy = -1; } } });  // a mark lasts until its owner's next turn (a drone's markerlight: until the end of it)
      field.filter(function (u) { return u.fallen && u.side === active; }).forEach(function (u) {
        const mine = decoys().filter(function (x) { return x.side === u.side; });
        if (!mine.length) return;  // no decoy left: it stays down
        const dd = mine.indexOf(u.dd) >= 0 ? u.dd : mine[0];
        u.t = dd.t.slice(); u.hp = u.max; u.alive = true; u.fallen = false; dd.alive = false;
      });
      field.forEach(function (u) { u.advStart = u.alive && !u.decoy && nextTo(u); });
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
    const buffedAt = function (u, c) { return aurasOn(u, c).length > 0; };  // an ally nearby whose ability helps it, at the radius that ability gives (u.t is the hex being tried)
    const mineTurn = function (u, force) {
      const goal = force && force.alive ? force : foes(u).sort(function (a, b2) { return RULES.dist(u.t, a.t) - RULES.dist(u.t, b2.t); })[0];
      if (!goal) return null;
      const occ = {};
      live().forEach(function (x) { if (x !== u) occ[x.t[0] + "," + x.t[1]] = x; });
      const cells = RULES.reach({ from: u.t, mov: u.spent < 99 ? Math.max(0, mvOf(u) - u.spent) : 0, fly: true, free: true, enemy: function (c, r) { return false; }, any: function (c, r) { return !!occ[c + "," + r]; }, stop: tileStop });
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
      const home = u.t.slice(), occ = {}, canMove = u.spent < 99;
      live().forEach(function (x) { if (x !== u) occ[x.t[0] + "," + x.t[1]] = x; });
      const cells = RULES.reach({ from: u.t, mov: canMove ? Math.max(0, mvOf(u) - u.spent) : 0, fly: !!u.rules.fl, free: !!u.rules.us,
        enemy: function (c, r) { const o = occ[c + "," + r]; return !!o && o.side !== u.side; }, any: function (c, r) { return !!occ[c + "," + r]; }, stop: tileStop });
      const foesNow = foes(u), atk = { id: "atk", ok: true };
      const scored = cells.map(function (p) {
        u.t = [p.c, p.r];
        const all = targetsOf(u, atk), cell = RULES.cell(p.c, p.r) || {};
        const near = foesNow.length ? Math.min.apply(null, foesNow.map(function (e) { return RULES.dist(u.t, e.t); })) : 0;
        return { p: p, all: all, safe: !(cell.tile === "Swamp" && !u.rules.us && !u.rules.fl), buff: buffedAt(u, u.t), el: cell.el || 0, grass: cell.tile === "DryBush" && !u.tset.BigTarget, near: near };
      });
      u.t = home;
      // the victim: the enemy it can hit hardest from anywhere it can reach, a kill first
      const worth = {};
      scored.forEach(function (x) { x.all = x.all.filter(function (r) { return r.u.side !== u.side && !r.heal; }); x.all.forEach(function (r) { const w = worth[r.u.i] = worth[r.u.i] || { u: r.u, dmg: 0 }; w.dmg = Math.max(w.dmg, r.dmg); }); });
      const victim = (force && worth[force.i]) || Object.keys(worth).map(function (k) { return worth[k]; }).sort(function (a, b2) { return ((b2.dmg >= b2.u.hp) - (a.dmg >= a.u.hp)) || b2.dmg - a.dmg; })[0];
      scored.forEach(function (x) { x.best = victim ? x.all.filter(function (r) { return r.u === victim.u; })[0] || null : null; });
      const key = function (x) { return [x.best ? 1 : 0, x.safe ? 1 : 0, x.best ? 0 : -x.near, x.buff ? 1 : 0, x.el, x.grass ? 1 : 0, x.best ? x.best.dmg : 0, -x.p.k]; };
      scored.sort(function (a, b2) { const ka = key(a), kb = key(b2); for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i]; return 0; });
      const pick = scored[0];
      if (!pick) return null;
      const rec = { u: u, to: null, tgt: null, dmg: 0, hits: 0, per: 0, label: "Attaque" };
      if (pick.p.c !== home[0] || pick.p.r !== home[1]) { rec.to = [pick.p.c, pick.p.r]; u.t = [pick.p.c, pick.p.r]; u.spent += pick.p.k; rec.trig = checkMarks(u).concat(owReact(u)); }
      if (pick.best) {
        u.acted = true; u.nAtk++;
        rec.tgt = pick.best.u; rec.dmg = pick.best.dmg; rec.hits = pick.best.hits; rec.per = pick.best.per;
        curAtk++; guardLog = []; hurt(pick.best.u, pick.best.dmg, u, pick.best.per); rec.guards = guardLog;
      }
      return rec.to || rec.tgt ? rec : null;
    };
    const summonsPlay = function () {
      const out = [];
      field.filter(function (u) { return u.summon && !u.decoy && u.alive && u.side === active; }).sort(function (a, b2) { return a.i - b2.i; }).forEach(function (u) { const r = playSummon(u); if (r) out.push(r); });
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
        others.forEach(function (x) { occ[x.t[0] + "," + x.t[1]] = x; });
        const cells = RULES.reach({ from: u.t, mov: 2, fly: !!u.rules.fl, free: !!u.rules.us, enemy: function (c, r) { const o = occ[c + "," + r]; return !!o && o.side !== u.side; }, any: function (c, r) { return !!occ[c + "," + r]; }, stop: tileStop });
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
    let boomLog = [];
    const explode = function (m) {
      if (m.exploded) return [];
      m.exploded = true;
      const out = [];
      live().filter(function (e) { return e.side !== m.side && !e.ds && RULES.dist(e.t, m.t) === 1; }).forEach(function (e) {
        const r = abilityHit(m, e, m.boom.raw, m.boom.prof, m.boom.n);
        curAtk++; hurt(e, Math.round(r.tot), m, r.per);
        const rec = { tgt: e, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), from: m }; out.push(rec); boomLog.push(rec);
      });
      m.alive = false; m.hp = 0;
      return out;
    };
    const mineChain = function (m) {  // a defeated mine and the allied mines next to it
      const list = [m].concat(live().filter(function (x) { return isMine(x) && x.side === m.side && !x.exploded && RULES.dist(x.t, m.t) === 1; }));
      list.forEach(function (x) { if (x === m || x.alive) explode(x); });
    };
    let guardLog = [];
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
    let regenLog = [], turnNo = 0;
    const abOf = function (u, id) { const a = (u.rules.ab || []).filter(function (x) { return x[0] === id; })[0]; return a ? ((a[8] && a[8][rar]) || {}) : null; };
    const heal = function (u, amt, label) {
      amt = Math.max(0, Math.min(u.max - u.hp, Math.round(amt)));
      if (!amt || !u.alive) return 0;
      u.hp += amt; delete u.fx.stun; delete u.fx.pin; u.marked = false; u.markedBy = -1;
      regenLog.push({ u: u, amt: amt, label: label });
      return amt;
    };
    const mech = function (x) { return !!(x.tset.Mechanical || x.tset.LivingMetal); };
    const reviveBy = function (t) {  // Narthecium (an adjacent non-mechanical ally comes back with up to 7 830 health, once per turn), Tainted Narthecium (Chaos, 75 %)
      const near = live().filter(function (e) { return e.side === t.side && e !== t && RULES.dist(e.t, t.t) === 1 && e.narthAt !== turnNo; });
      for (let i = 0; i < near.length; i++) {
        const e = near[i], a = abOf(e, "Narthecium"), b2 = abOf(e, "TaintedNarthecium");
        if (mech(t)) continue;
        if (a) { e.narthAt = turnNo; return { by: e, hp: a.hp || 1 }; }
        if (b2 && t.rules.al === "Chaos") { e.narthAt = turnNo; if (stepRng() * 100 < (parseInt(b2.chance, 10) || 75)) return { by: e, hp: b2.hp || 1 }; }
      }
      return null;
    };
    const hurt = function (t, dmg, by, per) {  // a hit lands: its health, the kill of the one who struck, and the decoy a fallen Ambush unit leaves
      if (t.lastAtk !== curAtk) { t.lastAtk = curAtk; t.attacked++; }
      t.hitNow = true;
      const gp = by && by.side !== t.side && dmg > 0 ? guardOf(t) : null;
      if (gp) {
        const g = gp.g;
        if (gp.hex) { g.t = gp.hex.slice(); g.alive = true; g.came = true; g.hp = g.max; g.acted = false; g.spent = 0; }
        if (t.guardSwap) { const a = g.t; g.t = t.t; t.t = a; }  // Kell takes Creed's hex and Creed his
        guardLog.push({ from: t, g: g, fresh: !!gp.hex });
        t = g;
      }
      t.hp = healthAfter(t, dmg); t.lastPer = per || dmg;
      if (t.hp > 0 && dmg > 0) live().forEach(function (e) {  // Medicus Ministorum: an adjacent non-mechanical ally that took damage and stands regenerates
        const a = e.side === t.side && e !== t && RULES.dist(e.t, t.t) === 1 && !mech(t) ? abOf(e, "MedicusMinistorum") : null;
        if (a) heal(t, a.hpToHeal || 0, "Medicus Ministorum");
      });
      if (t.hp <= 0) {
        if (by && by.side !== t.side) by.kills++;
        const rv = reviveBy(t);
        if (rv) { t.hp = Math.min(t.max, rv.hp); regenLog.push({ u: t, amt: t.hp, label: "réanimé par " + rv.by.name, revive: true }); return; }
        t.alive = false;
        if (isMine(t) && !t.exploded) mineChain(t);
        if (t.ambush && t.dd) { t.ambush = false; t.fallen = true; t.dd.t = t.t.slice(); t.dd.alive = true; }
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
        if (mk.by.side !== active) { keep.push(mk); return; }
        if (mk.kind !== "bomb") return;
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
      });
      zmarks = zmarks.filter(function (mk) { return mk.hexes.length; });
      return out;
    };
    // regenerations that are not hits: after a move (Sanguinary Priest: the adjacent non-mechanical allies get 1 958-2 872; Fabricator Claw Array: a random adjacent mechanical ally gets 5 220), the same at the end of
    // the turn when the unit did not move; at the start of its turn Tough to Kill (Dreir) and Time Flux (Toth, plus the last hit he took, capped)
    const afterMove = function (u) {
      if (!u.alive) return;
      const sp = abOf(u, "SanguinaryPriest"), fa = abOf(u, "FabricatorClawArray");
      if (sp) live().filter(function (x) { return x.side === u.side && x !== u && RULES.dist(x.t, u.t) === 1 && !mech(x); }).forEach(function (x) { heal(x, (sp.hpToHeal || 0) + stepRng() * ((sp.maxHpToHeal || 0) - (sp.hpToHeal || 0)), "Prêtre sanguinaire"); });
      if (fa) { const near = live().filter(function (x) { return x.side === u.side && x !== u && RULES.dist(x.t, u.t) === 1 && mech(x) && x.hp < x.max; }); if (near.length) heal(near[Math.floor(stepRng() * near.length)], fa.hpToRepair || 0, "Réseau de griffes"); }
    };
    const endRegen = function () { field.forEach(function (u) { if (u.alive && u.side === active && u.spent === 0 && (abOf(u, "SanguinaryPriest") || abOf(u, "FabricatorClawArray"))) afterMove(u); }); };
    const startRegen = function () {
      live().filter(function (u) { return u.side === active; }).forEach(function (u) {
        const tk = abOf(u, "ToughToKill"), tf = abOf(u, "TimeFlux");
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
        const w = mainWeapon(x, false), dd = RULES.dist(x.t, mv.t);
        if (!w || w[0] <= 1 || dd < 2 || dd > w[0] || !RULES.sight(x.t, mv.t) || nextTo(x)) return;
        const id = abOf(x, "InescapableDeath"), sn = fxOn(x, "sentinel"), hail = fxOn(x, "hail"), cutBy = (id ? parseInt(id.hitsReduction, 10) || 1 : 0) || (sn ? parseInt(sn.cut, 10) || 1 : 0);
        const w2 = [w[0], w[1], Math.max(1, w[2] - x.owCut)], r = damageOf(x, mv, { w: w2, extra: (id ? id.extraDmg || 0 : 0) + (sn ? sn.extra || 0 : 0), pierce: hail ? (hail.v && hail.v.extraPierceRatio) || 0 : 0 }, dd);
        curAtk++; hurt(mv, Math.round(r.tot), x, r.per);
        out.push({ u: x, to: null, tgt: mv, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: "Sentinelle" });
        if (hail && hail.by) {  // the Storm Speeder fires at the same target
          const hv = hail.v || {}, r2 = abilityHit(hail.by, mv, avgOf(hv, ""), hail.by.rules.ab.filter(function (a) { return a[0] === "Hailstrike"; })[0][5], parseInt(hv.nrOfHits, 10) || 3);
          curAtk++; hurt(mv, Math.round(r2.tot), hail.by, r2.per);
          out.push({ u: hail.by, to: null, tgt: mv, dmg: Math.round(r2.tot), hits: r2.hits, per: Math.round(r2.per), label: "Hailstrike" });
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
    const settle = function (k) {  // everybody on the hexes, with the health, they have after k steps, and whose turn it is
      field.forEach(function (u) { u.max = u.max0; u.fx = {}; u.twisted = false; u.twistDmg = 0; u.t = u.t0 ? u.t0.slice() : null; u.hp = u.max; u.alive = !u.summon; u.nAtk = 0; u.kills = 0; u.attacked = 0; u.lastAtk = -1; u.annBy = null; u.shun = null; u.used = {}; u.marked = false; u.markedBy = -1; u.markFresh = false; u.came = false; u.exploded = false; u.ow = false; u.owCut = 0; u.owForce = false; u.ds = !!u.tset.TeleportStrike && !u.summon; u.noRanged = false; u.lastSpent = 0; u.nano = false; u.moveBonus = 0; u.shroud = 0; u.ambush = !!u.tset.Ambush && !u.decoy; u.fallen = false; });
      round = 1; active = 0; pending = []; hexfx = {}; zmarks = []; turnNo = 0; regenLog = []; boomLog = [];
      units.forEach(function (u) { u.lastPer = 0; u.narthAt = -1; if (u.mow) { u.fx = {}; u.used = {}; u.acted = false; u.deployed = false; u.nAtk = 0; u.usedActive = false; } });
      turnStart();
      for (let i = 0; i < k; i++) {
        const m = steps[i];
        curAtk++; stepRng = mulberry(((i + 1) * 2654435761) ^ 0x51ed270b); regenLog = []; boomLog = [];
        if (m.k === "mv") {
          m.u.t = m.to.slice(); m.u.spent += m.cost; if (m.tp) m.u.noRanged = true;  // Deep Strike: it teleported, no ranged attack until the end of its turn
          decoys().forEach(function (x) { if (x.side !== m.u.side && x.t[0] === m.to[0] && x.t[1] === m.to[1]) x.alive = false; });  // an enemy stepping on a decoy destroys it
          m.trig = checkMarks(m.u).concat(owReact(m.u));  // a mine under its feet, a unit that watches
          afterMove(m.u);  // Sanguinary Priest, Fabricator Claw Array
        } else if (m.k === "atk") {
          m.u.acted = true; m.u.ds = false; m.u.nAtk++; if (m.abId) { m.u.usedActive = true; m.u.used[m.abId] = round; }
          (m.moves || []).forEach(function (x) { x.u.t = x.to.slice(); });  // the moves of the action (a pull, a dash, a swap)
          (m.fx || []).forEach(function (x) { x.u.fx[x.id] = x; if (x.id === "sentinel") x.u.owForce = true; });  // the states it puts on units
          (m.gone || []).forEach(function (g) { g.alive = false; });  // a drone sent away to make room (Sho'syl keeps 3)
          guardLog = [];
          if (m.dmg > 0) hurt(m.tgt, m.dmg, m.u, m.per);
          (m.more || []).forEach(function (x) { hurt(x.tgt, x.dmg, x.by || m.u, x.per); });  // the other hits of the action (splash, a second attack)
          m.guards = guardLog;  // who took a hit in the place of its owner (for the log)
          (m.mk || []).forEach(function (x) { zmarks.push(Object.assign({}, x, { by: m.u, hexes: x.hexes.map(function (h) { return h.slice(); }) })); });  // the zones it marks
          (m.buff || []).forEach(function (x) { if (x.u.alive) { x.u.max += x.hp; x.u.hp += x.hp; x.u.nano = true; } });  // Nanoscarab protocols: health and maximum health
          if (m.deploy) m.u.deployed = true;
          (m.hx || []).forEach(function (x) { hexfx[x.h[0] + "," + x.h[1]] = x; });  // the hexes it covers with fire, ice ...
          (m.heals || []).forEach(function (h) { if (h.u.alive) { h.u.hp = Math.min(h.u.max, h.u.hp + h.amt); delete h.u.fx.stun; delete h.u.fx.pin; delete h.u.fx.brazier; h.u.marked = false; h.u.markedBy = -1; } });  // a heal ends a stun, a pin, a markerlight
          const tw = (m.u.rules.ab || []).filter(function (a) { return a[0] === "TwistedScience"; })[0];
          if (tw && m.heals) m.heals.forEach(function (h) {  // Twisted Science: a unit Hollan heals gets 3 916 health and maximum health for good, and the cult units hit harder
            const x = h.u, v = (tw[8] && tw[8][rar]) || {};
            if (x !== m.u && x.alive && !x.twisted) { x.twisted = true; x.twistDmg = v.extraDmg || 0; x.max += v.hp || 0; x.hp += v.hp || 0; }
          });
          if (m.label === "Attaque" && m.dmg > 0 && (m.u.rules.ab || []).some(function (a) { return a[0] === "MasterAnnihilator"; })) { field.forEach(function (x) { if (x.annBy === m.u) x.annBy = null; }); m.tgt.annBy = m.u; }  // Master Annihilator: its target is marked until it attacks another or falls
          if (m.mark && m.tgt.alive) { m.tgt.marked = true; m.tgt.markedBy = m.u.side; m.tgt.markFresh = true; }  // the markerlight of a drone attack lasts through the owner's next turn
          if (m.pend) { pending.push(m.pend); if (!m.pend.noMark) { m.tgt.marked = true; m.tgt.markedBy = m.u.side; } }  // the missile is on its way, the target is marked
          if (m.tgt !== m.u && (m.u.rules.ab || []).some(function (a) { return a[0] === "StructuralAnalyser"; }) && RULES.dist(m.u.t, m.tgt.t) > 1) { m.tgt.marked = true; m.tgt.markedBy = m.u.side; }  // Darkstrider's ranged hits mark
          (m.adds || []).forEach(function (a) {  // what the action summoned (decoys, neophytes ...)
            a.t = a.t0.slice(); a.hp = a.max; a.alive = true; a.acted = false; a.spent = a.noMove ? 99 : 0;
            if (a.replaces) a.replaces.alive = false;
          });
          const now = (m.also || []).filter(function (a) { return a.alive && a !== m.u; }).map(function (a) { a.acted = false; a.spent = 0; return a; }).concat((m.adds || []).filter(function (a) { return a.immediate && !a.decoy; }));
          m.autoNow = now.map(function (a) { return playSummon(a, m.force); }).filter(Boolean);
          m.react = (m.moves || []).some(function (x) { return x.u === m.u; }) && m.u.alive ? owReact(m.u) : [];  // a charge or a dash ends next to someone who watches  // they take their turn at once (the summoned ones, and the others the ability orders to play)
        } else {  // end of turn: the other side plays
          field.forEach(function (x) { if (x.side === active) { x.ds = false; x.lastSpent = x.spent; } });
          field.forEach(function (x) {  // Sentinelle: a unit that did not attack this turn (Re'vas: when she says so; Sekhetar: next to a psyker) watches the enemy turn
            if (x.side !== active) return;
            x.ow = x.alive && ((x.tset.Overwatch && !x.acted) || x.owForce || (!!abOf(x, "PropheticSentinel") && live().some(function (y) { return y.side === x.side && y !== x && y.tset.Psyker && RULES.dist(y.t, x.t) === 1; })));
          });
          endRegen();  // the regenerations that wait for the end of a turn when the unit has not moved
          turnNo++;  // a unit in Deep Strike mode can be hit again once its side's turn is over
          if (active === 0) active = 1; else { active = 0; round++; }
          turnStart();
          startRegen();  // Tough to Kill, Time Flux
          m.auto = tileTurn().concat(resolveMarks(), resolvePending(), summonsPlay(), betray());  // what acts by itself at the start of this turn: the summons first, then the characters that do
        }
        m.regen = regenLog; m.booms = boomLog;  // the heals, the revivals and the mine blasts this step caused
      }
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
    const nextTo = function (u) { return live().some(function (o) { return o.side !== u.side && RULES.dist(u.t, o.t) === 1; }); };
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
      let arm = t.arm;
      aurasOn(t, t.t).forEach(function (a) {
        if (a.id === "KustomForceFieldReworked") arm += t.rules.fa === "Orks" ? a.v.extraArmor_2 : a.v.extraArmor;
        else if (a.id === "PropheticSentinel" || a.id === "StandVigil") arm += a.v.extraArmor || 0;
      });
      if (hexKind(t.t) === "contam" && !t.tset.Mechanical && !t.tset.ContagionsOfNurgle) arm *= 1 - (TV.contaminatedArmorReductionPct || 30) / 100;  // contaminated hex: -30 % armour (mechanical units and Nurgle's are spared)
      const n = live().filter(function (e) { return e.side !== t.side && e.tset.ContagionsOfNurgle && RULES.dist(e.t, t.t) <= contagionRange(); }).length;
      if (n) arm *= 1 + (n >= 2 ? TV.contagionsOfNurgleArmorTwoOrMoreAuras : TV.contagionsOfNurgleArmorOneAura) / 100;
      return Math.max(0, arm);
    }
    function auraCut(t, profile) {  // what the auras of its allies take off a hit it takes: a flat figure, a percentage
      let flat = 0, mult = 1;
      aurasOn(t, t.t).forEach(function (a) {
        if (profile === "Psychic" && a.id === "PsychicFortress") flat += a.v.dmgReduction || 0;
        else if (profile === "Psychic" && a.id === "DaughterOfTheAbyss") { if (a.e === t) flat += a.v.dmgReduction || 0; else mult *= 1 - (a.v.dmgReductionPct || 0) / 100; }
      });
      return { flat: flat + (t.shroud || 0), mult: mult };  // shroud: Nightshroud, from the start of its turn
    }
    // how far a unit walks in a turn: its movement, Rapid Assault until it attacks, what the auras gave it at the start of the turn
    const mvOf = function (u) { if (fxOn(u, "stun")) return 1;  // stunned: 1 movement
      const wg = fxOn(u, "waaagh"), pn = fxOn(u, "pin") ? 1 : 0;  // pinned: 1 movement less
      return Math.max(0, (u.rules.mv || 0) + (u.rules.ra ? 1 : 0) + (u.moveBonus || 0) + (wg ? parseInt(wg.v && wg.v.extraMovement, 10) || 1 : 0) - pn); };
    // spec: {ab: the ability} or {w: the weapon [reach, damage profile, hits]}; dd: the distance
    function damageOf(u, t, spec, dd) {
      const ab = spec.ab, cu = cellAt2(u), ct = cellAt2(t), tr = u.tset, tt = t.tset;
      const profile = ab ? (ab[5] || (u.rules.wp && u.rules.wp.length ? u.rules.wp[u.rules.wp.length - 1][1] : "Physical")) : spec.w[1];
      const ranged = ab ? ab[4] !== "Melee" : spec.w[0] > 1, indirect = !!u.rules.id;
      let hits = ab ? (ab[6] || 1) : spec.w[2], raw = ab ? ab[3][rar] : u.atk, ign = 0;
      if (ab && ab[0] === "BrazierOfHolyFire" && tt.Daemon) hits = parseInt(ab[8][rar].nrOfHits_2, 10) || hits;  // against a Daemon: more hits
      if (fxOn(u, "stun")) raw *= 0.5;  // stunned: -50 % damage
      if (fxOn(u, "pin")) raw *= 0.7;  // pinned: -30 % damage
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
        const au = auraAtk(u, t, null, ranged, profile), wg = fxOn(u, "waaagh");  // Waaagh!: +dmg and one more hit on the normal melee attacks
        if (wg && !ranged) { au.flat += (wg.v && wg.v.extraDmg) || 0; au.hit += 1; }
        const cf = fxOn(u, "conflag");
        if (cf && ranged && hexKind(t.t) === "fire") au.pct += (cf.v && cf.v.extraDmgPct) || 0;  // Thrice Blessed Conflagration: more damage at range on burning hexes
        raw = (raw + au.flat + (spec.extra || 0) + (u.twisted && u.rules.fa === "Genestealers" ? u.twistDmg : 0)) * (1 + bonus / 100) * (1 + au.pct / 100);  // the allies' auras add flat damage per hit, and a percentage
        hits += au.hit; ign = au.ign;
        if (cu.el > ct.el && !inTrench) raw *= 1 + (TV.elevationBonus || 50) / 100;  // higher ground (a trench cancels it)
        if (profile === "Melta" && tt.Vehicle) raw *= 1.5;  // Melta: +50 % against vehicles
        if (tr.Dakka && spec.w[0] >= 3 && dd === 2) hits += TV.dakkaExtraHits || 0;
      }
      // what takes hits off a ranged attack or a multi-hit one
      let cut = 0;
      if (ranged) cut += tt.Camouflage ? (inGrass ? TV.camouflageHitReduction_3 : dd > 2 ? TV.camouflageHitReduction_2 : TV.camouflageHitReduction_1) || 0 : inGrass ? TV.lightCoverHitReduction || 2 : 0;
      if (tt.Diminutive) cut += TV.diminutiveHitReduction || 1;
      if (tt.Parry && !ranged) cut += TV.parryHitReduction || 1;
      hits = Math.max(1, hits - cut);
      if (ab) raw *= 1 + auraAtk(u, t, ab, ranged, profile).pct / 100;
      const arm = Math.max(0, armorOf(t) - ign), cutA = auraCut(t, profile);
      let per = armorDamage(raw, profile, arm, spec.pierce);  // spec.pierce: extra pierce ratio (Hailstrike)
      if (tt.MkXGravis) per = armorDamage(per, profile, arm);  // the damage goes through the armour a second time
      let mod = 1;  // the target's own modifiers
      const mindT = fxOn(t, "mind");
      if (mindT) mod *= 1 + ((mindT.v && mindT.v.extraDmgPct) || 0) / 100;  // Mind Control: it takes more
      const bz = fxOn(t, "brazier");
      if (bz) mod *= 1 + (bz.pct || 0) / 100;  // Brazier of Holy Fire: the Daemons around the target take more
      if (t.marked && ranged && u.rules.fa === "Tau") mod *= 1.15;  // markerlight: +15 % from the ranged attacks of T'au units
      if (ct.tile === "Swamp") mod *= 1 + (TV.swampBonus || 50) / 100;
      if (inTrench && cu.tile !== "Trench" && !indirect) mod *= 1 + (TV.trenchBonus || -50) / 100;
      if (ct.tile === "Shrub") mod *= 1 + (TV.shrubBonus || -50) / 100;
      if (tt.PrioritisedEfficiency && t.spent < (TV.prioritisedEfficiencyMovement || 3)) mod *= 1 - (TV.prioritisedEfficiencyDmgReductionPct || 25) / 100;
      if (tt.MartialKatah && !ab) mod *= 1 - (TV.martialKatahDmgReductionPct || 20) / 100;
      if (tt.TerminatorArmour && !t.hitNow && String(TV.terminatorArmourExcludedDmgProfiles || "").split(",").indexOf(profile) < 0) mod *= 1 + (TV.terminatorArmourDmgReduction || -75) / 100;
      const duel = fxOn(t, "taunt");  // Holy Duel: the dueller takes less from his partner
      per = Math.max(1, (per - cutA.flat - (duel && duel.taunt === u ? duel.reduce || 0 : 0)) * mod * cutA.mult);
      if (t.shun && t.shun.kind === 1) per *= 1 - (t.shun.v.dmgReductionPct || 0) / 100;  // Serene Unifier, first round of its cycle: -50 % damage taken
      if (tt.TwoManTeam) per = Math.min(per, t.max / 2);  // a single hit takes at most half of its health
      let total = per * hits;
      if (!ab && t.annBy && t.annBy.alive && t.annBy.side === u.side && profile !== "Psychic") { const x = Math.min(per, (t.annBy.rules.ab.filter(function (a) { return a[0] === "MasterAnnihilator"; })[0][8][rar] || {}).maxDmg || per); total += x; hits += 1; }  // Master Annihilator: one more hit, at most its cap
      return { tot: total, per: total / hits, hits: hits };  // the damage of one hit, the number of hits, the total
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
      Stormcaller: { ice: true, hitAll: true }, GreatFrostAxe: { ice: true }, BrazierOfHolyFire: { fire: true }, TotalObliteration: { fire: true }, HolyDuel: { duel: true } };
    function spawn(id, side, parent, t, stats, noMove) {  // a new unit (stats: [health, damage, armour], none for a decoy) not yet on the board: the step that summons it puts it there
      const sm = (UNITS._summons || {})[id] || {}, rules = Object.assign({}, sm);
      rules.st = stats ? (function () { const o = {}; o[rar] = stats; return o; })() : null;
      const u = { id: id, side: side, mow: false, name: sm.name || id, img: assets + "npcs/" + id + ".webp", rules: rules, relic: null, t: t.slice(), t0: t.slice(), summon: true, decoy: id === "genesSmnDecoy", parent: parent, noMove: !!noMove };
      u.i = units.length; units.push(u); field.push(u); initUnit(u); u.alive = false; makeToken(u);
      if (u.tset.Ambush && !u.decoy) u.dd = spawn("genesSmnDecoy", side, u, t, null);  // the decoy it leaves when it falls
      return u;
    }
    function freeAround(u) {  // the free hexes next to a unit (those without a decoy first)
      const taken = {}, dec = {};
      live().forEach(function (x) { taken[x.t[0] + "," + x.t[1]] = 1; });
      decoys().forEach(function (x) { dec[x.t[0] + "," + x.t[1]] = x; });
      return prio(u, RULES.around(u.t[0], u.t[1]).filter(function (h) { const c = RULES.cell(h[0], h[1]); return c && c.kind === 0 && !taken[h[0] + "," + h[1]]; }), u.t)
        .sort(function (a, b2) { return (dec[a[0] + "," + a[1]] ? 1 : 0) - (dec[b2[0] + "," + b2[1]] ? 1 : 0); });
    }
    // where a unit goes when the game "chooses" a hex around a centre: not razor wire, the highest ground, tall grass, then clockwise from the north (from the south for the side that starts at the top,
    // as if its screen were turned round)
    const clockRank = function (u, c, h) { const i = RULES.around(c[0], c[1]).findIndex(function (x) { return x[0] === h[0] && x[1] === h[1]; }); return i < 0 ? 9 : (i - (u.side === 1 ? 3 : 0) + 6) % 6; };
    const prio = function (u, hs, c) {
      return hs.slice().sort(function (a, b2) {
        const ca = RULES.cell(a[0], a[1]), cb = RULES.cell(b2[0], b2[1]);
        return ((ca.tile === "Swamp") - (cb.tile === "Swamp")) || (cb.el - ca.el) || ((cb.tile === "DryBush") - (ca.tile === "DryBush")) || (clockRank(u, c, a) - clockRank(u, c, b2));
      });
    };
    // the three hexes of a big shape anchored on h: h and two neighbours that touch each other, the first pair being north and north-east (south and south-west for the top side), then clockwise
    const footprints = function (u, h) {
      const ring = RULES.around(h[0], h[1]), st = u.side === 1 ? 3 : 0, out = [];
      for (let k = 0; k < 6; k++) out.push([h.slice(), ring[(st + k) % 6], ring[(st + k + 1) % 6]]);
      return out;
    };
    const waaaghSpots = function (u, t, vals) { return u.spent === 0 ? prio(u, freeAround(u), u.t).slice(0, parseInt(vals.nrOfSummons, 10) || 2) : []; };
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
        live().forEach(function (x) { taken[x.t[0] + "," + x.t[1]] = 1; });
        d.cells.filter(function (c) { const k = c[0] + "," + c[1], dd = RULES.dist(t.t, [c[0], c[1]]); return c[4] === 0 && dd >= 1 && dd <= 2 && !taken[k] && (dd <= 1 || RULES.sight([c[0], c[1]], t.t)); })
          .sort(function (a, b2) { const da = RULES.dist(t.t, [a[0], a[1]]), db = RULES.dist(t.t, [b2[0], b2[1]]); return (db === 2) - (da === 2) || b2[3] - a[3] || (b2[2] === "DryBush") - (a[2] === "DryBush") || a[0] - b2[0] || a[1] - b2[1]; })  // a hex to shoot from (not next to the target), the highest, tall grass
          .slice(0, n).forEach(function (c) { put("astraSmnGuardsman", [c[0], c[1]], stat(""), true); });
      } else if (id === "Waaagh") {  // Gulgortz, if he has not moved: 2 Ork Boyz on free hexes next to him (toward the target)
        waaaghSpots(u, t, vals).forEach(function (h) { put("orksOrkBoys", h, stat(""), false); });
      } else if (id === "MightFromBelow") {  // a Purestrain Genestealer on every decoy of its side next to the Patriarch
        decoys().filter(function (x) { return x.side === u.side && RULES.dist(u.t, x.t) === 1; }).forEach(function (x) { put("genesSmnGenestealer", x.t, stat(""), true); });
      } else if (id === "CultDemagogue") {  // up to 8 decoys on free hexes within 2 of the target, then a Neophyte on half of the allied decoys of the area
        const near = function (h) { return RULES.dist(t.t, h) <= 2; }, taken = {};
        live().forEach(function (x) { taken[x.t[0] + "," + x.t[1]] = 1; });
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
    const hexCover = function (h, kind) { return { h: h.slice(), kind: kind, until: round + 1 }; };
    const iceAround = function (u) { return RULES.around(u.t[0], u.t[1]).filter(function (h) { return hexKind(h) === "ice"; }).length; };
    const stunUntil = function (u) { return u.side === 1 ? round : round + 1; };  // the round of the target's next turn
    const withPos = function (x, cell, fn) { const old = x.t; x.t = cell; try { return fn(); } finally { x.t = old; } };
    const freeAdj = function (t, but) {  // the free hexes around a unit
      const taken = {};
      live().forEach(function (x) { if (x !== but) taken[x.t[0] + "," + x.t[1]] = 1; });
      return RULES.around(t.t[0], t.t[1]).filter(function (h) { const c = RULES.cell(h[0], h[1]); return c && c.kind === 0 && !taken[h[0] + "," + h[1]]; });
    };
    const mainWeapon = function (u, melee) { const wp = u.rules.wp || []; return (wp.filter(function (w) { return melee ? w[0] === 1 : w[0] > 1; })[0]) || wp[0] || [1, "Physical", 1]; };
    function stepsOf(u, mov) {  // the hexes a unit can reach within `mov` steps (an enemy blocks, an ally can be crossed but not stopped on): key -> steps
      const occ = {}, out = {};
      live().forEach(function (x) { if (x !== u) occ[x.t[0] + "," + x.t[1]] = x; });
      RULES.reach({ from: u.t, mov: mov, fly: !!u.rules.fl, free: !!u.rules.us, enemy: function (c, r) { const x = occ[c + "," + r]; return !!x && x.side !== u.side; }, any: function (c, r) { return !!occ[c + "," + r]; }, stop: tileStop })
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
      if (!sp || !(sp.hex || sp.leap) || !o.ok || u.acted || !abReady(u, o.ab)) return [];
      const reach = stepsOf(u, 2), occ = {};
      live().forEach(function (x) { if (x !== u) occ[x.t[0] + "," + x.t[1]] = x; });
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
      if (!o || !o.ok || u.acted || (o.ab && (fxOn(u, "stun") || !abReady(u, o.ab)))) return out;  // a stunned unit cannot use its active abilities
      const wp = u.rules.wp && u.rules.wp.length ? u.rules.wp : [[1, "Physical", 1]], adj = nextTo(u), sp = o.ab && CULT[o.ab[0]];
      if (sp && sp.self) return sp.heal || freeAround(u).length ? [{ u: u, dmg: 0 }] : out;  // a summon or a heal around the caster: it casts on itself
      live().forEach(function (t) {
        if (t.side === u.side || t.ds) return;
        const dd = RULES.dist(u.t, t.t), clear = dd <= 1 || u.rules.id || RULES.sight(u.t, t.t);
        let best = null;
        const keep = function (r, p) { if (!best || r.tot > best.tot) { best = r; best.prof = p; } };  // p: the damage profile of the hit
        if (sp && sp.hex) return;
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
            return cb.el - ca.el || (cb.tile === "DryBush") - (ca.tile === "DryBush") || RULES.dist(u.t, a) - RULES.dist(u.t, b2);
          });
          if (!hs.length) return;
          const r = withPos(u, hs[0], function () { return damageOf(u, t, { w: mainWeapon(u, true), extra: v.extraDmg || 0 }, 1); });
          out.push({ u: t, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), plan: { moves: [{ u: u, to: hs[0].slice() }], more: [] } });
          return;
        }
        if (sp && sp.leap) {  // Heroic Fusillade: Judh moves to a free hex next to the enemy (within 2 steps of her, or where she stands), then hits it and the enemies around it; the hex is the highest, then tall grass, then the nearest
          const reach = stepsOf(u, 2), hs = freeAdj(t, u).filter(function (h) { return reach[h[0] + "," + h[1]] !== undefined; }).sort(function (a, b2) {
            const ca = RULES.cell(a[0], a[1]), cb = RULES.cell(b2[0], b2[1]);
            return cb.el - ca.el || (cb.tile === "DryBush") - (ca.tile === "DryBush") || reach[a[0] + "," + a[1]] - reach[b2[0] + "," + b2[1]];
          });
          if (!hs.length) return;
          const plan = fusilladeAt(u, o, hs[0], t);
          out.push({ u: t, dmg: plan.main.dmg, hits: plan.main.hits, per: plan.main.per, plan: { moves: plan.moves, more: plan.more } });
          return;
        }
        if (sp && sp.duel) {  // Holy Duel: an adjacent enemy is hit by a normal melee attack (+dmg) and the two are taunted by each other until one falls; the duellist takes less from his partner
          if (dd !== 1) return;
          const v = (o.ab[8] && o.ab[8][rar]) || {}, r = damageOf(u, t, { w: mainWeapon(u, true), extra: v.extraDmg || 0 }, 1);
          out.push({ u: t, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), plan: { moves: [], more: [], fx: [{ u: t, id: "taunt", taunt: u, until: 9999, v: {} }, { u: u, id: "taunt", taunt: t, until: 9999, reduce: v.dmgReduction || 0, v: {} }] } });
          return;
        }
        if (sp && sp.charge) {  // Waaagh!: Boyz around Gulgortz (if he has not moved), his adjacent allies get +1 movement and +dmg until the end of his turn, then he charges an enemy within his movement: a normal melee attack
          const v = (o.ab[8] && o.ab[8][rar]) || {}, reach = stepsOf(u, budget(u)), spots = waaaghSpots(u, t, v).map(function (h) { return h[0] + "," + h[1]; });
          const hs = freeAdj(t, u).filter(function (h) { const k = h[0] + "," + h[1]; return reach[k] !== undefined && spots.indexOf(k) < 0; }).sort(function (a, b2) {
            const ca = RULES.cell(a[0], a[1]), cb = RULES.cell(b2[0], b2[1]);
            return cb.el - ca.el || (cb.tile === "DryBush") - (ca.tile === "DryBush") || reach[a[0] + "," + a[1]] - reach[b2[0] + "," + b2[1]];
          });
          if (!hs.length) return;
          const stay = hs[0][0] === u.t[0] && hs[0][1] === u.t[1], r = withPos(u, hs[0], function () { return damageOf(u, t, { w: mainWeapon(u, true) }, 1); });
          const buff = live().filter(function (x) { return x.side === u.side && x !== u && RULES.dist(u.t, x.t) === 1; }).map(function (x) { return { u: x, id: "waaagh", until: round, v: v }; });
          out.push({ u: t, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), plan: { moves: stay ? [] : [{ u: u, to: hs[0].slice() }], more: [], fx: buff } });
          return;
        }
        if (sp && sp.noDmg) { if (dd <= abilityReach(u, o.ab) && clear) out.push({ u: t, dmg: 0, hits: 0, per: 0 }); return; }  // no damage of its own: the target only places the decoys
        if (o.ab) { if (dd <= abilityReach(u, o.ab) && clear && !(u.noRanged && o.ab[4] === "Ranged" && dd > 1)) keep(damageOf(u, t, { ab: o.ab }, dd), o.ab[5] || (wp[wp.length - 1] || [])[1]); }
        else wp.forEach(function (w) { if (w[0] === 1 ? dd === 1 : !adj && !u.noRanged && dd <= w[0] && clear) keep(damageOf(u, t, { w: w }, dd), w[1]); });  // a ranged weapon cannot be used next to an enemy
        if (best && best.tot > 0) out.push({ u: t, dmg: Math.round(best.tot), hits: best.hits, per: Math.round(best.per), prof: best.prof });
      });
      if (!o.ab && (u.tset.Healer || u.tset.Mechanic)) {  // a Healer heals a living ally, a Mechanic repairs a mechanical one: the number of hits times its damage
        const hitsMax = Math.max.apply(null, wp.map(function (w) { return w[2]; })), reachW = Math.max.apply(null, wp.map(function (w) { return w[0]; }));
        live().forEach(function (a) {
          const twist = (u.rules.ab || []).some(function (x) { return x[0] === "TwistedScience"; }) && !a.twisted;  // Hollan can heal an unaffected ally even at full health
          if (a.side !== u.side || a === u || a.decoy || !a.max || (a.hp >= a.max && !twist)) return;
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
    // what the chosen character can still do this turn
    const mine = function () { return sel && !sel.summon && sel.alive && sel.side === active; };  // a summon plays by itself
    const budget = function (u) { return u.acted ? 0 : Math.max(0, mvOf(u) - u.spent); };  // Rapid Assault: +1 movement until the unit attacks

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
      const btns = '<div class="sb-acts">' + opts.map(function (o) {
        return '<button type="button" class="sb-act' + (act && act.id === o.id ? " is-on" : "") + (o.ab && !o.ok ? " is-info" : "") + '" data-act="' + o.id + '" title="' + esc(o.name) + '">' +
          (o.icon ? '<img src="' + o.icon + '" alt="" onerror="this.style.display=\'none\'">' : '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M19 3l2 2-9.6 9.6-1.4-1.4zM8 13l3 3-2 2-1-1-2.5 2.5L4 18.5 6.5 16l-1-1z"/></svg>') + "<span>" + esc(o.name) + "</span></button>";
      }).join("") + "</div>";
      const tr = (ru.tr || []).map(function (t) { return '<span class="sb-trait" title="' + esc(t[1]) + '"><img src="' + assets + "traits/" + esc(t[0]) + '.webp" alt="" onerror="this.style.display=\'none\'">' + esc(t[1]) + "</span>"; }).join("");
      return [head + btns, '<dl class="rp-stats">' + row("PV", st ? num(sel.hp) + " / " + num(sel.max) : "—") + (st ? row("Dégâts", num(st[1])) + row("Armure", num(st[2])) : "") +
        row("Mouvement", (ru.mv || 0) + (ru.ra ? " (+1 assaut rapide)" : "") + (can ? " · reste " + budget(sel) : "")) + row("Portée", reach) + '<div class="rp-sep"></div>' +
        row("Rareté", '<i class="rh rh-' + r.c + '">' + rar.toUpperCase() + "</i> " + r.n) + row("Niveau", r.lv + " / " + r.lv) +
        row("Rang", '<img class="mm-rank" src="' + assets + "ui/rank_" + (r.rank + 1) + '.png" alt=""> ' + RT[Math.floor(r.rank / 3)] + " " + RM[r.rank % 3]) +
        row("Étoiles", '<span class="rp-stars">' + starsHtml(r.stars) + "</span>") + relic + "</dl>" + (tr ? '<div class="sb-traits">' + tr + "</div>" : "") + (function () { const st = statuses(sel); return st.length ? '<div class="sb-states"><b>États</b>' + st.map(function (x) { return '<span class="sb-trait" title="' + esc(x.title) + '"><img src="' + x.icon + '" alt="">' + esc(x.label || x.title.split(" : ")[0].split(" (")[0]) + "</span>"; }).join("") + "</div>" : ""; })()];
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
        else if (o.ok) body += '<p class="sb-tip-fig">Simulé : <b>' + (o.ab[6] || 1) + "</b> coup" + ((o.ab[6] || 1) > 1 ? "s" : "") + " de <b>" + num(o.ab[3][rar]) + "</b> dégâts " + (PROFILE[o.ab[5]] || PROFILE[(sel.rules.wp || [[1, "Physical"]]).slice(-1)[0][1]] || "") + ", moins l'armure de la cible (au moins " + pct(o.ab[5] || "Physical") + " des dégâts, le ratio de perçage), puis le terrain et les traits de la cible ; les bonus de l'attaquant et la hauteur ne comptent pas.</p>";
      } else {
        tag = sel.tset.Healer ? "Attaque normale · soin" : sel.tset.Mechanic ? "Attaque normale · réparation" : "Attaque normale";
        const wp = sel.rules.wp && sel.rules.wp.length ? sel.rules.wp : [[1, "Physical", 1]];
        body = wp.map(function (w) {
          return (w[0] === 1 ? "<b>Mêlée</b> (case adjacente)" : "<b>Distance</b> (jusqu'à " + w[0] + " cases, ligne de vue dégagée, inutilisable au contact d'un ennemi)") + " · " + w[2] + " coup" + (w[2] > 1 ? "s" : "") + " de <b>" + num(sel.atk) + "</b> dégâts " + (PROFILE[w[1]] || "") + " (perçage " + pct(w[1]) + ")";
        }).join("<br>") + '<p class="sb-tip-fig">Bonus de la hauteur (+50 %) et des traits du perso, malus de l\'armure de la cible (chaque coup retire l\'armure, mais fait au moins le ratio de perçage des dégâts), du terrain (fils barbelés, tranchée, hautes herbes) et des traits de la cible.</p>' +
          (sel.tset.Healer ? '<p class="sb-tip-fig">Soin : sur un allié blessé non mécanique, l\'attaque rend (nombre de coups × dégâts) points de vie.</p>' : "") + (sel.tset.Mechanic ? '<p class="sb-tip-fig">Réparation : sur un allié blessé mécanique, l\'attaque rend (nombre de coups × dégâts) points de vie.</p>' : "");
      }
      let go = "";
      if (!o.ok && o.ab) go = "Rien à lancer ici : cette capacité n'inflige pas de dégâts (ou n'est pas simulée).";
      else if (o.ab && abWait(sel, o.ab)) go = abWait(sel, o.ab);
      else if (sel.summon) go = "Une invocation joue seule : au début du tour de son camp, ou tout de suite si la capacité qui l'invoque le dit.";
      else if (!sel.alive) go = "Ce personnage est hors de combat.";
      else if (sel.side !== active) go = "Ce n'est pas le tour de ce camp.";
      else if (sel.acted) go = sel.mow ? "Cette machine a déjà utilisé une capacité ce tour." : "Ce personnage a déjà agi ce tour.";
      else if (sel.mow && MOW[o.ab[0]] && MOW[o.ab[0]].hex) go = mowHexes(sel, o).length ? "Cliquez sur un hexagone surligné du plateau." : "Aucun hexagone possible.";
      else if (sel.mow) go = targetsOf(sel, o).length ? (MOW[o.ab[0]].ally ? "Cliquez sur une unité alliée en surbrillance." : "Cliquez sur une unité adverse en surbrillance.") : "Aucune cible valable pour l'instant (voir les conditions dans le texte).";
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
      if (!m || m.k !== "atk" || !(m.dmg > 0)) return;
      const a = home(m.u), t = [cx(m.tgt.t[0]), cy(m.tgt.t[0], m.tgt.t[1])];
      fx.innerHTML = '<line class="rp-beam" x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + t[0].toFixed(1) + '" y2="' + t[1].toFixed(1) + '"/>' +
        '<text class="rp-fig" x="' + t[0].toFixed(1) + '" y="' + (t[1] - R * 0.55).toFixed(1) + '" text-anchor="middle" style="animation-delay:0.12s">−' + num(m.dmg) + "</text>";
      m.tgt.g.classList.add("tk-hit"); m.u.g.classList.add("tk-act");
      flashTimer = setTimeout(function () { fx.innerHTML = ""; units.forEach(function (u) { if (u.g) u.g.classList.remove("tk-hit", "tk-act"); }); }, 1500);
    }
    // ---- the states shown on a character (like the active ability of the replay's tokens): a small icon under its health bar; when the state is spent or ends, the icon flies up and fades ----
    const fxIcon = function (n) { return assets + "effects/" + n + ".webp"; }, trIcon = function (n) { return assets + "traits/" + n + ".webp"; };
    function statuses(u) {
      const out = [];
      if (!u.alive || u.mow || u.decoy || !u.t) return out;
      const T = u.tset, add = function (id, icon, title) { out.push({ id: id, icon: icon, title: title }); };
      if (T.TerminatorArmour && !u.hitNow) add("term", trIcon("TerminatorArmour"), "Armure Terminator : la première attaque reçue ce tour est réduite de " + Math.abs(TV.terminatorArmourDmgReduction || 75) + " %.");
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
      const mind = fxOn(u, "mind");
      if (mind) add("mind", fxIcon("taunted"), "Contrôle mental : inflige −" + ((mind.v && mind.v.dmgReduction) || 0) + " dégâts, subit +" + ((mind.v && mind.v.extraDmgPct) || 0) + " %, provoqué par " + (mind.taunt ? mind.taunt.name : "?") + " (jusqu'au round " + mind.until + ").");
      const hk = hexKind(u.t);
      if (hk === "fire") add("hfire", fxIcon("fire"), "Hexagone en feu : 20 % de la santé initiale en dégâts au début de son tour.");
      else if (hk === "ice") add("hice", fxIcon("ice"), "Glace : un déplacement qui y arrive s'arrête.");
      else if (hk === "contam") add("hcontam", fxIcon("poisoned"), "Hexagone contaminé : −30 % d'armure (sauf mécaniques et Nurgle).");
      else if (hk === "despoiled") add("hdesp", fxIcon("possessed"), "Terrain souillé : 6 à 9 % de la santé initiale en dégâts au début de son tour.");
      const bzf = fxOn(u, "brazier");
      if (bzf) add("brazier", fxIcon("debuffed"), "Brasier du feu sacré : +" + bzf.pct + " % de dégâts subis (jusqu'au round " + bzf.until + ").");
      if (fxOn(u, "pin")) add("pin", fxIcon("supressed"), "Neutralisé : −30 % de dégâts, −1 déplacement, pas de Sentinelle (1 manche).");
      const cfx = fxOn(u, "conflag");
      if (cfx) add("conflag", fxIcon("fire"), "Conflagration trois fois bénie : plus de dégâts à distance contre les ennemis sur un hexagone en feu (jusqu'au round " + cfx.until + ").");
      if (fxOn(u, "stun")) add("stun", fxIcon("stunned"), "Étourdi : 1 déplacement, −50 % de dégâts, aucune capacité active (un soin annule l'effet).");
      if (u.ow) add("ow", fxIcon("overwatch"), "Sentinelle : attaque le premier ennemi qui se déplace à sa portée pendant le tour adverse.");
      if (fxOn(u, "hail")) add("hail", fxIcon("buffed"), "Hailstrike : plus de perforation en Sentinelle, et le Storm Speeder tire avec lui.");
      if (u.ds) add("ds", trIcon("TeleportStrike"), "Assaut en profondeur : ne peut être ciblé ni subir de dégâts avant d'avoir agi ou terminé son tour ; peut se téléporter sur n'importe quel hexagone libre non adjacent à un ennemi.");
      if (u.noRanged) add("noranged", fxIcon("debuffed"), "S'est téléporté : pas d'attaque à distance jusqu'à la fin de son tour.");
      const wg = fxOn(u, "waaagh");
      if (wg) add("waaagh", fxIcon("damage_powerup"), "Waaagh ! : +" + ((wg.v && wg.v.extraMovement) || 1) + " déplacement, +" + num((wg.v && wg.v.extraDmg) || 0) + " dégâts et un coup de plus à ses attaques normales de mêlée (jusqu'à la fin du tour).");
      const tn = fxOn(u, "taunt");
      if (tn) add("taunt", fxIcon("taunted"), "Provoqué par " + (tn.taunt ? tn.taunt.name : "?") + " : ne peut viser que lui s'il le peut " + (tn.until >= 999 ? "(tant que l'un des deux n'est pas tombé)" : "(jusqu'au round " + tn.until + ")") + ".");
      if (u.twisted) add("twist", fxIcon("health_powerup"), "Science distordue : PV max augmentés" + (u.rules.fa === "Genestealers" ? ", +" + u.twistDmg + " dégâts" : "") + ".");
      if (u.marked) add("mark", fxIcon("markerlight"), "Pointeur lumineux : les attaques à distance de certains alliés de l'ennemi font plus de dégâts.");
      if (u.annBy && u.annBy.alive) add("annih", fxIcon("master_annihilator"), "Maître annihilateur (" + u.annBy.name + ") : les attaques normales des alliés de " + u.annBy.name + " portent un coup de plus.");
      if (u.shun) add("shun" + u.shun.kind, fxIcon(["", "fortified", "buffed", "damage_powerup"][u.shun.kind]), ["", "Sens de la pierre : −50 % de dégâts reçus.", "Grâce du Zéphyr : +1 déplacement.", "Tempête de feu : +1 044 dégâts."][u.shun.kind] + " (Aun'Shi)");
      if (u.shroud) add("shroud", fxIcon("infiltrate"), "Voile de nuit : −" + u.shroud + " dégâts à chaque coup reçu.");
      aurasOn(u, u.t).forEach(function (a) {  // one tag per ability whose aura reaches it
        const ab = (a.e.rules.ab || []).filter(function (x) { return x[0] === a.id; })[0], nm = (ab ? ab[1] : a.id) + (a.e === u ? "" : " (" + a.e.name + ")");
        out.push({ id: "aura-" + a.id + "-" + a.e.i, icon: fxIcon("buffed"), title: nm + " : aura d'une capacité qui l'aide.", label: nm });
      });
      if (u.moveBonus > 0 && !(u.shun && u.shun.kind === 2)) add("move", fxIcon("buffed"), "+" + u.moveBonus + " déplacement ce tour.");
      if (live().some(function (e) { return e.side !== u.side && e.tset.ContagionsOfNurgle && RULES.dist(e.t, u.t) <= contagionRange(); })) add("conta", trIcon("ContagionsOfNurgle"), "Contagion de Nurgle : l'armure est réduite dans l'aura d'un ennemi.");
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
            el.innerHTML = '<title></title><circle r="6" fill="#0b0e12" stroke="rgba(255,255,255,.55)" stroke-width="0.8"/><image x="-5.2" y="-5.2" width="10.4" height="10.4" preserveAspectRatio="xMidYMid meet"/>';
            u.stG.appendChild(el); u.stShown[x.id] = el;
            setTimeout(function () { el.classList.remove("tk-pop"); }, 400);
          }
          el.querySelector("image").setAttribute("href", x.icon);
          el.querySelector("title").textContent = x.title;
          el.style.setProperty("--x", ((i - (now.length - 1) / 2) * 13).toFixed(1) + "px");
        });
      });
    }
    const boomText = function (list) {
      return (list || []).map(function (x) { return " · " + esc(x.from.name) + " explose → " + esc(x.tgt.name) + " <b>−" + num(x.dmg) + "</b>"; }).join("");
    };
    const regenText = function (list) {
      return (list || []).map(function (x) { return " · " + esc(x.u.name) + (x.revive ? " est réanimé (" + esc(x.label.replace("réanimé par ", "par ")) + ", " + num(x.amt) + " PV)" : " régénère +" + num(x.amt) + " (" + esc(x.label) + ")"); }).join("");
    };
    const hxText = function (list) {  // the hexes an action covers
      const names = { fire: "embrase", ice: "recouvre de glace", contam: "contamine", despoiled: "souille" }, n = {};
      (list || []).forEach(function (x) { n[x.kind] = (n[x.kind] || 0) + 1; });
      return Object.keys(n).map(function (k) { return " · " + names[k] + " " + n[k] + " hexagone" + (n[k] > 1 ? "s" : ""); }).join("");
    };
    const guardText = function (list) {  // who took a hit in the place of its owner
      return (list || []).map(function (x) { return " · " + (x.fresh ? esc(x.g.name) + " apparaît et " : "") + esc(x.g.name) + " encaisse à la place de " + esc(x.from.name); }).join("");
    };
    const autoText = function (list) {  // what acted by itself: the summons, Khârn's Betrayer
      return (list || []).map(function (x) { if (x.env) return " · " + esc(x.label) + (x.tgt ? " → " + esc(x.tgt.name) + " −" + num(x.dmg) : ""); return " · " + esc(x.u.name) + (x.label !== "Attaque" ? " (" + esc(x.label) + ")" : "") + (x.to ? " se déplace" : "") + (x.tgt ? " → " + esc(x.tgt.name) + " −" + num(x.dmg) + (x.hits > 1 ? " (" + x.hits + " coups)" : "") : "") + (x.more || []).map(function (y) { return " · " + esc(y.tgt.name) + " −" + num(y.dmg); }).join("") + guardText(x.guards) + autoText(x.trig); }).join("");
    };
    function render() {
      units.forEach(function (u) {
        if (!u.g) return;
        u.g.classList.toggle("tk-sel", u === sel);
        u.g.classList.toggle("gone", !u.alive);
        if (u.mow) return;
        pos(u.g, home(u));
        u.g.classList.toggle("sb-drag", u.side === active && u.alive);  // only the side whose turn it is can be moved
        u.g.classList.toggle("tk-target", !!(act && sel && tgtSet[u.i]));
        if (u.hpEl) { const pct = u.max ? Math.max(0, Math.min(1, u.hp / u.max)) : 1; u.hpEl.style.transform = "scaleX(" + pct.toFixed(3) + ")"; u.hpEl.setAttribute("fill", pct > 0.5 ? "#34d399" : pct > 0.25 ? "#f2b134" : "#f87171"); }
      });
      const TILE = { fire: ["#ff7a1a", "fire"], ice: ["#7dd3fc", "ice"], contam: ["#7bd34a", "poisoned"], despoiled: ["#a855f7", "possessed"] };
      $("sb-tiles").innerHTML = Object.keys(hexfx).filter(function (k) { return hexKind(k.split(",").map(Number)); }).map(function (k) {  // the hex effects on the map: a tint and the effect's icon
        const f = hexfx[k], h = f.h, col = TILE[f.kind], x = cx(h[0]), y = cy(h[0], h[1]), z = R * 0.5;
        return '<polygon class="sb-tile" fill="' + col[0] + '" fill-opacity="0.32" stroke="' + col[0] + '" stroke-width="1.4" points="' + hexAt(x, y, 0.94) + '"/><image href="' + fxIcon(col[1]) + '" x="' + (x - z / 2).toFixed(1) + '" y="' + (y - R * 0.86).toFixed(1) + '" width="' + z.toFixed(1) + '" height="' + z.toFixed(1) + '" pointer-events="none"/>';
      }).join("");
      $("sb-tiles").innerHTML += field.filter(function (u) { return u.alive && u.foot; }).map(function (u) {  // the other two hexes of a big stationary unit
        return u.foot.map(function (h) { return '<polygon class="sb-zmark" fill="' + (u.side === 0 ? "#4ad1c0" : "#f06b6b") + '" fill-opacity="0.18" stroke="' + (u.side === 0 ? "#4ad1c0" : "#f06b6b") + '" stroke-width="1.4" points="' + hexAt(cx(h[0]), cy(h[0], h[1]), 0.94) + '"/>'; }).join("");
      }).join("");
      $("sb-tiles").innerHTML += zmarks.map(function (mk) {  // the zones marked for later: dashed outline with the ability's name
        return mk.hexes.map(function (h) { return '<polygon class="sb-zmark" fill="' + (mk.kind === "mine" ? "#ef4444" : mk.kind === "zone" ? "#a855f7" : "#f59e0b") + '" fill-opacity="0.16" stroke="' + (mk.kind === "mine" ? "#ef4444" : "#f59e0b") + '" stroke-width="1.6" stroke-dasharray="4 3" points="' + hexAt(cx(h[0]), cy(h[0], h[1]), 0.94) + '"><title>' + esc(mk.ab[1]) + " (" + esc(mk.by.name) + ')</title></polygon>'; }).join("");
      }).join("");
      zones();
      $("sb-hexes").innerHTML = Object.keys(hexSet).map(function (k) { const h = k.split(",").map(Number); return '<polygon class="rp-z rp-z-act" data-c="' + h[0] + '" data-r="' + h[1] + '" points="' + hexAt(cx(h[0]), cy(h[0], h[1]), 0.94) + '"/>'; }).join("");
      syncStatuses();
      const panels = unitPanel();
      $("sb-unit").innerHTML = panels[0];
      $("sb-stats").innerHTML = panels[1];
      const o = act && sel && options(sel).filter(function (x) { return x.id === act.id; })[0];
      $("sb-tip").hidden = !o;
      if (o) $("sb-tip").innerHTML = tipHtml(o);
      $("sb-turnlab").textContent = turnText(round, active);
      svgBox.classList.toggle("turn-us", active === 0); svgBox.classList.toggle("turn-them", active === 1);  // the band along the map: green at the bottom on our turn, red at the top on theirs
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
          text = esc(m.u.name) + " · " + esc(m.label) + (m.dmg > 0 ? " → " + esc(m.tgt.name) + " <b>−" + num(m.dmg) + "</b>" + (m.hits > 1 ? " (" + m.hits + " coups de " + num(m.per) + ")" : "") + (m.dead ? " · hors de combat" : "") : m.tgt !== m.u ? " → " + esc(m.tgt.name) : "") + (sums ? " · " + sums : "") +
            (m.more || []).map(function (x) { return " · " + esc(x.label) + " → " + esc(x.tgt.name) + " <b>−" + num(x.dmg) + "</b>" + (x.hits > 1 ? " (" + x.hits + " coups)" : ""); }).join("") +
            (m.moves || []).map(function (x) { return " · " + esc(x.u.name) + " se déplace"; }).join("") + (m.mk && m.mk.length ? " · marque " + m.mk.reduce(function (a, x) { return a + x.hexes.length; }, 0) + " hexagone" + (m.mk.reduce(function (a, x) { return a + x.hexes.length; }, 0) > 1 ? "s" : "") : "") + (m.pend && m.tgt ? " (tir au début de son prochain tour)" : "") + hxText(m.hx) + autoText(m.react) + guardText(m.guards) + (m.heals && m.heals.length ? " · soigne " + m.heals.map(function (h) { return esc(h.u.name) + " +" + num(h.amt); }).join(", ") : "") + autoText(m.autoNow);
        }
        else text = esc(m.u.name) + (m.tp ? " se téléporte (assaut en profondeur)" : " se déplace") + autoText(m.trig);
        text += regenText(m.regen) + boomText(m.booms);
        return '<li data-k="' + (i + 1) + '" class="' + (m.k === "end" ? "rp-turn " : "") + (cur === i + 1 ? "is-cur" : "") + (i >= cur ? " sb-later" : "") + '"><button type="button">' + text + "</button></li>";
      }).join("");
      const on = $("sb-log").querySelector("li.is-cur"), box = $("sb-log");
      if (on) box.scrollTop = on.offsetTop - box.clientHeight / 2 + on.clientHeight / 2;
      const sk = $("sb-seek");
      sk.max = steps.length; sk.value = cur;
      $("sb-undo").disabled = !steps.length;
      $("sb-reset").disabled = !steps.length;
      $("sb-prev").disabled = cur === 0;
      $("sb-next").disabled = cur >= steps.length;
    }
    const go = function (k) {
      const before = cur;
      cur = Math.max(0, Math.min(steps.length, k)); settle(cur); act = null; tgtSet = {}; hexSet = {}; render();
      flash(cur === before + 1 ? steps[cur - 1] : null);  // one step forward (a launch, Suiv., the player): its effects are played
    };
    const stop = function () { if (timer) { clearInterval(timer); timer = null; } $("sb-play").innerHTML = I_PLAY + '<span class="rp-lab"> Lecture</span>'; };
    let tgtSet = {}, hexSet = {};  // the characters the chosen action can hit (by index)
    const push = function (step) { steps.length = cur; steps.push(step); go(steps.length); };

    // ---- the zones of the chosen character (rules in hex-rules.js): the hexes it can reach, and those the other side can hit after moving ----
    const RULES = window.HexRules ? window.HexRules(d.cells) : null;
    let tpNow = {};  // the hexes a unit in Deep Strike mode can teleport to
    let reachNow = {};  // reachNow: "c,r" -> cost, the hexes the chosen character can move to now
    function zones() {
      const layer = $("sb-zone");
      layer.innerHTML = ""; reachNow = {};
      if (!RULES || !sel || sel.mow || !sel.alive) return;
      const occ = {};
      live().forEach(function (u) { occ[u.t[0] + "," + u.t[1]] = u; });
      const reachOf = function (u, mov) {
        const r = u.rules;
        return RULES.reach({ from: u.t, mov: mov, fly: !!r.fl, free: !!r.us,
          enemy: function (c, rr) { const o = occ[c + "," + rr]; return !!o && o.side !== u.side; },
          any: function (c, rr) { const o = occ[c + "," + rr]; return !!o && o !== u; }, stop: tileStop });
      };
      if (sel.side !== active) {  // a character of the side that is not playing: every hex it can hit, after moving, with an attack or an ability (red)
        const rngA = hitReach(sel), hit = {};
        reachOf(sel, mvOf(sel)).forEach(function (p) { RULES.hits([p.c, p.r], rngA, !!sel.rules.id).forEach(function (t) { hit[t[0] + "," + t[1]] = 1; }); });
        let h = "";
        d.cells.forEach(function (c) { if (hit[c[0] + "," + c[1]] && c[4] !== 2) h += '<polygon class="rp-z rp-z-dg" points="' + hexAt(cx(c[0]), cy(c[0], c[1]), 0.94) + '"/>'; });
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
          reachNow[k] = mvOf(sel); tpNow[k] = true;
        });
      }
      live().forEach(function (u) {
        if (u.side === sel.side) return;
        const rng = hitReach(u);
        reachOf(u, mvOf(u)).forEach(function (p) { RULES.hits([p.c, p.r], rng, !!u.rules.id).forEach(function (t) { danger[t[0] + "," + t[1]] = 1; }); });
      });
      let html = "", exposed = 0, n = 0;
      d.cells.forEach(function (c) { if (danger[c[0] + "," + c[1]] && c[4] !== 2) html += '<polygon class="rp-z rp-z-dg" points="' + hexAt(cx(c[0]), cy(c[0], c[1]), 0.94) + '"/>'; });
      Object.keys(tpNow).forEach(function (k) { const h = k.split(",").map(Number); go.push({ c: h[0], r: h[1], k: reachNow[k], tp: true }); });
      go.forEach(function (p) {
        const hot = !!danger[p.c + "," + p.r], own = p.k === 0;
        if (!own) { n++; if (hot) exposed++; }
        html += '<polygon class="rp-z rp-z-mv' + (hot ? " rp-z-hot" : "") + (own ? " rp-z-own" : "") + (p.tp ? " rp-z-tp" : "") + '" data-c="' + p.c + '" data-r="' + p.r + '" points="' + hexAt(cx(p.c), cy(p.c, p.r), 0.94) + '"/>';
      });
      layer.innerHTML = html;
    }
    // a move: the chosen character goes to a hex it can reach (what it spends of its movement is kept until the end of the turn)
    const moveTo = function (u, c, r) {
      const cost = reachNow[c + "," + r];
      if (!cost || !mine() || u !== sel) return false;
      push({ k: "mv", u: u, from: u.t.slice(), to: [c, r], cost: cost, tp: !!tpNow[c + "," + r] });
      return true;
    };
    // one ability-style hit series (an average figure of the game's configuration: it ignores the attacker's bonuses): {tot, per, hits}
    const abilityHit = function (u, t, avg, profile, hits) {
      return damageOf(u, t, { ab: ["", "", "a", (function () { const o = {}; o[rar] = avg; return o; })(), "Ranged", profile, hits] }, u.mow ? 3 : RULES.dist(u.t, t.t));
    };
    const avgOf = function (vals, suf) { return ((vals["minDmg" + suf] || 0) + (vals["maxDmg" + suf] || 0)) / 2; };
    const foes = function (u) { return live().filter(function (x) { return x.side !== u.side && !x.ds; }); };  // a unit in Deep Strike mode cannot be targeted
    // the other hits of an action: the splash of Plague Wind (the target, the enemies next to it, then the enemies next to those), the second attack that follows a normal attack
    // (Light Im Up: the same enemy, the hits left when it falls go to another within 3; The Betrayer: an adjacent enemy), the heal of Revitalizing Malignancy
    function extras(u, o, t, main) {
      const more = [], vals = (o.ab && o.ab[8] && o.ab[8][rar]) || {};
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
      if (!o.ab) {  // a normal attack: the extra hits the allies' auras and its own passives add
        const ranged = RULES.dist(u.t, t.t) > 1;
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
      live().forEach(function (x) { taken[x.t[0] + "," + x.t[1]] = 1; });
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
    const mh = function (u, e, raw, prof, n, label) { const r = abilityHit(u, e, raw, prof, n); return { tgt: e, dmg: Math.round(r.tot), hits: r.hits, per: Math.round(r.per), label: label }; };
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
        if (orks >= nI(v.nrOfUnits_3, 2) || near.length >= nI(v.nrOfUnits_4, 4)) { const hs = prio(u, freeAdj(t), t.t); if (hs.length) p.adds = [Object.assign(spawn("orksSmnSquig", u.side, u, hs[0], [v.summonHp || 1, v.summonDmg || 1, v.summonArmor || 0], false), { immediate: false })]; }
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
      ForwardSpotter: { ally: true, plan: function (u, o, t, v) {  // a Cadian Guardsman next to the allied unit, which plays at once
        const hs = prio(u, freeAdj(t), t.t);
        if (!hs.length) return null;
        const g = spawn("astraSmnGuardsman", u.side, u, hs[0], [v.summonHp || 1, v.summonDmg || 1, v.summonArmor || 0], false);
        g.immediate = true;
        return { main: null, adds: [g] };
      } },
      NanoscarabRepairProtocols: { ally: true, plan: function (u, o, t, v) { return t.tset.Mechanical && !t.nano ? { main: null, buff: [{ u: t, hp: v.hp || 0 }] } : null; } },
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
        const hs = foes(u).filter(function (e) { return hexKind(e.t) === "fire"; }).map(function (e) { return mh(u, e, avgOf(v, ""), o.ab[5], nI(v.nrOfHits, 3), o.name); });
        return { main: null, more: hs, hx: [hexCover(h, "fire")] };
      } },
      SporeMineLauncher: { hex: true, hexes: function (u) { return playable().filter(function (h) { return freeHex(h) && !foes(u).some(function (e) { return RULES.dist(e.t, h) === 1; }); }); },  // a free hex that is not next to an enemy
        hexPlan: function (u, o, h, v) { return { main: null, adds: [mineAt(u, h, v)] }; } },
      BioMinefield: { plan: function (u, o, t, v) {  // with 3 mines or more on the board they all play at once toward the target; otherwise 3 new ones appear around it and go off
        const mines = live().filter(function (x) { return x.side === u.side && isMine(x); });
        if (mines.length >= nI(v.nrOfSummons, 3)) return { main: null, also: mines, force: t };
        const hs = prio(u, freeAdj(t), t.t).slice(0, nI(v.nrOfSummons_2, 3));
        if (!hs.length) return null;
        return { main: null, force: t, adds: hs.map(function (h) { const a = mineAt(u, h, v); a.immediate = true; return a; }) };
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
        const a = spawn(STATION[id], u.side, u, h, [v.summonHp || 1, v.summonDmg || 1, v.summonArmor || 0], true);
        a.foot = fp.slice(1);  // the two other hexes of its shape
        a.immediate = live().some(function (x) { return x.side === u.side && !x.summon && RULES.dist(x.t, h) === 1; });
        return { main: null, adds: [a], deploy: true };
      } };
    });
    function mowTargets(u, o) {  // the units a machine of war's ability can be aimed at now
      const out = [], M = o && o.ab && MOW[o.ab[0]];
      if (!M || M.hex || !o.ok || u.acted || !abReady(u, o.ab)) return out;
      const v = vOf(o);
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
        more: p.more || [], hx: p.hx || [], fx: p.fx || null, adds: p.adds || null, heals: p.heals || null, mk: p.mk || null, pend: p.pend || null, mark: !!p.mark, buff: p.buff || null, deploy: !!p.deploy, also: p.also || null, force: p.force || null });
    }
    const strike = function (u, o, t) {
      if (u.mow) return strikeMow(u, o, t);
      const ts = targetsOf(u, o).filter(function (x) { return x.u === t; })[0];
      if (!ts) return;
      const sp = o.ab && CULT[o.ab[0]];
      let adds = sp && sp.summon ? cultAdds(u, o, t) : null, gone = null, mark = false;
      const also = sp && sp.also ? live().filter(function (x) { return x.summon && x.id === sp.also && x.side === u.side && (!sp.r || RULES.dist(u.t, x.t) <= sp.r); }) : null;  // the summons the ability orders to play at once
      const drone = !o.ab && ts.heal === undefined && ts.dmg > 0 && RULES.dist(u.t, t.t) > 1 ? (u.rules.ab || []).filter(function (a) { return a[0] === "MV71SniperDroneSquad"; })[0] : null;
      if (drone) {  // Sho'syl: instead of a ranged attack a Sniper Drone is summoned (next to him, toward the target) and ordered to shoot, with his damage; the lowest-health drone goes when he has 3; the target gets a markerlight
        const v = (drone[8] && drone[8][rar]) || {}, hs = prio(u, freeAround(u), u.t), mine2 = field.filter(function (x) { return x.parent === u && x.id === "tauSmnDroneSniper" && x.alive; }).sort(function (a, b2) { return a.hp - b2.hp; });
        mark = true;
        if (hs.length) {
          if (mine2.length >= (parseInt(v.maxSummons, 10) || 3)) gone = [mine2[0]];
          adds = [spawn("tauSmnDroneSniper", u.side, u, hs[0], [v.summonHp || 1, v.summonDmg || 1, v.summonArmor || 0], false)];
        }
      }
      let heals = sp && sp.heal ? healsOf(u, o) : null;
      if (ts.heal !== undefined) heals = [{ u: t, amt: ts.heal }];  // the attack heals an ally
      const pend = sp && sp.pend ? { by: u, tgt: t, ab: o.ab } : null, plan = ts.plan || {};
      let moves = plan.moves || null, fx = plan.fx || null, more = (plan.more || []).concat(extras(u, o, t, ts.dmg));
      const rnd = mulberry(((cur + 1) * 40503) ^ 0x2545f491), hx = [];  // the chances of this action, drawn once and kept in the step
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
      push({ k: "atk", u: u, tgt: t, pend: pend, dmg: ts.dmg, hits: ts.hits, per: ts.per, abId: o.ab ? o.ab[0] : null, label: ts.heal !== undefined ? (u.tset.Healer ? "Soin" : "Réparation") : o.ab ? o.name : "Attaque",
        dead: ts.dmg > 0 && healthAfter(t, ts.dmg) <= 0 && !guardOf(t), adds: adds, heals: heals, moves: moves, fx: fx, more: more, also: also, force: sp && sp.wave ? t : null, gone: gone, mark: mark, hx: hx });
    };
    const strikeHex = function (u, o, h) {  // an ability that targets a hex: L'Accélération, Fusillade héroïque
      if (u.mow) return strikeMow(u, o, null, h);
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
      if (act && sel && tgtSet[u.i]) { const o = options(sel).filter(function (x) { return x.id === act.id; })[0]; strike(sel, o, u); return; }
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
      act = act && act.id === b.dataset.act ? null : { id: b.dataset.act };
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
    $("sb-prev").onclick = function () { stop(); go(cur - 1); };
    $("sb-next").onclick = function () { stop(); go(cur + 1); };
    $("sb-speed").onchange = function (e) { speed = +e.target.value; if (timer) { stop(); $("sb-play").click(); } };
    $("sb-play").onclick = function () {
      if (timer) return stop();
      if (!steps.length) return;
      if (cur >= steps.length) go(0);
      $("sb-play").innerHTML = I_PAUSE + '<span class="rp-lab"> Pause</span>';
      timer = setInterval(function () { if (cur >= steps.length) return stop(); go(cur + 1); }, 900 / speed);
    };
    $("sb-end").onclick = function () { stop(); sel = null; push({ k: "end" }); };
    $("sb-undo").onclick = function () { stop(); if (!steps.length) return; steps.pop(); go(Math.min(cur, steps.length)); };
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
      else if ((e.key === "z" || e.key === "Z") && (e.metaKey || e.ctrlKey)) { $("sb-undo").click(); e.preventDefault(); }
    });
    settle(0);
    render();
  }
})();
