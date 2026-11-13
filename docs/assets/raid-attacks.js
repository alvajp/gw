// Raid pages. (1) Raid tables (raid.html, raid/<season>.html, records/<boss>.html, the best attacks of the Metas pages): a click on a relative-damage cell opens
// a dialog, styled like the war attack dialogs, with that player's attacks of the season (on one boss when the cell is a boss cell): level (L4, L5, M1-M3),
// map, team, damage, type (Attaque / Finish / OS) and the damage relative to the guild's average hit that season. The attacks come from data/raid-<season>.json
// (written by generate_site.write_raid_data), fetched once per season. (2) Metas pages: the map thumbnails above the best attacks table filter its rows.
(function () {
  const cache = {};
  function load(url) { return cache[url] || (cache[url] = fetch(url).then(function (r) { return r.json(); })); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function rel(r) { return r === null ? "—" : (r >= 0 ? "+" : "-") + Math.abs(r * 100).toFixed(1).replace(".", ",") + " %"; }
  function mapLabel(id) { return id.replace(/^GB_/i, "").replace(/_/g, " "); }  // "GB_Magnus_support_06" -> "Magnus support 06"

  function open(td) {
    const parts = td.dataset.atk.split("|"), uid = parts[0], season = parts[1], key = parts[2];
    const table = td.closest("[data-atk-base]");
    if (!table) return;
    const base = table.dataset.atkBase, assets = base.slice(0, -5) + "assets/";
    const pill = td.closest("tr").querySelector(".player-btn");
    const who = pill ? pill.textContent.trim() : "";
    Promise.all([load(base + "raid-meta.json"), load(base + "raid-" + season + ".json")]).then(function (res) {
      const meta = res[0], rows = res[1].a.filter(function (a) { return a[0] === uid && (!key || a[1] === key); }).sort(function (x, y) { return x[9] - y[9]; });
      const thumb = function (id, cls) { return id ? '<img class="' + cls + '" src="' + assets + "raid-maps/" + id.toLowerCase() + '.webp" alt="" title="' + esc(mapLabel(id)) + '">' : "—"; };
      const unit = function (id, cls) {
        return '<img class="atk-u' + (cls || "") + '" src="' + assets + "units/" + id + '.webp" alt="" title="' + esc(meta.units[id] || id) + '" loading="lazy" onerror="this.style.visibility=\'hidden\'">';
      };
      const boss = key ? meta.bosses[key] : null;
      let body = "";
      rows.forEach(function (a) {
        const b = meta.bosses[a[1]] || { n: a[1], a: "" };
        const team = a[7].map(function (h) { return unit(h); }).join("") + (a[8] ? unit(a[8], " atk-mow") : "");
        const kind = a[5], r = a[6];
        body += "<tr>" + (key ? "" : '<td><div class="atk-boss"><img src="' + assets + b.a + '" alt=""><span>' + esc(b.n) + "</span></div></td>") +
          '<td title="Boucle ' + a[3] + '">' + esc(a[2]) + "</td>" + (key ? "" : "<td>" + thumb(a[10], "atk-map") + "</td>") +
          '<td class="atk-c"><div class="atk-team">' + team + '</div></td><td class="atk-n">' + a[4].toLocaleString("fr-FR") + '</td><td><span class="atk-kind' +
          (kind === "OS" ? " atk-os" : kind === "Finish" ? " atk-fin" : "") + '">' + kind + '</span></td><td class="atk-n atk-rel' + (r === null ? "" : r >= 0 ? " pos" : " neg") + '">' + rel(r) + "</td></tr>";
      });
      const head = (key ? "" : "<th>Boss</th>") + "<th>Niv.</th>" + (key ? "" : "<th>Map</th>") + '<th class="atk-c">Compo</th><th class="atk-n">Dégâts</th><th>Type</th><th class="atk-n">Relatif</th>';
      // "Voir la saison" (raid.html, the table of all the seasons) / "Voir la méta" (a season page, a boss cell: the Metas page of that boss): a button to that page, like "Voir le roster" in the meta dialogs
      const arrow = '<svg class="arrow" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
      const seeLink = !key && base === "data/" ? ["raid/" + season + ".html", "Voir la saison"] : key && document.getElementById("score-data") ? ["../metas/" + key + ".html", "Voir la méta"] : null;
      const seeSeason = seeLink ? '<a class="mm-roster-btn dm-see" href="' + esc(seeLink[0]) + '">' + seeLink[1] + arrow + "</a>" : "";
      const board = key && rows.length ? rows[0][10] : null;
      const zone = '<span class="dm-def-zone">' + (board ? thumb(board, "map-thumb") : "") + '<span class="zone-text"><b>' + (boss ? esc(boss.n) : esc(who) + ' <span class="dm-sep">·</span> Saison ' + esc(season)) + "</b>" +
        (boss ? "<small>Saison " + esc(season) + (rows.length ? " · " + esc(rows[0][2]) : "") + (board ? " · " + esc(mapLabel(board)) : "") + "</small>" : "") + "</span></span>";
      const dlg = document.createElement("dialog");
      dlg.className = "defense-modal atk-modal";
      dlg.innerHTML = '<div class="dm-head"><div class="dm-title"><div class="dm-def">' + (boss ? '<span class="dm-def-player">' + esc(who) + "</span>" : "") + zone + '</div></div>' + seeSeason + '<button type="button" class="dm-close" aria-label="Fermer">×</button></div><div class="dm-body">' +
        (rows.length ? '<table class="atk-table"><thead><tr>' + head + "</tr></thead><tbody>" + body + "</tbody></table>" : '<p class="mnone">Aucune attaque.</p>') + "</div>";
      dlg.addEventListener("click", function (e) { if (e.target === dlg || e.target.closest(".dm-close")) dlg.close(); });  // the backdrop is the dialog itself
      dlg.addEventListener("close", function () { dlg.remove(); });
      document.body.appendChild(dlg);
      dlg.showModal();
    });
  }
  // Season pages: a click on a Score or Jetons perdus cell opens the breakdown of that player's score (data embedded in the page, #score-data): the mean relative damage per boss
  // with each boss's share, then the cut for the tokens not played.
  function openScore(td) {
    const holder = document.getElementById("score-data"), table = td.closest("[data-atk-base]");
    if (!holder || !table) return;
    const data = JSON.parse(holder.textContent), p = data.p[td.dataset.score];
    if (!p) return;
    const base = table.dataset.atkBase, assets = base.slice(0, -5) + "assets/";
    const pill = td.closest("tr").querySelector(".player-btn");
    const who = pill ? pill.textContent.trim() : "";
    const pts = function (r) { return (r >= 0 ? "+" : "-") + Math.abs(r * 100).toFixed(1).replace(".", ",") + " pt"; };
    const cls = function (r) { return r >= 0 ? " pos" : " neg"; };
    load(base + "raid-meta.json").then(function (meta) {
      let rows = "";
      p.b.forEach(function (b) {
        const boss = meta.bosses[b[0]] || { n: b[0], a: "" }, share = b[1] * b[2] / p.n;
        rows += '<tr><td><div class="atk-boss"><img src="' + assets + boss.a + '" alt=""><span>' + esc(boss.n) + '</span></div></td><td class="atk-n">' + b[2] + '</td><td class="atk-n atk-rel' + cls(b[1]) + '">' + rel(b[1]) +
          '</td><td class="atk-n atk-rel' + cls(share) + '">' + pts(share) + "</td></tr>";
      });
      const lostFocus = td.dataset.sc === "lost", factor = Math.min(1, p.t / data.per);
      // The foot rows have one cell per column, like the body rows (no colspan): a cell that spans the table cannot stay pinned when the table scrolls sideways, its label slid away.
      const cut = p.l === null
        ? '<tr class="sc-foot' + (lostFocus ? " sc-focus" : "") + '"><td>Jetons perdus</td><td class="atk-n"></td><td class="atk-n"></td><td class="atk-n">—</td></tr>'
        : '<tr class="sc-foot' + (lostFocus ? " sc-focus" : "") + '"><td>Jetons joués : ' + p.t + " sur " + data.per + " (" + p.l + ' perdu' + (p.l > 1 ? "s" : "") + ')</td><td class="atk-n"></td><td class="atk-n">× ' +
          (factor * 100).toFixed(1).replace(".", ",") + ' %</td><td class="atk-n atk-rel' + cls(p.s - p.r) + '">' + pts(p.s - p.r) + "</td></tr>";
      const sum = '<tr class="sc-foot"><td>Moyenne des dégâts relatifs</td><td class="atk-n">' + p.n + '</td><td class="atk-n"></td><td class="atk-n atk-rel' + cls(p.r) + '">' + rel(p.r) + "</td></tr>";
      const total = '<tr class="sc-total' + (lostFocus ? "" : " sc-focus") + '"><td>Score de la saison</td><td class="atk-n"></td><td class="atk-n"></td><td class="atk-n atk-rel' + cls(p.s) + '">' + rel(p.s) + "</td></tr>";
      const dlg = document.createElement("dialog");
      dlg.className = "defense-modal atk-modal sc-modal";
      dlg.innerHTML = '<div class="dm-head"><div class="dm-title"><div class="dm-def"><span class="dm-def-player">' + esc(who) + '</span><span class="dm-def-zone"><span class="zone-text"><b>Score · saison ' + data.season +
        "</b><small>Rang " + p.k + " sur " + data.field + " · " + p.n + ' attaques</small></span></span></div></div><button type="button" class="dm-close" aria-label="Fermer">×</button></div><div class="dm-body">' +
        '<table class="atk-table sc-table"><thead><tr><th>Boss</th><th class="atk-n">Attaques</th><th class="atk-n">Relatif moyen</th><th class="atk-n">Part du score</th></tr></thead><tbody>' + rows + "</tbody><tfoot>" + sum + cut + total + "</tfoot></table></div>";
      dlg.addEventListener("click", function (e) { if (e.target === dlg || e.target.closest(".dm-close")) dlg.close(); });
      dlg.addEventListener("close", function () { dlg.remove(); });
      document.body.appendChild(dlg);
      dlg.showModal();
    });
  }
  // raid.html: a click on a Saisons, Score or Jetons perdus cell opens the recap of the player's seasons (data embedded in the page, #recap-data): rank, attacks, tokens played / lost
  // and score of each season, then the mean score and the tokens lost in all.
  function openRecap(td) {
    const holder = document.getElementById("recap-data");
    const data = JSON.parse(holder.textContent), p = data.p[td.dataset.score];
    if (!p) return;
    const pill = td.closest("tr").querySelector(".player-btn");
    const who = pill ? pill.textContent.trim() : "";
    const cls = function (r) { return r >= 0 ? " pos" : " neg"; };
    let rows = "", lost = 0;
    p.s.forEach(function (x) {
      lost += x[6] || 0;
      rows += '<tr><td><a href="raid/' + x[0] + '.html">S' + x[0] + '</a></td><td class="atk-n">' + x[2] + " / " + x[3] + '</td><td class="atk-n">' + x[4] + '</td><td class="atk-n">' + x[5] + '</td><td class="atk-n">' +
        (x[6] === null ? "—" : x[6]) + '</td><td class="atk-n atk-rel' + cls(x[1]) + '">' + rel(x[1]) + "</td></tr>";
    });
    const foot = '<tr class="sc-foot' + (td.cellIndex === 4 ? " sc-focus" : "") + '"><td>Jetons perdus</td><td class="atk-n"></td><td class="atk-n"></td><td class="atk-n"></td><td class="atk-n">' + lost + '</td><td class="atk-n"></td></tr>' +
      '<tr class="sc-total' + (td.cellIndex === 3 ? " sc-focus" : "") + '"><td>Score moyen</td><td class="atk-n"></td><td class="atk-n"></td><td class="atk-n"></td><td class="atk-n"></td><td class="atk-n atk-rel' + cls(p.a) + '">' + rel(p.a) + "</td></tr>";
    const dlg = document.createElement("dialog");
    dlg.className = "defense-modal atk-modal sc-modal";
    dlg.innerHTML = '<div class="dm-head"><div class="dm-title"><div class="dm-def"><span class="dm-def-player">' + esc(who) + '</span><span class="dm-def-zone"><span class="zone-text"><b>Récap des saisons</b><small>Rang ' + p.k +
      " sur " + data.field + " · " + p.s.length + ' saisons</small></span></span></div></div><button type="button" class="dm-close" aria-label="Fermer">×</button></div><div class="dm-body">' +
      '<table class="atk-table sc-table"><thead><tr><th>Saison</th><th class="atk-n">Rang</th><th class="atk-n">Attaques</th><th class="atk-n">Jetons joués</th><th class="atk-n">Jetons perdus</th><th class="atk-n">Score</th></tr></thead><tbody>' +
      rows + "</tbody><tfoot>" + foot + "</tfoot></table></div>";
    dlg.addEventListener("click", function (e) { if (e.target === dlg || e.target.closest(".dm-close")) dlg.close(); });
    dlg.addEventListener("close", function () { dlg.remove(); });
    document.body.appendChild(dlg);
    dlg.showModal();
  }
  // capture phase: the row / column links of row-link.js must not run for these cells (drag-scroll.js, loaded before, swallows the click that ends a drag)
  document.addEventListener("click", function (e) {
    const chip = e.target.closest && e.target.closest(".map-chip");
    if (chip) return filter(chip);
    const sc = e.target.closest && e.target.closest("td[data-score]");
    if (sc) { e.preventDefault(); e.stopPropagation(); return document.getElementById("recap-data") ? openRecap(sc) : openScore(sc); }
    const td = e.target.closest && e.target.closest("td[data-atk]");
    if (!td) return;
    e.preventDefault();
    e.stopPropagation();
    open(td);
  }, true);

  // Metas pages: no map chosen = the overall best attacks (rows marked in the HTML), a map = that map's own best ones
  function filter(chip) {
    const bar = chip.closest(".map-filter"), table = document.querySelector(".atk-top");
    if (!bar || !table) return;
    bar.querySelectorAll(".map-chip").forEach(function (c) { c.setAttribute("aria-pressed", c === chip ? "true" : "false"); });
    const board = chip.dataset.map;
    table.querySelectorAll("tbody tr").forEach(function (tr) {
      tr.hidden = board ? tr.dataset.map !== board : tr.dataset.top === undefined;
    });
  }
})();
