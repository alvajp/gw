// Raid tables (raid.html, raid/<season>.html, records/<boss>.html): a click on a relative-damage cell opens a dialog with that player's attacks of the season
// (on one boss when the cell is a boss cell): level (L4, L5, M1-M3), team, damage, type (Attaque / Finish / OS) and the damage relative to the guild's
// average hit that season. The attacks come from data/raid-<season>.json (written by generate_site.write_raid_data), fetched once per season.
(function () {
  const cache = {};
  function load(url) { return cache[url] || (cache[url] = fetch(url).then(function (r) { return r.json(); })); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function rel(r) { return r === null ? "—" : (r >= 0 ? "+" : "-") + Math.abs(r * 100).toFixed(1).replace(".", ",") + " %"; }
  function open(td) {
    const parts = td.dataset.atk.split("|"), uid = parts[0], season = parts[1], key = parts[2];
    const table = td.closest("[data-atk-base]");
    if (!table) return;
    const base = table.dataset.atkBase, assets = base.slice(0, -5) + "assets/";
    const pill = td.closest("tr").querySelector(".player-btn");
    const who = pill ? pill.textContent.trim() : "";
    Promise.all([load(base + "raid-meta.json"), load(base + "raid-" + season + ".json")]).then(function (res) {
      const meta = res[0], rows = res[1].a.filter(function (a) { return a[0] === uid && (!key || a[1] === key); }).sort(function (x, y) { return x[9] - y[9]; });
      const unit = function (id, cls) {
        const n = esc(meta.units[id] || id);
        return '<img class="atk-u' + (cls || "") + '" src="' + assets + "units/" + id + '.webp" alt="" title="' + n + '" loading="lazy" onerror="this.style.visibility=\'hidden\'">';
      };
      const boss = key ? meta.bosses[key] : null;
      let body = "";
      rows.forEach(function (a) {
        const b = meta.bosses[a[1]] || { n: a[1], a: "" };
        const team = a[7].map(function (h) { return unit(h); }).join("") + (a[8] ? unit(a[8], " atk-mow") : "");
        const kind = a[5], cls = kind === "OS" ? " atk-os" : kind === "Finish" ? " atk-fin" : "";
        const r = a[6];
        body += "<tr>" + (key ? "" : '<td><div class="atk-boss"><img src="' + assets + b.a + '" alt=""><span>' + esc(b.n) + "</span></div></td>") +
          '<td title="Boucle ' + a[3] + '">' + esc(a[2]) + '</td><td class="atk-c"><div class="atk-team">' + team + "</div></td><td class=\"atk-n\">" + a[4].toLocaleString("fr-FR") + '</td><td><span class="atk-kind' + cls + '">' + kind +
          '</span></td><td class="atk-n atk-rel' + (r === null ? "" : r >= 0 ? " pos" : " neg") + '">' + rel(r) + "</td></tr>";
      });
      const head = (key ? "" : "<th>Boss</th>") + '<th>Niv.</th><th class="atk-c">Compo</th><th class="atk-n">Dégâts</th><th>Type</th><th class="atk-n">Relatif</th>';
      const dlg = document.createElement("dialog");
      dlg.className = "meta-modal atk-modal";
      dlg.innerHTML = '<button type="button" class="mm-close" aria-label="Fermer">×</button><h3><span class="mm-title">' + esc(who) +
        '<small class="mm-who">Saison ' + esc(season) + (boss ? " · " + esc(boss.n) : "") + "</small></span></h3>" +
        '<div class="mm-scroll">' + (rows.length ? '<table class="atk-table"><thead><tr>' + head + "</tr></thead><tbody>" + body + "</tbody></table>" : '<p class="mnone">Aucune attaque.</p>') + "</div>";
      dlg.addEventListener("close", function () { dlg.remove(); });
      document.body.appendChild(dlg);
      dlg.showModal();
    });
  }
  // capture phase: the row / column links of row-link.js must not run for these cells (drag-scroll.js, loaded before, swallows the click that ends a drag)
  document.addEventListener("click", function (e) {
    const td = e.target.closest && e.target.closest("td[data-atk]");
    if (!td) return;
    e.preventDefault();
    e.stopPropagation();
    open(td);
  }, true);
})();
