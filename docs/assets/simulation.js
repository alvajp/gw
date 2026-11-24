// Simulation (opened from the Attaques page): 1. a map, 2. its level (Héros / Élite / Vétéran), 3. the defense to face -- the defenses met most often on that map at that level, over
// every captured war --, 4. the team to use: the teams of ours that already beat that defense (or, failing that, the closest defenses and the best teams on the map).
// All of it is computed here from the compact rows of #sim-data (scripts/generate_site.build_simulation_data): [map, level, defense units, defense MoW, our units, our MoW, outcome,
// score, war, line rarity, defense units in lineup order, attacker, attacker's guild].
(function () {
  const el = document.getElementById("sim-data");
  if (!el) return;
  const D = JSON.parse(el.textContent), rows = D.r;
  const $ = function (id) { return document.getElementById(id); };
  const esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  const RAR = { m: ["M", "mythic"], l: ["L", "legendary"], e: ["E", "epic"], r: ["R", "rare"] };
  let map = -1, level = -1, defKey = null;

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

  // ---- 2. levels of the chosen map ----
  function levels() {
    const c = {};
    rows.forEach(function (r) { if (r[0] === map) c[r[1]] = (c[r[1]] || 0) + 1; });
    $("sim-level").querySelector(".sim-levels").innerHTML = D.t.map(function (t, i) {
      return '<button type="button" class="lvl-chip sim-level-chip" data-level="' + i + '" aria-pressed="false"' + (c[i] ? "" : " disabled") + ">" + badge(t[2]) + esc(t[1]) + "<small>" + (c[i] ? pl(c[i], "combat", "combats") : "jamais vu") + "</small></button>";
    }).join("");
    shown("sim-level", true);
  }

  // ---- 3. the defenses met on that map at that level, grouped by archetype (a line holds the 3 core units of an archetype), the others below ----
  function defRow(x, i) {
    const arch = x.arch, units = x.r[2], all = units.concat(x.r[3] >= 0 ? [x.r[3]] : []);
    let body;
    if (arch) {  // the archetype's three units first, a separator, then every other character of the line (and its machine of war)
      const core = arch[1], rest = units.filter(function (u) { return core.indexOf(u) < 0; });
      body = core.filter(function (u) { return u !== x.r[3]; }).map(function (u) { return unit(u, false); }).join("") + (core.indexOf(x.r[3]) >= 0 ? unit(x.r[3], true) : "") +
        '<span class="sim-sep" aria-hidden="true"></span>' + rest.map(function (u) { return unit(u, false); }).join("") + (x.r[3] >= 0 && core.indexOf(x.r[3]) < 0 ? unit(x.r[3], true) : "");
    } else body = comp(units, x.r[3]);
    return '<button type="button" class="sim-row" data-def="' + esc(x.k) + '" aria-pressed="false"><span class="sim-rank">' + (i + 1) + '</span><span class="sim-comp">' + badge(topRar(x)) + body + "</span>" +
      '<span class="sim-stats"><b>' + pl(x.n, "fois", "fois") + "</b><small>" + pl(x.w + x.f, "victoire", "victoires") + " \u00b7 " + pl(x.x, "\u00e9chec", "\u00e9checs") + "</small></span></button>";
  }
  function defenses() {
    const list = rows.filter(function (r) { return r[0] === map && r[1] === level; });
    const g = groups(list, dkey).sort(function (a, b) { return b.n - a.n || b.last - a.last; });
    g.forEach(function (x) {
      const have = x.r[2].concat(x.r[3] >= 0 ? [x.r[3]] : []);
      x.arch = D.a.filter(function (a) { return a[1].every(function (u) { return have.indexOf(u) >= 0; }); })[0] || null;
    });
    $("sim-def").querySelector(".sim-hint").textContent = "Les d\u00e9fenses rencontr\u00e9es sur " + D.m[map][1] + " (" + D.t[level][1] + "), toutes guerres confondues, regroup\u00e9es par arch\u00e9type : les trois persos de l'arch\u00e9type, puis les autres. Choisis celle \u00e0 affronter.";
    let html = "";
    D.a.forEach(function (a) {
      const mine = g.filter(function (x) { return x.arch === a; });
      if (!mine.length) return;
      html += '<h3 class="sim-group"><span class="sim-core">' + a[1].map(function (u) { return unit(u, false); }).join("") + "</span>" + esc(a[0]) + "<small>" + pl(mine.reduce(function (t, x) { return t + x.n; }, 0), "fois", "fois") + " \u00b7 " + pl(mine.length, "ligne", "lignes") + "</small></h3>" +
        mine.slice(0, 10).map(defRow).join("");
    });
    const others = g.filter(function (x) { return !x.arch; });
    if (others.length) html += (html ? '<h3 class="sim-group">Autres d\u00e9fenses</h3>' : "") + others.slice(0, 12).map(defRow).join("");
    $("sim-def").querySelector(".sim-list").innerHTML = html || '<p class="mnone">Aucune d\u00e9fense vue.</p>';
    shown("sim-def", true);
    shown("sim-atk", false);
  }

  // ---- 4. what to play against it: the attacks that worked (ours and the Attaques page's guilds'), best score first, and a preview of the map for the one picked ----
  let shownRows = [], slotsPromise = null;
  const slotsOf = function () {
    return slotsPromise || (slotsPromise = fetch("assets/slots.json").then(function (r) { return r.json(); }).catch(function () { return {}; }));
  };
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
      box.innerHTML = '<div class="sim-pv-head"><b>' + esc(D.p[r[11]]) + "</b><small>" + esc(D.g[r[12]]) + " \u00b7 " + esc(D.w[r[8]]) + '</small><span class="sim-score ' + (r[6] === "w" ? "is-win" : "is-finish") + '">' + r[7] + "</span></div>" +
        '<div class="pl-board"><img class="pl-map" src="' + esc(img) + '" alt="" draggable="false">' + (slot ? place(r[10], "e", "pl-def") + place(r[4], "o", "pl-att") : "") + "</div>" +
        '<div class="sim-pv-legend"><span><i class="pl-key pl-key-att"></i>Attaque</span><span><i class="pl-key pl-key-def"></i>D\u00e9fense</span></div>';
    });
  }
  function attacks() {
    const here = rows.filter(function (r) { return r[0] === map && r[1] === level && (r[6] === "w" || r[6] === "f"); });
    const mine = rows.filter(function (r) { return dkey(r) === defKey; })[0][2];
    const exact = here.filter(function (r) { return dkey(r) === defKey; });
    const near = exact.length ? [] : here.filter(function (r) { return r[2].filter(function (u) { return mine.indexOf(u) >= 0; }).length >= 4; });
    const best = function (a, b) { return b[7] - a[7] || b[8] - a[8]; };
    shownRows = (exact.length ? exact : near).slice().sort(best).slice(0, 20);
    $("sim-atk").querySelector(".sim-hint").textContent = exact.length
      ? pl(exact.length, "attaque r\u00e9ussie", "attaques r\u00e9ussies") + " contre cette d\u00e9fense, la meilleure d'abord. Clique une ligne pour la voir sur la map."
      : near.length ? "Cette d\u00e9fense n'a jamais \u00e9t\u00e9 battue telle quelle : voici les attaques r\u00e9ussies contre des d\u00e9fenses proches (au moins 4 unit\u00e9s en commun)." : "";
    $("sim-atk").querySelector(".sim-list").innerHTML = shownRows.length
      ? '<table class="attacks-table sim-table"><thead><tr><th class="a-who">Joueur</th><th class="a-comp">Attaque</th><th class="a-score">Score</th></tr></thead><tbody>' + shownRows.map(function (r, i) {
        return '<tr data-i="' + i + '" tabindex="0"><td class="a-who"><b>' + esc(D.p[r[11]]) + "</b><small>" + esc(D.g[r[12]]) + " \u00b7 " + esc(D.w[r[8]]) + '</small></td><td class="a-comp">' + comp(r[4], r[5]) +
          '</td><td class="a-score ' + (r[6] === "w" ? "is-win" : "is-finish") + '">' + r[7] + "</td></tr>";
      }).join("") + "</tbody></table>"
      : '<p class="mnone">Aucune attaque r\u00e9ussie contre cette d\u00e9fense.</p>';
    $("sim-atk").querySelector(".sim-preview").innerHTML = "";
    shown("sim-atk", true);
    if (shownRows.length) preview(0);
  }

  document.addEventListener("click", function (e) {
    const m = e.target.closest(".sim-map-chip"), l = e.target.closest(".sim-level-chip"), d = e.target.closest(".sim-row[data-def]"), t = e.target.closest(".sim-table tbody tr");
    if (m) {
      map = +m.dataset.map; level = -1; defKey = null;
      document.querySelectorAll(".sim-map-chip").forEach(function (c) { c.setAttribute("aria-pressed", String(c === m)); });
      levels(); shown("sim-def", false); shown("sim-atk", false);
      const first = D.t.map(function (t, i) { return i; }).filter(function (i) { return rows.some(function (r) { return r[0] === map && r[1] === i; }); });
      if (first.length === 1) $("sim-level").querySelector('[data-level="' + first[0] + '"]').click();  // one level only: nothing to choose
    } else if (l && !l.disabled) {
      level = +l.dataset.level; defKey = null;
      document.querySelectorAll(".sim-level-chip").forEach(function (c) { c.setAttribute("aria-pressed", String(c === l)); });
      defenses();
    } else if (d) {
      defKey = d.dataset.def;
      document.querySelectorAll(".sim-row[data-def]").forEach(function (c) { c.setAttribute("aria-pressed", String(c === d)); });
      attacks();
      $("sim-atk").scrollIntoView({ behavior: "smooth", block: "start" });
    } else if (t) {
      preview(+t.dataset.i);
    }
  });
})();
