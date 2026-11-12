// War page, "Détail" tables (when the war has attack data): a click on any cell but # and Joueur opens the shared attack dialog with that player's attacks, in the
// format of the Stratégie page's attack tables (Attaque / Contre / Score / Map; a row opens the placement view, see placement.js). The attacks are the page's
// #attacks-data blob (see build_attacks), names and portraits the shared #defense-data one.
(function () {
  const OUTCOME = { w: ["Victoire", "is-win"], f: ["Finish", "is-finish"], x: ["Échec", "is-fail"], u: ["?", ""] };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function read(id) { const el = document.getElementById(id); try { return el ? JSON.parse(el.textContent) : null; } catch (e) { return null; } }

  function open(uid) {
    const d = read("attacks-data"), info = read("defense-data"), modal = document.getElementById("defense-modal");
    if (!d || !info || !modal) return false;
    const pi = d.p.indexOf(uid);
    const rows = pi < 0 ? [] : [].concat.apply([], d.t).filter(function (r) { return r[0] === pi; });
    const portrait = function (i, mow) {
      if (i < 0) return "";
      const id = d.u[i], u = info.units[id], cls = "unit" + (mow ? " mow" : "");
      return u ? '<img class="' + cls + '" src="' + u[1] + '" alt="' + esc(u[0]) + '" title="' + esc(u[0]) + '" loading="lazy">' : '<span class="' + cls + ' unit-missing" title="' + esc(id) + '">?</span>';
    };
    const comp = function (units, mow) { return units.map(function (i) { return portrait(i, false); }).join("") + portrait(mow, true); };
    const body = rows.map(function (r) {
      const o = OUTCOME[r[1]] || OUTCOME.u, map = r[8] >= 0 ? d.m[r[8]] : null;
      const mapHtml = (map ? '<img class="map-thumb" src="' + map[1] + '" alt="" loading="lazy">' : "") + '<span class="zone-text"><b>' + esc(d.z[r[7]]) + "</b>" + (map ? "<small>" + esc(map[0]) + "</small>" : "") + "</span>";
      const pl = map ? ' tabindex="0" data-pl-img="' + esc(map[1]) + '" data-pl-att="' + r[3].map(function (i) { return d.u[i]; }).join(" ") + '" data-pl-def="' + r[5].map(function (i) { return d.u[i]; }).join(" ") + '"' : "";
      return "<tr" + pl + '><td class="a-comp">' + comp(r[3], r[4]) + '</td><td class="a-def">' + comp(r[5], r[6]) + '</td><td class="a-score ' + o[1] + '" title="' + o[0] + '">' + r[2] + '</td><td class="a-map">' + mapHtml + "</td></tr>";
    }).join("");
    const n = rows.length;
    modal.querySelector(".dm-title").innerHTML = '<div class="dm-def"><span class="dm-def-player">' + esc(info.players[uid] || uid) + "</span></div>";
    modal.querySelector(".dm-body").innerHTML = n ? '<div class="attacks-scroll"><table class="attacks-table"><thead><tr><th class="a-comp">Attaque</th><th class="a-def">Contre</th><th class="a-score">Score</th><th class="a-map">Map</th></tr></thead><tbody>' + body + "</tbody></table></div>" : '<p class="mnone">Aucune attaque enregistrée.</p>';
    if (modal.showModal) modal.showModal(); else modal.setAttribute("open", "");
    return true;
  }
  // capture phase: the row links of row-link.js must not run for these cells (drag-scroll.js, loaded before, swallows the click that ends a drag)
  document.addEventListener("click", function (e) {
    const td = e.target.closest && e.target.closest("td[data-war-atk]");
    if (!td || !td.parentElement.dataset.uid) return;
    if (open(td.parentElement.dataset.uid)) { e.preventDefault(); e.stopPropagation(); }
  }, true);
})();
