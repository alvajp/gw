// Replay page (replay.html#<id>): plays a raid battle recorded by the game (data/replays/<id>.json, built by scripts/replays.py from the game's replay files).
// Nothing is recomputed here: the page only replays what the game's engine logged, step by step (one step = a move, an ability, a turn change ...), on the board
// of the battle (flat-top hexagons, the even columns sit half a cell lower, the boss's side at the top), with the units, their health and the damage dealt to the boss.
// The tokens glide from tile to tile, hits flash with their figure, health bars shrink; a click on a unit shows its stats.
(function () {
  const root = document.getElementById("rp");
  if (!root) return;
  const NS = "http://www.w3.org/2000/svg";
  const assets = "assets/", data = "data/";
  const id = location.hash.replace(/^#/, "");
  const esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  const fmt = function (n) { return Number(n).toLocaleString("fr-FR"); };
  const ICO = function (d0) { return '<svg class="rp-ico" viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">' + d0 + "</svg>"; };
  const I_FIRST = ICO('<path d="M5 5h2.5v14H5zM19 5.5v13L9 12z"/>'), I_PREV = ICO('<path d="M17 5.5v13L7 12z"/>'), I_PLAY = ICO('<path d="M7 5.5v13L18 12z"/>'),
    I_PAUSE = ICO('<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>'), I_LAST = ICO('<path d="M16.5 5H19v14h-2.5zM5 5.5v13L15 12z"/>');
  const R = 30, W = Math.sqrt(3) * R;  // hexagon radius, height of a cell
  let names = {};
  try { names = JSON.parse(document.getElementById("rp-names").textContent); } catch (e) {}

  if (!/^[0-9a-f]{12}$/.test(id)) { root.innerHTML = '<p class="mnone">Replay introuvable.</p>'; return; }
  Promise.all([
    fetch(data + "replays/" + id + ".json").then(function (r) { if (!r.ok) throw 0; return r.json(); }),
    fetch(data + "raid-meta.json").then(function (r) { return r.json(); }).catch(function () { return { units: {}, bosses: {} }; }),
  ]).then(function (res) { start(res[0], res[1]); }).catch(function () { root.innerHTML = '<p class="mnone">Replay introuvable.</p>'; });

  function pretty(s) { return /NormalAttack$/.test(s || "") ? "Attaque" : String(s || "").replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2"); }

  function start(d, meta) {
    const bossEnts = Object.keys(d.units).filter(function (e) { return d.units[e].b; });
    const WAR = d.mode === "GuildWars";  // a guild war attack: your team against a defence, no boss; the damage figures count what your team deals to theirs
    const bossInfo = WAR ? { n: "Guerre de guilde", a: "" } : meta.bosses[d.key] || { n: pretty(d.boss), a: "" };
    document.title = bossInfo.n + " · Replay";
    // the summons: the log says who summoned them (the unit's parent) and the step that made them (the ability)
    const made = {};
    d.steps.forEach(function (st0) { st0.ev.forEach(function (ev) { if (ev[0] === "add" && d.units[ev[1]] && d.units[ev[1]].parent) made[ev[1]] = st0.n === "User_UseAbility" ? st0.l : ""; }); });
    const SUMMON_FR = { SporeMineLauncher: "Mine à spores", BioMinefield: "Mine à spores" };  // the names of the abilities that summon, in French when known
    const unitName = function (e) {
      const u = d.units[e];
      if (!u) return "?";
      if (u.b) return bossInfo.n;
      const id0 = (u.id || "").split(":")[0];
      if (d.names && d.names[id0]) return d.names[id0];
      if (meta.units[id0]) return meta.units[id0];
      if (u.id) return pretty(id0.replace(/^GuildBoss\d+/, "").replace(/^(MiniBoss|Boss|Npc|Minion)\d+/, ""));
      if (u.parent && d.units[u.parent]) return (SUMMON_FR[made[e]] || (made[e] ? pretty(made[e]) : "Invocation")) + " (" + unitName(u.parent) + ")";  // "Mine à spores (Biovore)"
      return u.o === 0 ? "Invocation" : "Ennemi";
    };
    const portrait = function (e) {
      const u = d.units[e];
      if (u.b && bossInfo.a) return assets + bossInfo.a;
      const id0 = (u.id || "").split(":")[0];
      if (d.art) { const f = Array.isArray(d.art) ? (d.art.indexOf(id0) >= 0 ? "units/" + id0 + ".webp" : "") : d.art[id0]; return f ? assets + f : ""; }  // the replay says which units have a portrait (and where)
      return u.id && u.o === 0 ? assets + "units/" + u.id + ".webp" : "";
    };

    // ---- geometry: cell (column, row) -> centre. Flat-top hexagons, row 0 (our side) at the bottom, the boss's side at the top. With the game's own picture of the board
    // (d.pic) the grid is the one fitted on that picture: a slightly tilted view, so the rows are a little closer than the columns (sy < 1), and the playable cells sit
    // at column c0, row r0 of the game's visual grid; svg units = texture pixels x K. Without a picture: a regular grid. ----
    const HD = !!d.pic, K = HD ? R / d.pic.R : 1, SY = HD ? d.pic.sy : 1, HS = SY * W;  // HS: height of a cell
    const C0 = HD ? d.pic.c0 : 0, R0 = HD ? d.pic.r0 : d.h - 1, X0 = HD ? K * d.pic.ox + R : R, Y0 = HD ? K * d.pic.oy : 0;
    const lower = function (c) { return (c + (HD ? C0 : 3)) % 2 === 0; };  // the columns that sit half a cell lower (the odd columns of the game's logical grid)
    const cx = function (c) { return X0 + (c + C0) * 1.5 * R; };
    const cy = function (c, r) { return Y0 + (R0 - r + (lower(c) ? 0.5 : 0)) * HS + HS / 2; };
    const hexAt = function (x, y, k) {
      let p = "";
      for (let i = 0; i < 6; i++) p += (x + R * k * Math.cos(i * Math.PI / 3)).toFixed(1) + "," + (y + SY * R * k * Math.sin(i * Math.PI / 3)).toFixed(1) + " ";
      return p;
    };
    const tileXY = function (tileEntity) {  // a tile's entity id (the abilities target tiles) -> [column, row]
      const i = tileEntity - d.tile0;
      return i >= 0 && i < d.w * d.h ? [Math.floor(i / d.h), i % d.h] : null;
    };
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    d.cells.forEach(function (c) { const x = cx(c[0]), y = cy(c[0], c[1]); minX = Math.min(minX, x - R); maxX = Math.max(maxX, x + R); minY = Math.min(minY, y - HS / 2); maxY = Math.max(maxY, y + HS / 2); });
    const M = R * 0.6;  // a little terrain around the cells
    const vb = HD ? [d.pic.x0 * K, d.pic.y0 * K, d.pic.w * K, d.pic.h * K] : [minX - M, minY - M, maxX - minX + 2 * M, maxY - minY + 2 * M + 24];
    const tint = function (cell) {  // [col, row, tile, elevation, kind]
      const t = cell[2], el = cell[3], l = 24 + Math.min(el, 4) * 5;
      if (cell[4] === 1) return t === "Water" ? "hsl(210 45% 30%)" : "hsl(25 12% " + (30 + el * 3) + "%)";
      if (t === "Swamp") return "hsl(85 28% " + (l - 2) + "%)";
      if (t === "DryBush") return "hsl(42 30% " + (l + 2) + "%)";
      if (cell[4] === 2) return "hsl(140 12% " + (l - 6) + "%)";
      return "hsl(140 22% " + l + "%)";
    };
    const centre = function (tiles) {
      let x = 0, y = 0;
      tiles.forEach(function (t) { x += cx(t[0]); y += cy(t[0], t[1]); });
      return [x / tiles.length, y / tiles.length];
    };

    // ---- state: what is on the board after step k ----
    let st = null, at = -1;
    const fresh = function () { return { units: {}, dealt: {}, hits: {}, all: {}, exp: {}, round: 0, side: 0, boss: d.hp0 }; };
    function apply(s, step) {
      step.ev.forEach(function (ev) {
        const e = ev[1];
        if (ev[0] === "add") { const u = d.units[e]; s.units[e] = { t: u.t, hp: u.b ? d.hp0 : u.hp0, alive: true }; }
        else if (ev[0] === "mv" && s.units[e]) s.units[e].t = ev[2];
        else if (ev[0] === "dmg") {
          const t = s.units[e];
          if (t) t.hp = ev[7];
          const a = s.all[ev[2]] = s.all[ev[2]] || { n: 0, c: 0 };  // every hit of the attacker, and how many were critical
          if (!ev[6]) { a.n++; a.c += ev[4]; }
          const au = d.units[ev[2]], tu = d.units[e];
          if (WAR ? (au && tu && au.o === 0 && tu.o === 1) : bossEnts.indexOf(String(e)) >= 0) {  // what counts: the hits on the boss, in a war the hits of your team on theirs
            if (!WAR) s.boss = ev[7];
            s.dealt[ev[2]] = (s.dealt[ev[2]] || 0) + ev[3];
            const h = s.hits[ev[2]] = s.hits[ev[2]] || { n: 0, c: 0 };  // the hits on the boss (the ledger): critical ones, and what the attacker's crit chance expected
            if (!ev[6]) { h.n++; h.c += ev[4]; s.exp[ev[2]] = (s.exp[ev[2]] || 0) + ((d.units[ev[2]] && d.units[ev[2]].stats ? d.units[ev[2]].stats.crit : 0) / 100); }
          }
        }
        else if (ev[0] === "rm" && s.units[e]) s.units[e].alive = false;
        else if (ev[0] === "turn") { s.side = ev[1]; s.round = ev[2] || s.round; }
      });
    }
    function seek(k) {
      if (!st || k < at) { st = fresh(); at = -1; }
      while (at < k) { at++; apply(st, d.steps[at]); }
      return st;
    }
    // the first playable step: everything before is the set-up (units dropped on the board)
    const first = Math.max(0, d.steps.findIndex(function (s) { return !s.setup; }));
    const last = d.steps.length - 1;
    let cur = first - 1, prev = cur, timer = null, speed = 1, sel = null;

    // ---- layout ----
    const player = names[d.user] || "";
    root.innerHTML =
      '<div class="rp-top"><div class="rp-sum">' + (bossInfo.a ? '<img class="rp-boss" src="' + assets + bossInfo.a + '" alt="">' : "") +
      '<div><b>' + esc(bossInfo.n) + (d.lvl ? ' <span class="rp-lvl">' + esc(d.lvl) + "</span>" : "") + '</b><small>' + esc(player) + (player ? " · " : "") + (d.season ? "Saison " + d.season + " · " : "") +
      esc(String(d.map || "").replace(/^GB_/, "").replace(/_/g, " ")) + " · v" + esc(d.ver) + '</small></div></div>' +
      (WAR ? '<div class="rp-dmg"><b class="' + (d.result === "PlayerWon" ? "rp-win" : "rp-loss") + '">' + (d.result === "PlayerWon" ? "Victoire" : "Défaite") + "</b><small>" + esc(d.rec ? d.rec.split("-").reverse().join("/") : "") + "</small></div></div>"
        : '<div class="rp-dmg"><b>' + fmt(d.dmg) + '</b><small>dégâts au boss</small></div></div>') +
      '<div class="rp-main"><div class="rp-logcol"><h3>Fil du combat</h3><ol class="rp-log" id="rp-log"></ol></div><div class="rp-left"><div class="rp-boardwrap"><div class="rp-rounds" id="rp-round"></div><div class="rp-board" id="rp-board"></div><div class="rp-tip" id="rp-tip" hidden></div></div>' +
      '<div class="rp-ctl rp-ctl2"><button type="button" class="rp-btn rp-tog" id="rp-el" aria-pressed="false">Altitude</button>' +
      '<span class="rp-hint">Clique une unité pour voir ses stats · ← → pour avancer, espace pour lancer.</span></div></div>' +
      '<div class="rp-right"><div class="rp-bosshp" id="rp-bosshp"></div><div class="rp-step" id="rp-step"></div><div class="rp-ledger" id="rp-ledger"></div></div></div>' +
      '<div class="rp-dock"><input type="range" class="rp-seek" id="rp-seek" min="' + (first - 1) + '" max="' + last + '" value="' + (first - 1) + '" aria-label="Position dans le replay">' +
      '<div class="rp-ctl"><button type="button" class="rp-btn" id="rp-r0" title="Début du round">' + I_FIRST + '<span class="rp-lab"> Round</span></button><button type="button" class="rp-btn" id="rp-prev" title="Étape précédente">' + I_PREV + '<span class="rp-lab"> Préc.</span></button>' +
      '<button type="button" class="rp-btn rp-play" id="rp-play" title="Lecture / pause">' + I_PLAY + '<span class="rp-lab"> Lecture</span></button><button type="button" class="rp-btn" id="rp-next" title="Étape suivante"><span class="rp-lab">Suiv. </span>' + I_PLAY + '</button>' +
      '<button type="button" class="rp-btn" id="rp-r1" title="Round suivant"><span class="rp-lab">Round </span>' + I_LAST + '</button>' +
      '<label class="rp-speed">Vitesse <select id="rp-speed"><option value="1">×1</option><option value="2">×2</option><option value="4">×4</option></select></label></div></div>';
    const $ = function (x) { return document.getElementById(x); };
    if (WAR) $("rp-bosshp").classList.add("rp-war");

    // ---- the board: cells once, then the layers the tokens and the effects live in ----
    let cells = "";
    d.cells.forEach(function (c) {
      cells += '<polygon class="rp-cell" data-k="' + c[4] + '" points="' + hexAt(cx(c[0]), cy(c[0], c[1]), 0.97) + '" fill="' + tint(c) + '" stroke="rgba(0,0,0,.35)" stroke-width="1"/>' +
        '<text class="rp-el" x="' + (cx(c[0]) - R * 0.55).toFixed(1) + '" y="' + (cy(c[0], c[1]) - R * 0.45).toFixed(1) + '">' + c[3] + "</text>";
    });
    $("rp-board").innerHTML = '<svg viewBox="' + vb.map(function (v) { return v.toFixed(1); }).join(" ") + '" role="img" aria-label="Plateau du combat">' + cells + '<g id="rp-tok"></g><g id="rp-fx"></g></svg>';
    // the game's own picture of the board (a crop of its 2048-pixel "visual" texture, see scripts/replays.py) goes under the cells; without it the coloured cells stay
    if (HD) {
      const im = document.createElementNS(NS, "image"), svg = $("rp-board").querySelector("svg");
      im.setAttribute("x", (d.pic.x0 * K).toFixed(1)); im.setAttribute("y", (d.pic.y0 * K).toFixed(1)); im.setAttribute("width", (d.pic.w * K).toFixed(1)); im.setAttribute("height", (d.pic.h * K).toFixed(1));
      im.setAttribute("preserveAspectRatio", "none");
      im.addEventListener("load", function () { $("rp-board").classList.add("has-map"); });
      im.setAttribute("href", assets + d.pic.src);
      svg.insertBefore(im, svg.firstChild);
    }
    $("rp-board").style.setProperty("--ar", (vb[2] / vb[3]).toFixed(4));
    const tokLayer = $("rp-tok"), fx = $("rp-fx");
    const toks = {};

    function makeToken(e) {
      const info = d.units[e], col = info.o === 0 ? "#4ad1c0" : "#f06b6b", r = info.b ? R * 0.95 : R * 0.72, img = portrait(e);
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", "tk" + (info.o === 0 ? " tk-us" : " tk-them") + (info.b ? " tk-boss" : ""));
      g.dataset.e = e;
      g.innerHTML = '<g class="tk-foot"></g><g class="tk-body"><circle r="' + r.toFixed(1) + '" fill="#10151c" stroke="' + col + '" stroke-width="2"/>' +
        (img ? '<clipPath id="cp' + e + '"><circle r="' + (r - 1.5).toFixed(1) + '"/></clipPath><image href="' + img + '" x="' + (-r).toFixed(1) + '" y="' + (-r).toFixed(1) + '" width="' + (2 * r).toFixed(1) + '" height="' +
          (2 * r).toFixed(1) + '" clip-path="url(#cp' + e + ')" preserveAspectRatio="xMidYMid slice"/>' : '<path d="' + (info.o === 0 ? "M0 -7L6 0L0 7L-6 0Z" : "M0 -8L2 -2L8 0L2 2L0 8L-2 2L-8 0L-2 -2Z") + '" fill="' + col + '"/>') +
        '<circle class="tk-ring" r="' + (r + 3).toFixed(1) + '" fill="none"/></g>' +
        // the health bar sits inside the hexagon, over the bottom of the portrait: under the token it was hidden by the unit standing on the next cell
        '<g class="tk-bar" transform="translate(' + (-r * 0.65).toFixed(1) + "," + (r * 0.5).toFixed(1) + ')"><rect width="' + (1.3 * r).toFixed(1) + '" height="6" rx="3" fill="#0b0e12" stroke="rgba(255,255,255,.4)" stroke-width="0.8"/>' +
        '<rect class="tk-hp" x="1" y="1" width="' + (1.3 * r - 2).toFixed(1) + '" height="4" rx="2" fill="#34d399"/></g>';
      g.addEventListener("click", function (ev) {
        ev.stopPropagation();
        if (phone.matches) { sel = e; refreshSel(); return openUnit(e); }  // phones: a modal, like the other dialogs of the site
        sel = sel === e ? null : e;
        refreshSel();
      });
      tokLayer.appendChild(g);
      return { g: g, foot: g.querySelector(".tk-foot"), hp: g.querySelector(".tk-hp"), sig: "", col: col };
    }
    function footprint(tk, tiles, gx, gy, info) {  // the hexagons a unit stands on, relative to its token (so they glide with it)
      const sig = tiles.map(function (t) { return (cx(t[0]) - gx).toFixed(0) + ":" + (cy(t[0], t[1]) - gy).toFixed(0); }).join("|");
      if (sig === tk.sig) return;
      tk.sig = sig;
      tk.foot.innerHTML = tiles.map(function (t) {
        return '<polygon points="' + hexAt(cx(t[0]) - gx, cy(t[0], t[1]) - gy, 0.9) + '" fill="' + tk.col + '" fill-opacity="' + (info.b ? 0.22 : 0.12) + '" stroke="' + tk.col + '" stroke-width="1.5"/>';
      }).join("");
    }
    const pos = function (g, xy) { g.style.transform = "translate(" + xy[0].toFixed(1) + "px," + xy[1].toFixed(1) + "px)"; };
    let pathTimers = [];

    // one line per thing that happened in the step: moves, hits (critical ones starred), arrivals, departures
    function stepDetail(step, s) {
      const lines = [], moved = {};
      step.ev.forEach(function (ev) {
        if (ev[0] === "mv") moved[ev[1]] = true;
      });
      Object.keys(moved).forEach(function (e) { lines.push('<li>' + esc(unitName(e)) + " se déplace</li>"); });
      step.ev.forEach(function (ev) {
        if (ev[0] === "dmg") {
          const flags = (ev[4] ? ' <span class="rp-tag rp-tcrit">★ critique</span>' : "") + (ev[5] ? ' <span class="rp-tag">bloqué</span>' : "") + (ev[6] ? ' <span class="rp-tag">esquivé</span>' : "");
          lines.push('<li class="' + (ev[4] ? "rp-lcrit" : "") + '">' + esc(unitName(ev[2])) + " → " + esc(unitName(ev[1])) + " <b>" + (ev[6] ? "0" : "−" + fmt(ev[3])) + "</b>" + flags + "</li>");
        } else if (ev[0] === "rm") lines.push('<li>' + esc(unitName(ev[1])) + " est retiré</li>");
        else if (ev[0] === "add" && step.n !== "StartTurn" && cur >= first) lines.push('<li>' + esc(unitName(ev[1])) + " arrive</li>");
        else if (ev[0] === "turn") lines.push('<li class="rp-lturn">' + (ev[1] === 0 ? "Round " + ev[2] + " · votre tour" : "Round " + ev[2] + " · " + (WAR ? "tour de la défense" : "tour du boss")) + "</li>");
      });
      if (!lines.length) return '<h3>Étape</h3><p class="rp-none">Rien à signaler dans cette étape.</p>';
      const title = step.n === "User_UseAbility" ? unitName(step.a) + " · " + pretty(step.l) : step.l === "User_MoveUnit" ? "Déplacement" : "Étape " + (step.i - first + 1);
      return "<h3>" + esc(title) + "</h3><ul>" + lines.slice(0, 14).join("") + (lines.length > 14 ? "<li>… " + (lines.length - 14) + " de plus</li>" : "") + "</ul>";
    }
    function draw() {
      const s = seek(cur), step = d.steps[cur] || { ev: [] }, one = Math.abs(cur - prev) === 1;
      pathTimers.forEach(clearTimeout);
      pathTimers = [];
      $("rp-board").classList.toggle("rp-jump", !one);  // a seek: no gliding
      const paths = {};  // units that walk several tiles in this step: they step through the tiles
      if (one && cur > prev) step.ev.forEach(function (ev) { if (ev[0] === "mv" && ev[2].length) (paths[ev[1]] = paths[ev[1]] || []).push(centre(ev[2])); });
      const hit = {};
      step.ev.forEach(function (ev) { if (ev[0] === "dmg") hit[ev[1]] = true; });
      Object.keys(d.units).forEach(function (e) {
        const u = s.units[e], info = d.units[e];
        let tk = toks[e];
        const alive = u && u.alive && u.t.length;
        if (!tk) { if (!alive) return; tk = toks[e] = makeToken(e); tk.g.classList.add("tk-new"); }
        tk.g.classList.toggle("gone", !alive);
        if (!alive) return;
        const c = centre(u.t);
        footprint(tk, u.t, c[0], c[1], info);
        if (paths[e] && paths[e].length > 1) {
          paths[e].forEach(function (xy, i) { pathTimers.push(setTimeout(function () { pos(tk.g, xy); }, i * 170 / speed)); });
        } else pos(tk.g, c);
        const max = info.b ? d.max : info.hp, pct = Math.max(0, Math.min(1, u.hp / (max || 1)));
        tk.hp.style.transform = "scaleX(" + pct.toFixed(3) + ")";
        tk.hp.setAttribute("fill", pct > 0.5 ? "#34d399" : pct > 0.25 ? "#f2b134" : "#f87171");
        tk.g.classList.toggle("tk-act", step.a !== null && step.a !== undefined && +e === step.a);
        tk.g.classList.toggle("tk-hit", !!hit[e]);
      });
      // effects of the step: a beam from the acting unit to what it hits, and the figures
      fx.innerHTML = "";
      const at0 = step.a !== null && step.a !== undefined && s.units[step.a] && s.units[step.a].t.length ? centre(s.units[step.a].t) : null;
      const targets = [];
      step.ev.forEach(function (ev) { if (ev[0] === "dmg" && s.units[ev[1]] && s.units[ev[1]].t.length && targets.indexOf(ev[1]) < 0) targets.push(ev[1]); });
      if (at0 && step.n === "User_UseAbility") {
        const ends = targets.length ? targets.slice(0, 4).map(function (t) { return centre(s.units[t].t); }) : (step.t !== null && step.t !== undefined && d.units[step.t] === undefined && tileXY(step.t) ? [centre([tileXY(step.t)])] : []);
        ends.forEach(function (p) {
          const ln = document.createElementNS(NS, "line");
          ln.setAttribute("class", "rp-beam");
          ln.setAttribute("x1", at0[0].toFixed(1)); ln.setAttribute("y1", at0[1].toFixed(1)); ln.setAttribute("x2", p[0].toFixed(1)); ln.setAttribute("y2", p[1].toFixed(1));
          fx.appendChild(ln);
        });
      }
      step.ev.forEach(function (ev, i) {
        if (ev[0] !== "dmg" || !s.units[ev[1]] || !s.units[ev[1]].t.length) return;
        const p = centre(s.units[ev[1]].t), t = document.createElementNS(NS, "text");
        t.setAttribute("class", "rp-fig" + (ev[4] ? " rp-crit" : ev[6] ? " rp-miss" : ""));
        t.setAttribute("x", p[0].toFixed(1)); t.setAttribute("y", (p[1] - R * 0.55).toFixed(1)); t.setAttribute("text-anchor", "middle");
        t.style.animationDelay = (0.12 + i * 0.05) + "s";
        t.textContent = ev[6] ? "esquive" : "−" + fmt(ev[3]) + (ev[4] ? "★" : "");
        fx.appendChild(t);
      });
      prev = cur;
      requestAnimationFrame(function () { $("rp-board").querySelectorAll(".tk-new").forEach(function (g) { g.classList.remove("tk-new"); }); });
      // panels
      const left = d.rounds && s.round ? d.rounds - s.round + (s.side === 0 ? 1 : 0) : null;
      $("rp-round").innerHTML = cur < first ? "<b>Mise en place</b>" : s.round ? "<b>Round " + s.round + (d.rounds ? " / " + d.rounds : "") + "</b><span>" + (s.side === 0 ? "votre tour" : (WAR ? "tour de la défense" : "tour du boss")) +
        (left !== null ? " · " + left + (left > 1 ? " rounds restants" : " round restant") : "") + "</span>" : "";
      if (WAR) {  // the health of the main units (no summons) of each side
        const tot = [[0, 0], [0, 0]];
        Object.keys(d.units).forEach(function (e) { const u = d.units[e], x = s.units[e]; if (u.parent || !u.hp) return; tot[u.o][1] += u.hp; tot[u.o][0] += x && x.alive ? Math.max(0, Math.min(u.hp, x.hp)) : 0; });
        const bar = function (lab, t, cls) { return '<div class="rp-team"><span>' + lab + '</span><div class="rp-bar ' + cls + '"><i style="width:' + (t[1] ? 100 * t[0] / t[1] : 0).toFixed(1) + '%"></i></div><small>' + fmt(t[0]) + " / " + fmt(t[1]) + "</small></div>"; };
        $("rp-bosshp").innerHTML = bar("Votre équipe", tot[0], "rp-bar-us") + bar("Défense", tot[1], "rp-bar-them");
      }
      const pct = WAR ? 0 : Math.max(0, s.boss / d.max * 100);
      if (!WAR) $("rp-bosshp").innerHTML = '<div class="rp-bar"><i style="width:' + pct.toFixed(2) + '%"></i></div><small>' + fmt(Math.max(0, s.boss)) + " / " + fmt(d.max) + " PV · " + fmt(d.hp0 - Math.max(0, s.boss)) + " infligés</small>";
      const grp = {};  // the summons of one kind (same name) are one line: "Mine à spores (Biovore) ×3"
      Object.keys(s.dealt).forEach(function (e) {
        const k = unitName(e), g = grp[k] = grp[k] || { e: e, dmg: 0, n: 0, c: 0, ents: 0 }, h = s.hits[e] || { n: 0, c: 0 };
        g.dmg += s.dealt[e]; g.n += h.n; g.c += h.c; g.ents++;
      });
      const rows = Object.keys(grp).sort(function (a, b) { return grp[b].dmg - grp[a].dmg; }).map(function (k) {
        const g = grp[k], img = portrait(g.e), pc = g.n ? Math.round(100 * g.c / g.n) : 0;
        return "<li>" + (img ? '<img src="' + img + '" alt="">' : "<span></span>") + "<b>" + esc(k) + (g.ents > 1 ? " ×" + g.ents : "") + '<small title="' + g.c + " critique" + (g.c > 1 ? "s" : "") + " sur " + g.n + " coup" + (g.n > 1 ? "s" : "") + ' sur le boss">' +
          pc + " % crit · " + g.c + "/" + g.n + "</small></b><i>" + fmt(g.dmg) + "</i></li>";
      }).join("");
      let n = 0, c = 0, ex = 0;
      Object.keys(s.hits).forEach(function (e) { n += s.hits[e].n; c += s.hits[e].c; ex += s.exp[e] || 0; });
      const luck = n ? '<p class="rp-luck">Critiques ' + (WAR ? "de votre équipe" : "sur le boss") + ' : <b>' + c + " sur " + n + " coups</b> · attendu ≈ " + ex.toFixed(1).replace(".", ",") + (n >= 5 ? (c > ex + 0.5 ? ' <span class="pos">de la chance</span>' : c < ex - 0.5 ? ' <span class="neg">de la malchance</span>' : "") : "") + "</p>" : "";
      $("rp-ledger").innerHTML = "<h3>" + (WAR ? "Dégâts infligés" : "Dégâts au boss") + "</h3>" + (rows ? "<ul>" + rows + "</ul>" + luck : '<p class="rp-none">Aucun coup ' + (WAR ? "porté" : "au boss") + " pour l\'instant.</p>");
      // the detail of the current step, hit by hit
      $("rp-step").innerHTML = stepDetail(step, s);
      $("rp-seek").value = cur;
      root.querySelectorAll(".rp-log li").forEach(function (x) { x.classList.toggle("is-cur", +x.dataset.i === cur); });
      const on = root.querySelector(".rp-log li.is-cur");
      if (on) { const box = $("rp-log"); box.scrollTop = on.offsetTop - box.clientHeight / 2 + on.clientHeight / 2; }
      refreshSel();
    }
    // the selected unit: a ring on the board and its stats, in a tooltip next to it (a modal on phones)
    const phone = window.matchMedia("(max-width: 640px)");
    function unitBody(e) {
      const u = st && st.units[e], info = d.units[e], s = info.stats || {}, max = info.b ? d.max : info.hp, a = st && st.all[e];
      const row = function (k, v) { return "<dt>" + k + "</dt><dd>" + v + "</dd>"; };
      const par = info.parent && d.units[info.parent] ? row("Invoqué par", esc(unitName(info.parent)) + (made[e] ? " · " + esc(SUMMON_FR[made[e]] || pretty(made[e])) : "")) : "";
      return '<dl class="rp-stats">' + par + row("PV", fmt(Math.max(0, u ? u.hp : 0)) + " / " + fmt(max)) + row("Attaque", fmt(s.atk || 0)) + row("Armure", fmt(s.arm || 0)) + row("Mouvement", s.mov || 0) +
        row("Chance de crit", (s.crit || 0) + " %") + (s.rng ? row("Portée", s.rng) : "") + (a ? row("Crits dans ce combat", a.c + " sur " + a.n + " coup" + (a.n > 1 ? "s" : "")) : "") + "</dl>";
    }
    function unitHead(e) {
      const info = d.units[e], img = portrait(e);
      return (img ? '<img src="' + img + '" alt="">' : "") + "<div><b>" + esc(unitName(e)) + "</b><small>" + (info.o === 0 ? "Votre camp" : "Camp du boss") + "</small></div>";
    }
    function openUnit(e) {
      const dlg = document.createElement("dialog");
      dlg.className = "defense-modal atk-modal rp-unit-modal";
      dlg.innerHTML = '<div class="dm-head"><div class="dm-title"><div class="dm-def rp-tip-head">' + unitHead(e) + '</div></div><button type="button" class="dm-close" aria-label="Fermer">×</button></div><div class="dm-body">' + unitBody(e) + "</div>";
      dlg.addEventListener("click", function (ev) { if (ev.target === dlg || ev.target.closest(".dm-close")) dlg.close(); });
      dlg.addEventListener("close", function () { dlg.remove(); sel = null; refreshSel(); });
      document.body.appendChild(dlg);
      dlg.showModal();
    }
    function refreshSel() {
      Object.keys(toks).forEach(function (e) { toks[e].g.classList.toggle("tk-sel", e === sel); });
      const tip = $("rp-tip"), u = sel && st && st.units[sel], info = sel && d.units[sel];
      if (!u || !info || !u.alive || !u.t.length || phone.matches) { tip.hidden = true; return; }
      tip.innerHTML = '<button type="button" class="rp-x" aria-label="Fermer">×</button><div class="rp-tip-head">' + unitHead(sel) + "</div>" + unitBody(sel);
      tip.hidden = false;
      // placed above the unit (below when there is no room), kept inside the board's frame; the position comes from the unit's cell, not from its gliding token
      const svg = $("rp-board").querySelector("svg"), sr = svg.getBoundingClientRect(), wr = $("rp-board").parentNode.getBoundingClientRect(), sc = sr.width / vb[2];
      const c = centre(u.t), px = sr.left - wr.left + (c[0] - vb[0]) * sc, py = sr.top - wr.top + (c[1] - vb[1]) * sc, rr = (info.b ? 0.95 : 0.72) * R * sc;
      const w = tip.offsetWidth, h = tip.offsetHeight;
      let top = py - rr - h - 10;
      if (top < 4) top = py + rr + 10;
      tip.style.left = Math.max(4, Math.min(wr.width - w - 4, px - w / 2)).toFixed(0) + "px";
      tip.style.top = top.toFixed(0) + "px";
    }
    $("rp-tip").addEventListener("click", function (ev) { ev.stopPropagation(); if (ev.target.closest(".rp-x")) { sel = null; refreshSel(); } });
    $("rp-board").addEventListener("click", function () { if (sel) { sel = null; refreshSel(); } });  // a click elsewhere on the board closes it
    // ---- the log: one line per step ----
    const lineText = function (s) {
      const turn = s.ev.find(function (ev) { return ev[0] === "turn"; });
      if (turn) return (turn[1] === 0 ? "Round " + turn[2] + " · votre tour" : "Round " + turn[2] + " · " + (WAR ? "tour de la défense" : "tour du boss"));
      const dm = {};
      s.ev.forEach(function (ev) { if (ev[0] === "dmg") dm[ev[1]] = (dm[ev[1]] || 0) + ev[3]; });
      const dmgTxt = Object.keys(dm).map(function (t) { return unitName(t) + " −" + fmt(dm[t]); }).join(", ");
      if (s.l === "User_MoveUnit") return unitName(s.a) + " se déplace";
      if (s.n === "User_UseAbility") return unitName(s.a) + " · " + pretty(s.l) + (dmgTxt ? " → " + dmgTxt : "");
      const adds = s.ev.filter(function (ev) { return ev[0] === "add"; }), rms = s.ev.filter(function (ev) { return ev[0] === "rm"; });
      if (adds.length) return "Arrivée : " + adds.map(function (ev) { return unitName(ev[1]); }).join(", ");
      if (rms.length) return "Retirés : " + rms.map(function (ev) { return unitName(ev[1]); }).join(", ");
      return pretty(s.l || s.n) + (dmgTxt ? " → " + dmgTxt : "");
    };
    let logHtml = "";
    for (let i = first; i <= last; i++) {
      const s = d.steps[i], turn = s.ev.some(function (ev) { return ev[0] === "turn"; });
      logHtml += '<li data-i="' + i + '" class="' + (turn ? "rp-turn" : "") + '"><button type="button">' + esc(lineText(s)) + "</button></li>";
    }
    $("rp-log").innerHTML = logHtml;

    // ---- controls ----
    const go = function (k) { cur = Math.max(first - 1, Math.min(last, k)); draw(); };
    const stop = function () { if (timer) { clearInterval(timer); timer = null; } $("rp-play").innerHTML = I_PLAY + '<span class="rp-lab"> Lecture</span>'; };
    const roundStarts = d.steps.map(function (s, i) { return s.ev.some(function (ev) { return ev[0] === "turn" && ev[1] === 0; }) ? i : -1; }).filter(function (i) { return i >= 0; });
    $("rp-next").onclick = function () { stop(); go(cur + 1); };
    $("rp-prev").onclick = function () { stop(); go(cur - 1); };
    $("rp-r0").onclick = function () { stop(); const p = roundStarts.filter(function (i) { return i < cur; }); go(p.length ? p[p.length - 1] : first - 1); };
    $("rp-r1").onclick = function () { stop(); const n = roundStarts.filter(function (i) { return i > cur; }); go(n.length ? n[0] : last); };
    $("rp-seek").oninput = function (e) { stop(); go(+e.target.value); };
    $("rp-speed").onchange = function (e) { speed = +e.target.value; if (timer) { stop(); $("rp-play").click(); } };
    $("rp-play").onclick = function () {
      if (timer) return stop();
      if (cur >= last) go(first - 1);
      $("rp-play").innerHTML = I_PAUSE + '<span class="rp-lab"> Pause</span>';
      timer = setInterval(function () { if (cur >= last) return stop(); go(cur + 1); }, 900 / speed);
    };
    $("rp-log").onclick = function (e) { const li = e.target.closest("li"); if (li) { stop(); go(+li.dataset.i); } };
    $("rp-el").onclick = function () { const on = $("rp-board").classList.toggle("show-el"); $("rp-el").setAttribute("aria-pressed", String(on)); };
    document.addEventListener("keydown", function (e) {
      if (/INPUT|SELECT|TEXTAREA/.test((e.target.tagName || "")) && e.target.type !== "range") return;
      if (e.key === "Escape" && sel) { sel = null; refreshSel(); }
      if (e.key === "ArrowRight") { stop(); go(cur + 1); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { stop(); go(cur - 1); e.preventDefault(); }
      else if (e.key === " " && e.target.tagName !== "BUTTON") { $("rp-play").click(); e.preventDefault(); }
    });
    go(first - 1);
  }
})();
