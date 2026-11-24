// Simulation (opened from the Attaques page): 1. a map, 2. its level (Héros / Élite / Vétéran), 3. the defense to face -- the defenses met most often on that map at that level, over
// every captured war --, 4. the team to use: the teams of ours that already beat that defense (or, failing that, the closest defenses and the best teams on the map).
// All of it is computed here from the compact rows of #sim-data (scripts/generate_site.build_simulation_data): [map, level, defense units, defense MoW, our units, our MoW, outcome,
// score, war, line rarity].
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
    return '<button type="button" class="map-chip sim-map-chip" data-map="' + x[0] + '" aria-pressed="false"><img class="map-chip-img" src="' + esc(x[1][2]) + '" alt="" loading="lazy"><span>' + esc(x[1][1]) + "</span><small>" + pl(count[x[0]], "combat", "combats") + "</small></button>";
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

  // ---- 3. the defenses met on that map at that level ----
  function defenses() {
    const list = rows.filter(function (r) { return r[0] === map && r[1] === level; });
    const g = groups(list, dkey).sort(function (a, b) { return b.n - a.n || b.last - a.last; });
    $("sim-def").querySelector(".sim-hint").textContent = "Les défenses rencontrées le plus souvent sur " + D.m[map][1] + " (" + D.t[level][1] + "), toutes guerres confondues. Choisis celle à affronter.";
    $("sim-def").querySelector(".sim-list").innerHTML = g.slice(0, 12).map(function (x, i) {
      return '<button type="button" class="sim-row" data-def="' + esc(x.k) + '" aria-pressed="false"><span class="sim-rank">' + (i + 1) + '</span><span class="sim-comp">' + badge(topRar(x)) + comp(x.r[2], x.r[3]) + "</span>" +
        '<span class="sim-stats"><b>' + pl(x.n, "fois", "fois") + "</b><small>" + pl(x.w + x.f, "victoire", "victoires") + " · " + pl(x.x, "échec", "échecs") + "</small></span></button>";
    }).join("") || '<p class="mnone">Aucune défense vue.</p>';
    shown("sim-def", true);
    shown("sim-atk", false);
  }

  // ---- 4. what to play against it ----
  function attacks() {
    const here = rows.filter(function (r) { return r[0] === map && r[1] === level; });
    const exact = here.filter(function (r) { return dkey(r) === defKey; });
    const mine = exact[0][2];
    const near = here.filter(function (r) {
      if (dkey(r) === defKey) return false;
      const common = r[2].filter(function (u) { return mine.indexOf(u) >= 0; }).length;
      return common >= 4;
    });
    const rank = function (a, b) { return rate(b) - rate(a) || b.score / b.n - a.score / a.n || b.n - a.n; };
    const best = groups(exact, akey).sort(rank), alike = groups(near, akey).sort(rank);
    const card = function (x, i) {
      return '<div class="sim-row sim-result"><span class="sim-rank">' + (i + 1) + '</span><span class="sim-comp">' + comp(x.r[4], x.r[5]) + "</span>" +
        '<span class="sim-stats"><b>' + Math.round(100 * (x.w + x.f) / x.n) + " % de réussite</b><small>" + pl(x.n, "combat", "combats") + " · " + pl(x.w + x.f, "victoire", "victoires") + " · score moyen " + Math.round(x.score / x.n) + " · vu en " + esc(D.w[x.last]) + "</small></span></div>";
    };
    let html = "";
    if (best.length) html += '<h3 class="sim-sub">Ont déjà affronté cette défense</h3>' + best.slice(0, 5).map(card).join("");
    if (alike.length) html += '<h3 class="sim-sub">Contre des défenses proches (au moins 4 unités en commun)</h3>' + alike.slice(0, best.length ? 3 : 5).map(card).join("");
    $("sim-atk").querySelector(".sim-hint").textContent = best.length ? "Classées par taux de réussite, puis score moyen." : "Cette défense n'a pas encore été affrontée par une équipe : voici les plus proches.";
    $("sim-atk").querySelector(".sim-list").innerHTML = html || '<p class="mnone">Pas assez de données pour conseiller une équipe.</p>';
    shown("sim-atk", true);
  }

  document.addEventListener("click", function (e) {
    const m = e.target.closest(".sim-map-chip"), l = e.target.closest(".sim-level-chip"), d = e.target.closest(".sim-row[data-def]");
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
    }
  });
})();
