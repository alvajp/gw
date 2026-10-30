// War-page attack tables (see build_attacks in generate_site.py): one table per
// guild, built from the compact #attacks-data JSON (rows index into its own
// unit/player/zone/map lists). The player pills pick WHICH single player's
// attacks the table shows (the first pill is preselected). Names + portraits come from the page's shared #defense-data blob.
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
    function comp(units, mow) {
      return units.map(function (i) { return portrait(i, false); }).join("") + portrait(mow, true);
    }

    document.querySelectorAll(".attacks-block").forEach(function (block) {
      const rows = d.t[parseInt(block.dataset.team, 10)] || [];
      const tbody = block.querySelector("tbody");

      // Exactly one player is shown at a time; rows are built only for that player.
      function show(p) {
        tbody.innerHTML = rows.filter(function (r) { return String(r[0]) === p; }).map(function (r) {
          const o = OUTCOME[r[1]] || OUTCOME.u;
          const map = r[8] >= 0 ? d.m[r[8]] : null;
          const mapHtml = (map ? '<img class="map-thumb" src="' + map[1] + '" alt="" loading="lazy">' : "") +
            '<span class="zone-text"><b>' + esc(d.z[r[7]]) + '</b>' + (map ? "<small>" + esc(map[0]) + "</small>" : "") + "</span>";
          return "<tr>" +
            '<td class="a-comp">' + comp(r[3], r[4]) + "</td>" +
            '<td class="a-def">' + comp(r[5], r[6]) + "</td>" +
            '<td class="a-score ' + o[1] + '" title="' + o[0] + '">' + r[2] + "</td>" +
            '<td class="a-map">' + mapHtml + "</td></tr>";
        }).join("");
      }

      const first = block.querySelector(".attacks-chips .chip.active") || block.querySelector(".attacks-chips .chip");
      if (first) show(first.dataset.p);

      block.querySelector(".attacks-chips").addEventListener("click", function (e) {
        const chip = e.target.closest(".chip[data-p]");
        if (!chip || chip.classList.contains("active")) return;
        block.querySelectorAll(".attacks-chips .chip.active").forEach(function (c) { c.classList.remove("active"); });
        chip.classList.add("active");
        show(chip.dataset.p);
      });
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
