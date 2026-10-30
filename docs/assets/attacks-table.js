// War-page "Attaques" (see render_attacks_section in generate_site.py): builds
// one table per guild from the compact #attacks-data JSON (rows index into its
// own unit/player/zone/map lists) and wires the player pills as a single-select
// filter. Names + portraits come from the page's shared #defense-data blob.
(function () {
  const OUTCOME = { w: ["Victoire", "is-win"], f: ["Finish", "is-finish"], x: ["Échec", "is-fail"], u: ["?", ""] };

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function init() {
    const dataEl = document.getElementById("attacks-data");
    const shared = document.getElementById("defense-data");
    if (!dataEl || !shared || dataEl.dataset.ready) return;
    dataEl.dataset.ready = "1";
    const d = JSON.parse(dataEl.textContent);
    const info = JSON.parse(shared.textContent); // {units: {id: [name, src]}, players: {uid: name}}

    function portrait(i, mow) {
      if (i < 0) return "";
      const id = d.u[i];
      const u = info.units[id];
      const cls = "unit" + (mow ? " mow" : "");
      if (!u) return '<span class="' + cls + ' unit-missing" title="' + esc(id) + '">?</span>';
      return '<img class="' + cls + '" src="' + u[1] + '" alt="' + esc(u[0]) + '" title="' + esc(u[0]) + '" loading="lazy">';
    }
    function player(i) {
      const uid = d.p[i];
      return esc(info.players[uid] || uid);
    }
    function comp(units, mow) {
      return units.map(function (i) { return portrait(i, false); }).join("") + portrait(mow, true);
    }

    document.querySelectorAll(".attacks-block").forEach(function (block) {
      const rows = d.t[parseInt(block.dataset.team, 10)] || [];
      const tbody = block.querySelector("tbody");
      tbody.innerHTML = rows.map(function (r) {
        const o = OUTCOME[r[1]] || OUTCOME.u;
        const map = r[9] >= 0 ? d.m[r[9]] : null;
        const mapHtml = (map ? '<img class="map-thumb" src="' + map[1] + '" alt="" loading="lazy">' : "") +
          '<span class="zone-text"><b>' + esc(d.z[r[8]]) + '</b>' + (map ? "<small>" + esc(map[0]) + "</small>" : "") + "</span>";
        return '<tr data-p="' + r[0] + '">' +
          '<td class="a-player">' + player(r[0]) + "</td>" +
          '<td class="a-comp">' + comp(r[3], r[4]) + "</td>" +
          '<td class="a-def"><span class="a-def-name">' + player(r[5]) + "<small>L" + r[10] + "</small></span>" +
          '<span class="a-def-comp">' + comp(r[6], r[7]) + "</span></td>" +
          '<td class="a-res"><span class="dm-result ' + o[1] + '">' + o[0] + "</span></td>" +
          '<td class="a-score">' + r[2] + "</td>" +
          '<td class="a-map">' + mapHtml + "</td></tr>";
      }).join("");

      block.querySelector(".attacks-chips").addEventListener("click", function (e) {
        const chip = e.target.closest(".chip[data-p]");
        if (!chip) return;
        const wasActive = chip.classList.contains("active");
        block.querySelectorAll(".attacks-chips .chip.active").forEach(function (c) { c.classList.remove("active"); });
        if (!wasActive) chip.classList.add("active");
        const p = wasActive ? null : chip.dataset.p;
        tbody.querySelectorAll("tr").forEach(function (tr) { tr.hidden = p !== null && tr.dataset.p !== p; });
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
