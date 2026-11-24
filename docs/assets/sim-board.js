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
    units.forEach(function (u, i) {
      u.i = i; u.t = u.t0 && u.t0.slice();
      const st = u.rules.st && u.rules.st[rar];
      u.max = st ? st[0] : 0; u.atk = st ? st[1] : 0; u.arm = st ? st[2] : 0;  // health, damage, armour at the top of the rarity
      u.hp = u.max; u.alive = true; u.spent = 0; u.acted = false; u.nAtk = 0; u.hitNow = false; u.advStart = false;
      u.tset = {};
      (u.rules.tr || []).forEach(function (t) { u.tset[t[0]] = 1; });  // its traits
    });
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
      '<div class="rp-right"><div class="rp-step sb-turn"><button type="button" class="rp-btn rp-play" id="sb-end" title="Passer la main à l\'autre camp">Fin de tour</button><div class="sb-turnlab" id="sb-turnlab"></div></div><div class="rp-ledger sb-unit" id="sb-unit"></div><div class="rp-ledger sb-stats" id="sb-stats"></div></div>' +
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
      cells + '<g id="sb-mk" class="sb-starts"></g><g id="sb-zone"></g><g id="sb-tok"></g><g id="sb-fx"></g><g id="sb-nums" class="sb-starts"></g></svg>';
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
    units.forEach(function (u) {
      if (!u.mow && !u.t) return;
      const col = u.side === 0 ? "#4ad1c0" : "#f06b6b", r = u.mow ? R * 0.88 : R * 0.72;
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", "tk " + (u.side === 0 ? "tk-us" : "tk-them") + (u.mow ? " tk-mow" : " sb-drag"));
      g.dataset.i = u.i;
      g.innerHTML = '<g class="tk-body"><circle r="' + r.toFixed(1) + '" fill="#10151c" stroke="' + col + '" stroke-width="2"/>' +
        (u.img ? '<clipPath id="sbc' + u.i + '"><circle r="' + (r - 1.5).toFixed(1) + '"/></clipPath><image href="' + esc(u.img) + '" x="' + (-r).toFixed(1) + '" y="' + (-r).toFixed(1) + '" width="' + (2 * r).toFixed(1) + '" height="' +
          (2 * r).toFixed(1) + '" clip-path="url(#sbc' + u.i + ')" preserveAspectRatio="xMidYMid slice"/>' : '<text text-anchor="middle" dy="4" fill="#fff">?</text>') +
        '<circle class="tk-ring" r="' + (r + 3).toFixed(1) + '" fill="none"/></g>' +
        (u.mow ? "" : '<g class="tk-bar" transform="translate(' + (-r * 0.65).toFixed(1) + "," + (r * 0.34).toFixed(1) + ')"><rect width="' + (1.3 * r).toFixed(1) + '" height="6" rx="3" fill="#0b0e12" stroke="rgba(255,255,255,.4)" stroke-width="0.8"/>' +
          '<rect class="tk-hp" x="1" y="1" width="' + (1.3 * r - 2).toFixed(1) + '" height="4" rx="2" fill="#34d399"/></g>') + "<title>" + esc(u.name) + "</title>";
      u.g = g;
      u.hpEl = g.querySelector(".tk-hp");
      pos(g, home(u));
      tokLayer.appendChild(g);
    });

    // ---- the fight: a timeline of steps (a move, an attack, the end of a turn); cur = how many are applied; the board always shows the position after `cur` of them ----
    let sel = null, act = null, timer = null, speed = 1, cur = 0, round = 1, active = 0;  // active: the side whose turn it is (0 = ours, 1 = theirs); act: the chosen action of the character
    const steps = [];
    const live = function () { return field.filter(function (u) { return u.alive; }); };
    const occupant = function (c, r, but) { return live().filter(function (o) { return o !== but && o.t[0] === c && o.t[1] === r; })[0]; };
    const turnStart = function () { field.forEach(function (u) { u.spent = 0; u.acted = false; u.hitNow = false; u.advStart = u.alive && nextTo(u); }); };  // a turn begins: nobody has moved or acted, and who stood next to an enemy is noted
    const settle = function (k) {  // everybody on the hexes, with the health, they have after k steps, and whose turn it is
      field.forEach(function (u) { u.t = u.t0.slice(); u.hp = u.max; u.alive = true; u.nAtk = 0; });
      round = 1; active = 0;
      turnStart();
      for (let i = 0; i < k; i++) {
        const m = steps[i];
        if (m.k === "mv") { m.u.t = m.to.slice(); m.u.spent += m.cost; }
        else if (m.k === "atk") { m.u.acted = true; m.u.nAtk++; m.tgt.hitNow = true; m.tgt.hp = healthAfter(m.tgt, m.dmg); if (m.tgt.hp <= 0) m.tgt.alive = false; }
        else {  // end of turn: the other side plays
          if (active === 0) active = 1; else { active = 0; round++; }
          turnStart();
        }
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
    // part of the armour the damage profile does not pierce (at least 1), then the target's own modifiers (razor wire, trench, traits); the hits are those of the weapon / ability, less what tall
    // grass, Camouflage, Diminutive and Parry take off (at least 1). The numbers come from the game's configuration (data/unit_rules.json, _tv).
    const TV = UNITS._tv || {};
    const armorDamage = function (raw, profile, arm) { return Math.max(1, raw - arm * (1 - (PIERCE[profile] || 1) / 100)); };
    const cellAt2 = function (u) { return RULES.cell(u.t[0], u.t[1]) || {}; };
    const nextTo = function (u) { return live().some(function (o) { return o.side !== u.side && RULES.dist(u.t, o.t) === 1; }); };
    // spec: {ab: the ability} or {w: the weapon [reach, damage profile, hits]}; dd: the distance
    function damageOf(u, t, spec, dd) {
      const ab = spec.ab, cu = cellAt2(u), ct = cellAt2(t), tr = u.tset, tt = t.tset;
      const profile = ab ? (ab[5] || (u.rules.wp && u.rules.wp.length ? u.rules.wp[u.rules.wp.length - 1][1] : "Physical")) : spec.w[1];
      const ranged = ab ? ab[4] !== "Melee" : spec.w[0] > 1, indirect = !!u.rules.id;
      let hits = ab ? (ab[6] || 1) : spec.w[2], raw = ab ? ab[3][rar] : u.atk;
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
        raw *= 1 + bonus / 100;
        if (cu.el > ct.el && !inTrench) raw *= 1 + (TV.elevationBonus || 50) / 100;  // higher ground (a trench cancels it)
        if (tr.Dakka && spec.w[0] >= 3 && dd === 2) hits += TV.dakkaExtraHits || 0;
      }
      // what takes hits off a ranged attack or a multi-hit one
      let cut = 0;
      if (ranged) cut += tt.Camouflage ? (inGrass ? TV.camouflageHitReduction_3 : dd > 2 ? TV.camouflageHitReduction_2 : TV.camouflageHitReduction_1) || 0 : inGrass ? TV.lightCoverHitReduction || 2 : 0;
      if (tt.Diminutive) cut += TV.diminutiveHitReduction || 1;
      if (tt.Parry && !ranged) cut += TV.parryHitReduction || 1;
      hits = Math.max(1, hits - cut);
      let per = armorDamage(raw, profile, t.arm);
      if (tt.MkXGravis) per = armorDamage(per, profile, t.arm);  // the damage goes through the armour a second time
      let mod = 1;  // the target's own modifiers
      if (ct.tile === "Swamp") mod *= 1 + (TV.swampBonus || 50) / 100;
      if (inTrench && cu.tile !== "Trench" && !indirect) mod *= 1 + (TV.trenchBonus || -50) / 100;
      if (ct.tile === "Shrub") mod *= 1 + (TV.shrubBonus || -50) / 100;
      if (tt.PrioritisedEfficiency && t.spent < (TV.prioritisedEfficiencyMovement || 3)) mod *= 1 - (TV.prioritisedEfficiencyDmgReductionPct || 25) / 100;
      if (tt.MartialKatah && !ab) mod *= 1 - (TV.martialKatahDmgReductionPct || 20) / 100;
      if (tt.TerminatorArmour && !t.hitNow && String(TV.terminatorArmourExcludedDmgProfiles || "").split(",").indexOf(profile) < 0) mod *= 1 + (TV.terminatorArmourDmgReduction || -75) / 100;
      per = Math.max(1, per * mod);
      if (tt.TwoManTeam) per = Math.min(per, t.max / 2);  // a single hit takes at most half of its health
      return per * hits;
    }
    // the health left after a hit: Resilient survives with 1 unless the hit overkills it
    const healthAfter = function (t, dmg) {
      if (dmg >= t.hp && t.hp > 1 && t.tset.Resilient && dmg - t.hp < t.max) return 1;
      return Math.max(0, t.hp - dmg);
    };
    function options(u) {  // the actions of a character: its abilities (the active ones with a damage figure) then the normal attack
      const list = [];
      (u.rules.ab || []).forEach(function (a, i) { list.push({ id: "ab" + i, ab: a, name: a[1], icon: assets + "abilities/" + a[0] + ".webp", ok: a[2] === "a" && !!(a[3] && a[3][rar]) }); });  // ok: it can be launched (an active ability with a damage figure); the others are only described
      list.push({ id: "atk", name: "Attaque", ok: u.atk > 0 });
      return list;
    }
    function targetsOf(u, o) {  // [{u: target, dmg}] the hostile characters the action can hit now
      const out = [];
      if (!o || !o.ok || u.acted) return out;
      const wp = u.rules.wp && u.rules.wp.length ? u.rules.wp : [[1, "Physical", 1]];
      live().forEach(function (t) {
        if (t.side === u.side) return;
        const dd = RULES.dist(u.t, t.t), clear = dd <= 1 || u.rules.id || RULES.sight(u.t, t.t);
        let dmg = 0;
        if (o.ab) { if (dd <= abilityReach(u, o.ab) && clear) dmg = damageOf(u, t, { ab: o.ab }, dd); }
        else wp.forEach(function (w) { if (w[0] === 1 ? dd === 1 : dd <= w[0] && clear) dmg = Math.max(dmg, damageOf(u, t, { w: w }, dd)); });
        if (dmg > 0) out.push({ u: t, dmg: Math.round(dmg) });
      });
      return out;
    }
    // how far a character can hit: its weapons and its active abilities that deal damage (an ability's own range, else the melee one-hex reach, else its weapons')
    const weaponReach = function (u) { return Math.max.apply(null, u.rules.rg && u.rules.rg.length ? u.rules.rg : [1]); };
    const abilityReach = function (u, a) { return a[9] || (a[4] === "Melee" ? 1 : weaponReach(u)); };
    const hitReach = function (u) {
      let r = weaponReach(u);
      (u.rules.ab || []).forEach(function (a) { if (a[2] === "a" && a[3] && a[3][rar]) r = Math.max(r, abilityReach(u, a)); });
      return r;
    };
    // what the chosen character can still do this turn
    const mine = function () { return sel && !sel.mow && sel.alive && sel.side === active; };
    const budget = function (u) { return u.acted ? 0 : Math.max(0, (u.rules.mv || 0) + (u.rules.ra ? 1 : 0) - u.spent); };  // Rapid Assault: +1 movement until the unit attacks

    function unitPanel() {  // the chosen character: rarity, level, rank, stars, relic, stats, traits, the actions
      if (!sel) return ['<h3>Attaques</h3><p class="rp-none">Cliquez sur un personnage pour choisir son attaque, voir où il peut aller et où l\'adversaire peut le toucher.</p>', '<h3>Stats</h3><p class="rp-none">Les stats du personnage choisi s\'affichent ici.</p>'];
      const head = '<div class="rp-tip-head">' + (sel.img ? '<img src="' + esc(sel.img) + '" alt="">' : "") + "<div><b>" + esc(sel.name) + "</b><small>" + (sel.mow ? "Machine de guerre · " : "") + (sel.side === 0 ? "Attaquant" : "Défenseur") +
        (sel.alive ? "" : " · hors de combat") + "</small></div></div>";
      if (sel.mow) return [head + '<p class="rp-none">Elle reste sur sa plateforme.</p>', '<h3>Stats</h3><p class="rp-none">Une machine de guerre n\'a pas de stats sur le plateau.</p>'];
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
        row("Étoiles", '<span class="rp-stars">' + starsHtml(r.stars) + "</span>") + relic + "</dl>" + (tr ? '<div class="sb-traits">' + tr + "</div>" : "")];
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
        if (o.ok) body += '<p class="sb-tip-fig">Simulé : <b>' + num(o.ab[3][rar]) + "</b> dégâts " + (PROFILE[o.ab[5]] || PROFILE[(sel.rules.wp || [[1, "Physical"]]).slice(-1)[0][1]] || "") + ", moins la part d'armure que le type de dégâts ne perce pas (" + pct(o.ab[5] || "Physical") + " ignorée), puis le terrain et les traits de la cible ; les bonus de l'attaquant et la hauteur ne comptent pas.</p>";
      } else {
        tag = "Attaque normale";
        const wp = sel.rules.wp && sel.rules.wp.length ? sel.rules.wp : [[1, "Physical", 1]];
        body = wp.map(function (w) {
          return (w[0] === 1 ? "<b>Mêlée</b> (case adjacente)" : "<b>Distance</b> (jusqu'à " + w[0] + " cases, ligne de vue dégagée)") + " · " + w[2] + " coup" + (w[2] > 1 ? "s" : "") + " de <b>" + num(sel.atk) + "</b> dégâts " + (PROFILE[w[1]] || "") + " (" + pct(w[1]) + " d'armure ignorée)";
        }).join("<br>") + '<p class="sb-tip-fig">Bonus de la hauteur (+50 %) et des traits du perso, malus de l\'armure de la cible (la part que le type de dégâts ne perce pas), du terrain (fils barbelés, tranchée, hautes herbes) et des traits de la cible.</p>';
      }
      let go = "";
      if (!o.ok && o.ab) go = "Rien à lancer ici : cette capacité n'inflige pas de dégâts (ou n'est pas simulée).";
      else if (!sel.alive) go = "Ce personnage est hors de combat.";
      else if (sel.side !== active) go = "Ce n'est pas le tour de ce camp.";
      else if (sel.acted) go = "Ce personnage a déjà agi ce tour.";
      else if (targetsOf(sel, o).length) go = "Cliquez sur un personnage adverse en surbrillance pour lancer.";
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
      if (!m || m.k !== "atk") return;
      const a = home(m.u), t = [cx(m.tgt.t[0]), cy(m.tgt.t[0], m.tgt.t[1])];
      fx.innerHTML = '<line class="rp-beam" x1="' + a[0].toFixed(1) + '" y1="' + a[1].toFixed(1) + '" x2="' + t[0].toFixed(1) + '" y2="' + t[1].toFixed(1) + '"/>' +
        '<text class="rp-fig" x="' + t[0].toFixed(1) + '" y="' + (t[1] - R * 0.55).toFixed(1) + '" text-anchor="middle" style="animation-delay:0.12s">−' + num(m.dmg) + "</text>";
      m.tgt.g.classList.add("tk-hit"); m.u.g.classList.add("tk-act");
      flashTimer = setTimeout(function () { fx.innerHTML = ""; units.forEach(function (u) { if (u.g) u.g.classList.remove("tk-hit", "tk-act"); }); }, 1500);
    }
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
      zones();
      const panels = unitPanel();
      $("sb-unit").innerHTML = panels[0];
      $("sb-stats").innerHTML = panels[1];
      const o = act && sel && options(sel).filter(function (x) { return x.id === act.id; })[0];
      $("sb-tip").hidden = !o;
      if (o) $("sb-tip").innerHTML = tipHtml(o);
      $("sb-turnlab").textContent = turnText(round, active);
      let r = 1, side = 0;
      $("sb-log").innerHTML = '<li data-k="0" class="rp-turn' + (cur === 0 ? " is-cur" : "") + '"><button type="button">' + turnText(1, 0) + "</button></li>" + steps.map(function (m, i) {
        let text;
        if (m.k === "end") { if (side === 0) side = 1; else { side = 0; r++; } text = turnText(r, side); }
        else if (m.k === "atk") text = esc(m.u.name) + " · " + esc(m.label) + " → " + esc(m.tgt.name) + " <b>−" + num(m.dmg) + "</b>" + (m.dead ? " · hors de combat" : "");
        else text = esc(m.u.name) + " se déplace";
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
      cur = Math.max(0, Math.min(steps.length, k)); settle(cur); act = null; tgtSet = {}; render();
      flash(cur === before + 1 ? steps[cur - 1] : null);  // one step forward (a launch, Suiv., the player): its effects are played
    };
    const stop = function () { if (timer) { clearInterval(timer); timer = null; } $("sb-play").innerHTML = I_PLAY + '<span class="rp-lab"> Lecture</span>'; };
    let tgtSet = {};  // the characters the chosen action can hit (by index)
    const push = function (step) { steps.length = cur; steps.push(step); go(steps.length); };

    // ---- the zones of the chosen character (rules in hex-rules.js): the hexes it can reach, and those the other side can hit after moving ----
    const RULES = window.HexRules ? window.HexRules(d.cells) : null;
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
          any: function (c, rr) { const o = occ[c + "," + rr]; return !!o && o !== u; }, stop: function () { return false; } });
      };
      if (sel.side !== active) {  // a character of the side that is not playing: every hex it can hit, after moving, with an attack or an ability (red)
        const rngA = hitReach(sel), hit = {};
        reachOf(sel, (sel.rules.mv || 0) + (sel.rules.ra ? 1 : 0)).forEach(function (p) { RULES.hits([p.c, p.r], rngA, !!sel.rules.id).forEach(function (t) { hit[t[0] + "," + t[1]] = 1; }); });
        let h = "";
        d.cells.forEach(function (c) { if (hit[c[0] + "," + c[1]] && c[4] !== 2) h += '<polygon class="rp-z rp-z-dg" points="' + hexAt(cx(c[0]), cy(c[0], c[1]), 0.94) + '"/>'; });
        layer.innerHTML = h;
        return;
      }
      const go = reachOf(sel, budget(sel)), danger = {};
      go.forEach(function (p) { if (p.k) reachNow[p.c + "," + p.r] = p.k; });
      live().forEach(function (u) {
        if (u.side === sel.side) return;
        const rng = hitReach(u);
        reachOf(u, (u.rules.mv || 0) + (u.rules.ra ? 1 : 0)).forEach(function (p) { RULES.hits([p.c, p.r], rng, !!u.rules.id).forEach(function (t) { danger[t[0] + "," + t[1]] = 1; }); });
      });
      let html = "", exposed = 0, n = 0;
      d.cells.forEach(function (c) { if (danger[c[0] + "," + c[1]] && c[4] !== 2) html += '<polygon class="rp-z rp-z-dg" points="' + hexAt(cx(c[0]), cy(c[0], c[1]), 0.94) + '"/>'; });
      go.forEach(function (p) {
        const hot = !!danger[p.c + "," + p.r], own = p.k === 0;
        if (!own) { n++; if (hot) exposed++; }
        html += '<polygon class="rp-z rp-z-mv' + (hot ? " rp-z-hot" : "") + (own ? " rp-z-own" : "") + '" data-c="' + p.c + '" data-r="' + p.r + '" points="' + hexAt(cx(p.c), cy(p.c, p.r), 0.94) + '"/>';
      });
      layer.innerHTML = html;
    }
    // a move: the chosen character goes to a hex it can reach (what it spends of its movement is kept until the end of the turn)
    const moveTo = function (u, c, r) {
      const cost = reachNow[c + "," + r];
      if (!cost || !mine() || u !== sel) return false;
      push({ k: "mv", u: u, from: u.t.slice(), to: [c, r], cost: cost });
      return true;
    };
    const strike = function (u, o, t) {
      const ts = targetsOf(u, o).filter(function (x) { return x.u === t; })[0];
      if (!ts) return;
      push({ k: "atk", u: u, tgt: t, dmg: ts.dmg, label: o.ab ? o.name : "Attaque", dead: healthAfter(t, ts.dmg) <= 0 });
    };

    // ---- dragging ----
    const toSvg = function (ev) { const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
    const cellAt = function (p) {  // the hex whose centre is the closest to the point (within a hexagon's reach)
      let best = null;
      d.cells.forEach(function (c) { const k = Math.hypot(cx(c[0]) - p.x, cy(c[0], c[1]) - p.y); if (k < R * 1.1 && (!best || k < best.k)) best = { c: [c[0], c[1]], k: k }; });
      return best && best.c;
    };
    const lit = function (c) {
      svg.querySelectorAll(".rp-cell.sb-drop").forEach(function (p) { p.classList.remove("sb-drop"); });
      if (c) { const p = svg.querySelector('.rp-cell[data-c="' + c[0] + '"][data-r="' + c[1] + '"]'); if (p) p.classList.add("sb-drop"); }
    };
    const choose = function (u) {  // picking a character (a click, or the start of a drag): its reach is computed for the zones
      if (sel !== u) { act = null; tgtSet = {}; }
      sel = u;
    };
    tokLayer.addEventListener("pointerdown", function (ev) {
      const g = ev.target.closest(".tk");
      if (!g || ev.button > 0) return;
      const u = units[+g.dataset.i];
      ev.preventDefault();
      // an action is chosen and this character is one of its targets: the click hits it
      if (act && sel && tgtSet[u.i]) { const o = options(sel).filter(function (x) { return x.id === act.id; })[0]; strike(sel, o, u); return; }
      const wasSel = sel === u;  // clicking the chosen character again lets go of it
      if (u.mow || u.side !== active || !u.alive) { if (wasSel) { sel = null; act = null; tgtSet = {}; } else choose(u); render(); return; }  // the other side: only to look at it
      stop();
      choose(u);
      render();
      const p0 = toSvg(ev), c0 = home(u), dx = c0[0] - p0.x, dy = c0[1] - p0.y, x0 = ev.clientX, y0 = ev.clientY;
      let moved = false;
      g.setPointerCapture(ev.pointerId);
      function move(e2) {
        if (!moved && Math.hypot(e2.clientX - x0, e2.clientY - y0) < 5) return;
        if (!moved) { moved = true; g.classList.add("dragging"); tokLayer.appendChild(g); }
        const p = toSvg(e2), c = cellAt({ x: p.x + dx, y: p.y + dy });
        pos(g, [p.x + dx, p.y + dy]);
        lit(c && reachNow[c[0] + "," + c[1]] ? c : null);  // the hexes it can go to light up
      }
      function up(e2) {
        g.removeEventListener("pointermove", move); g.removeEventListener("pointerup", up); g.removeEventListener("pointercancel", up);
        g.classList.remove("dragging");
        lit(null);
        if (!moved) { if (wasSel) { sel = null; act = null; tgtSet = {}; } render(); return; }
        const p = toSvg(e2), target = e2.type === "pointercancel" ? null : cellAt({ x: p.x + dx, y: p.y + dy });
        if (!(target && !occupant(target[0], target[1], u) && moveTo(u, target[0], target[1]))) render();  // out of reach: it goes back
      }
      g.addEventListener("pointermove", move); g.addEventListener("pointerup", up); g.addEventListener("pointercancel", up);
    });
    // a click on a hex the chosen character can reach moves it there; anywhere else on the board lets go of the choice
    svg.addEventListener("click", function (ev) {
      if (ev.target.closest(".tk")) return;
      const z = ev.target.closest(".rp-z-mv"), cell = z || ev.target.closest(".rp-cell");
      const c = cell ? [+cell.dataset.c, +cell.dataset.r] : null;
      if (c && sel && !(act) && reachNow[c[0] + "," + c[1]] && !occupant(c[0], c[1], sel) && moveTo(sel, c[0], c[1])) return;
      if (sel) { sel = null; act = null; tgtSet = {}; render(); }
    });
    // the character panel: the action buttons, then the targets
    $("sb-unit").addEventListener("click", function (ev) {
      const b = ev.target.closest(".sb-act");
      if (!b || !sel) return;
      act = act && act.id === b.dataset.act ? null : { id: b.dataset.act };
      tgtSet = {};
      const o = act && options(sel).filter(function (x) { return x.id === act.id; })[0];
      if (o && mine() && o.ok) targetsOf(sel, o).forEach(function (x) { tgtSet[x.u.i] = 1; });  // the characters it can hit light up: click one to launch it
      render();
    });
    $("sb-tip").addEventListener("click", function (ev) {
      if (ev.target.closest(".sb-tip-x")) { act = null; tgtSet = {}; render(); }
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
      if (e.key === "Escape" && (sel || act)) { if (act) { act = null; tgtSet = {}; } else sel = null; render(); }
      else if (e.key === "ArrowRight") { stop(); go(cur + 1); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { stop(); go(cur - 1); e.preventDefault(); }
      else if ((e.key === "z" || e.key === "Z") && (e.metaKey || e.ctrlKey)) { $("sb-undo").click(); e.preventDefault(); }
    });
    settle(0);
    render();
  }
})();
