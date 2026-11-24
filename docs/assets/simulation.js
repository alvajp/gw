// Simulation (opened from the Attaques page): 1. a map, 2. the defense to face -- the defenses met most often on that map, over every captured war --, 3. the team to use: the teams that already beat
// that defense (or, failing that, the closest defenses).
// All of it is computed here from the compact rows of #sim-data (scripts/generate_site.build_simulation_data): [map, level, defense units, defense MoW, our units, our MoW, outcome,
// score, war, line rarity, defense units in lineup order, attacker, attacker's guild].
(function () {
  const el = document.getElementById("sim-data");
  if (!el) return;
  const D = JSON.parse(el.textContent), rows = D.r;
  const $ = function (id) { return document.getElementById(id); };
  const esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  const RAR = { m: ["M", "mythic"], l: ["L", "legendary"], e: ["E", "epic"], r: ["R", "rare"] };
  let map = -1, defKey = null;
  const unit = function (i, mow) {
    const u = D.u[i];
    return u && u[1] ? '<img class="unit' + (mow ? " mow" : "") + '" src="' + esc(u[1]) + '" alt="' + esc(u[0]) + '" title="' + esc(u[0]) + '" loading="lazy">' : '<span class="unit unit-missing" title="' + esc(u ? u[0] : "?") + '">?</span>';
  };
  const comp = function (units, mow) { return units.map(function (i) { return unit(i, false); }).join("") + (mow >= 0 ? unit(mow, true) : ""); };
  const badge = function (code) { return RAR[code] ? '<i class="rh rh-' + RAR[code][1] + '" title="Rareté de la ligne">' + RAR[code][0] + "</i>" : ""; };
  const pl = function (n, one, many) { return n + " " + (n > 1 ? many : one); };
  const dkey = function (r) { return r[2].join(",") + "|" + r[3]; };
  const akey = function (r) { return r[4].slice().sort(function (a, b) { return a - b; }).join(",") + "|" + r[5]; };
  const shown = function (id, on) { $(id).hidden = !on; };

  function groups(list, keyOf) {
    const g = {};
    list.forEach(function (r) {
      const k = keyOf(r), x = g[k] || (g[k] = { k: k, r: r, n: 0, w: 0, f: 0, x: 0, score: 0, last: -1, rar: {} });
      x.n++; x[r[6] === "w" ? "w" : r[6] === "f" ? "f" : "x"]++; x.score += r[7]; x.last = Math.max(x.last, r[8]);
      if (r[9]) x.rar[r[9]] = (x.rar[r[9]] || 0) + 1;
    });
    return Object.keys(g).map(function (k) { return g[k]; });
  }
  const topRar = function (x) { return Object.keys(x.rar).sort(function (a, b) { return x.rar[b] - x.rar[a]; })[0] || ""; };
  const rate = function (x) { return (x.w + x.f + 1) / (x.n + 2); };  // a win rate that does not trust a single fight

  // ---- 1. maps ----
  const count = {};
  rows.forEach(function (r) { count[r[0]] = (count[r[0]] || 0) + 1; });
  $("sim-map").querySelector(".sim-maps").innerHTML = D.m.map(function (m, i) { return [i, m]; }).filter(function (x) { return count[x[0]]; }).sort(function (a, b) { return count[b[0]] - count[a[0]]; }).map(function (x) {
    return '<button type="button" class="map-chip sim-map-chip" data-map="' + x[0] + '" aria-pressed="false"><span class="sim-map-art"><img class="map-chip-img" src="' + esc(x[1][2]) + '" alt="" loading="lazy"></span><span>' + esc(x[1][1]) + "</span><small>" + pl(count[x[0]], "combat", "combats") + "</small></button>";
  }).join("");

  // ---- 2. the defenses met on that map (all the levels): ONE row per archetype (a line holds the 3 core units of an archetype), the other lines below ----
  const archOf = function (r) {
    const have = r[2].concat(r[3] >= 0 ? [r[3]] : []);
    return D.a.filter(function (a) { return a[1].every(function (u) { return have.indexOf(u) >= 0; }); })[0] || null;
  };
  const stats = function (x) {
    return '<span class="sim-stats"><b>' + pl(x.n, "fois", "fois") + "</b><small>" + pl(x.w + x.f, "victoire", "victoires") + " \u00b7 " + pl(x.x, "\u00e9chec", "\u00e9checs") + "</small></span>";
  };
  function defRow(x, i) {
    return '<button type="button" class="sim-row" data-def="' + esc(x.k) + '" aria-pressed="false"><span class="sim-rank">' + (i + 1) + '</span><span class="sim-comp">' + badge(topRar(x)) + comp(x.r[2], x.r[3]) + "</span>" + stats(x) + "</button>";
  }
  function archRow(x, i) {  // the archetype's three units, a separator, then every other character met in its lines (the most frequent first)
    const core = x.a[1], others = Object.keys(x.others).map(Number).sort(function (a, b) { return x.others[b] - x.others[a]; });
    return '<button type="button" class="sim-row" data-def="arch:' + esc(x.a[0]) + '" aria-pressed="false"><span class="sim-rank">' + (i + 1) + '</span><span class="sim-comp">' + badge(topRar(x)) +
      '<span class="sim-arch-name">' + esc(x.a[0]) + "</span>" + core.map(function (u) { return unit(u, false); }).join("") + '<span class="sim-sep" aria-hidden="true"></span>' +
      others.map(function (u) { return unit(u, false); }).join("") + "</span>" + stats(x) + "</button>";
  }
  function defenses() {
    const list = rows.filter(function (r) { return r[0] === map; });
    const byArch = {}, loose = [];
    list.forEach(function (r) {
      const a = archOf(r);
      if (!a) { loose.push(r); return; }
      const x = byArch[a[0]] || (byArch[a[0]] = { a: a, n: 0, w: 0, f: 0, x: 0, last: -1, rar: {}, others: {} });
      x.n++; x[r[6] === "w" ? "w" : r[6] === "f" ? "f" : "x"]++; x.last = Math.max(x.last, r[8]);
      if (r[9]) x.rar[r[9]] = (x.rar[r[9]] || 0) + 1;
      r[2].concat(r[3] >= 0 ? [r[3]] : []).forEach(function (u) { if (a[1].indexOf(u) < 0) x.others[u] = (x.others[u] || 0) + 1; });
    });
    const arch = Object.keys(byArch).map(function (k) { return byArch[k]; }).sort(function (a, b) { return b.n - a.n; });
    const g = groups(loose, dkey).sort(function (a, b) { return b.n - a.n || b.last - a.last; });
    let html = arch.map(archRow).join("");
    if (g.length) {  // the lines that fit no archetype stay behind an expander
      const lines = g.slice(0, 12).map(defRow).join("");
      html += html ? '<details class="sim-others"><summary>Autres d\u00e9fenses <small>' + pl(g.length, "ligne", "lignes") + "</small></summary>" + lines + "</details>" : lines;
    }
    $("sim-def").querySelector(".sim-list").innerHTML = html || '<p class="mnone">Aucune d\u00e9fense vue.</p>';
    shown("sim-def", true);
    shown("sim-atk", false);
  }

  // ---- 3. what to play against it: the attacks that worked (ours and the Attaques page's guilds'), best score first, and a preview of the map for the one picked ----
  let shownRows = [], slotsPromise = null;
  const slotsOf = function () {
    return slotsPromise || (slotsPromise = fetch("assets/slots.json").then(function (r) { return r.json(); }).catch(function () { return {}; }));
  };
  // the address of the simulation board page for an attack: the map, our team, their defense (in lineup order) and where it comes from (sim-board.js)
  const uid = function (i) { const u = D.u[i]; return u && u[1] ? (u[1].match(/([^\/]+)\.webp/) || [])[1] || "" : ""; };
  function boardUrl(r) {
    const m = D.m[map], p = new URLSearchParams();
    p.set("m", m[0]); p.set("n", m[1]); p.set("l", D.t[r[1]] ? D.t[r[1]][1] : "");
    p.set("a", r[4].map(uid).join(",")); if (r[5] >= 0) p.set("am", uid(r[5]));
    p.set("d", r[10].map(uid).join(",")); if (r[3] >= 0) p.set("dm", uid(r[3]));
    p.set("p", D.p[r[11]]); p.set("g", D.g[r[12]]); p.set("w", D.w[r[8]]); p.set("s", r[7]);
    return "simulation-board.html#" + p.toString();
  }
  function preview(i) {
    const r = shownRows[i], box = document.querySelector("#sim-atk .sim-preview");
    if (!r || !box) return;
    document.querySelectorAll("#sim-atk .sim-table tbody tr").forEach(function (tr) { tr.classList.toggle("is-picked", +tr.dataset.i === i); });
    const img = D.m[map][2], id = (img.match(/([^\/]+)\.webp/) || [])[1];
    slotsOf().then(function (all) {
      const slot = all[id], size = all.size || 480;
      const at = function (xy) { return "left:" + (xy[0] / size * 100).toFixed(2) + "%;top:" + (xy[1] / size * 100).toFixed(2) + "%"; };
      const place = function (ids, side, cls) {
        return ids.map(function (u, k) {
          const xy = slot && slot[side][k], d = D.u[u];
          return xy && d && d[1] ? '<img class="pl-unit ' + cls + '" style="' + at(xy) + '" src="' + esc(d[1]) + '" alt="' + esc(d[0]) + '" title="' + esc(d[0]) + '" draggable="false">' : "";
        }).join("");
      };
      box.innerHTML = '<div class="sim-pv-head"><b>' + esc(D.p[r[11]]) + "</b><small>" + esc(D.g[r[12]]) + " \u00b7 " + esc(D.w[r[8]]) + '</small><span class="sim-score ' + "is-win" + '">' + r[7] + "</span></div>" +
        '<div class="pl-board" tabindex="0" role="link" title="Ouvrir la simulation (d\u00e9placer les persos)" data-sb="' + esc(boardUrl(r)) + '"><img class="pl-map" src="' + esc(img) + '" alt="" draggable="false">' + (slot ? place(r[10], "e", "pl-def") + place(r[4], "o", "pl-att") : "") + "</div>";
    });
  }
  let cands = [], noteHtml = "";
  function attacks() {
    const here = rows.filter(function (r) { return r[0] === map && r[6] === "w"; });  // real victories only (no finishing blows), every level
    const isArch = defKey.indexOf("arch:") === 0;
    const exact = isArch ? here.filter(function (r) { const a = archOf(r); return a && a[0] === defKey.slice(5); }) : here.filter(function (r) { return dkey(r) === defKey; });
    const mine = isArch ? [] : rows.filter(function (r) { return dkey(r) === defKey; })[0][2];
    const near = exact.length || isArch ? [] : here.filter(function (r) { return r[2].filter(function (u) { return mine.indexOf(u) >= 0; }).length >= 4; });
    const best = function (a, b) { return b[7] - a[7] || b[8] - a[8]; };
    cands = (exact.length ? exact : near).slice().sort(best);
    noteHtml = !exact.length && near.length ? '<p class="sim-note">Cette d\u00e9fense n\'a jamais \u00e9t\u00e9 battue telle quelle : voici des victoires contre des d\u00e9fenses proches (au moins 4 unit\u00e9s en commun).</p>' : "";
    shown("sim-atk", true);
    renderAttacks();
  }
  // the table of the best 20 victories found and the preview of the first
  function renderAttacks() {
    shownRows = cands.slice(0, 20);
    $("sim-atk").querySelector(".sim-list").innerHTML = (shownRows.length
      ? noteHtml + '<table class="attacks-table sim-table"><thead><tr><th class="a-who">Joueur</th><th class="a-comp">Attaque</th><th class="a-def">D\u00e9fense</th></tr></thead><tbody>' + shownRows.map(function (r, i) {
        return '<tr data-i="' + i + '" tabindex="0"><td class="a-who"><b>' + esc(D.p[r[11]]) + "</b><small>" + esc(D.g[r[12]]) + " \u00b7 " + esc(D.w[r[8]]) + '</small></td><td class="a-comp">' + comp(r[4], r[5]) +
          '</td><td class="a-def">' + badge(r[9]) + comp(r[10], r[3]) + "</td></tr>";
      }).join("") + "</tbody></table>"
      : '<p class="mnone">Aucune victoire contre cette d\u00e9fense.</p>');
    $("sim-atk").querySelector(".sim-preview").innerHTML = "";
    if (shownRows.length) preview(0);
  }

  document.addEventListener("keydown", function (e) {
    const b = e.key === "Enter" && e.target.closest && e.target.closest(".sim-preview .pl-board[data-sb]");
    if (b) location.href = b.dataset.sb;
  });
  document.addEventListener("click", function (e) {
    const m = e.target.closest(".sim-map-chip"), d = e.target.closest(".sim-row[data-def]"), t = e.target.closest(".sim-table tbody tr");
    if (m) {
      map = +m.dataset.map; defKey = null;
      document.querySelectorAll(".sim-map-chip").forEach(function (c) { c.setAttribute("aria-pressed", String(c === m)); });
      shown("sim-atk", false);
      defenses();
    } else if (d) {
      defKey = d.dataset.def;
      document.querySelectorAll(".sim-row[data-def]").forEach(function (c) { c.setAttribute("aria-pressed", String(c === d)); });
      attacks();
      $("sim-atk").scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (e.target.closest(".sim-preview .pl-board[data-sb]")) {
      location.href = e.target.closest(".pl-board").dataset.sb;
    } else if (t) {
      preview(+t.dataset.i);
    }
  });
})();
