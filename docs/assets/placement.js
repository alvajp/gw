// Click an attack (row of a war-strategy attack table, or of an attack list in the
// defense modal): a second modal shows the map with both lineups on their starting
// hexes. The numbered hexes (1-5) of the map art are the defenders' slots, the white
// ones the attacker's. Rows carry data-pl-img (map image), data-pl-att / data-pl-def
// (space-separated unit ids, in lineup order). Hex centres per map: slots.json.
(function () {
  const SRC = document.currentScript ? document.currentScript.src : "";
  let slotsPromise = null;
  let dialog = null;

  function loadSlots() {
    if (!slotsPromise) {
      slotsPromise = fetch(SRC.replace(/placement\.js.*$/, "slots.json")).then(function (r) { return r.json(); }).catch(function () { return {}; });
    }
    return slotsPromise;
  }

  function units() {
    const el = document.getElementById("defense-data");
    try { return el ? JSON.parse(el.textContent).units : {}; } catch (e) { return {}; }
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function getDialog() {
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "placement-modal";
    dialog.setAttribute("aria-label", "Placement des personnages");
    dialog.innerHTML = '<button type="button" class="pl-close" aria-label="Fermer">×</button><div class="pl-board"></div>';
    document.body.appendChild(dialog);
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog || e.target.closest(".pl-close")) dialog.close(); // backdrop or ×
    });
    return dialog;
  }

  function open(row) {
    const img = row.dataset.plImg;
    const id = (img.match(/([^\/]+)\.webp/) || [])[1];
    loadSlots().then(function (slots) {
      const slot = slots[id];
      if (!slot) return;
      const info = units();
      const size = slots.size || 480;
      function place(ids, spots, cls) {
        return ids.split(" ").filter(Boolean).map(function (u, i) {
          const at = spots[i], unit = info[u];
          if (!at || !unit) return "";
          return '<img class="pl-unit ' + cls + '" style="left:' + (at[0] / size * 100).toFixed(2) + "%;top:" + (at[1] / size * 100).toFixed(2) +
            '%" src="' + esc(unit[1]) + '" alt="' + esc(unit[0]) + '" title="' + esc(unit[0]) + '">';
        }).join("");
      }
      const d = getDialog();
      d.querySelector(".pl-board").innerHTML = '<img class="pl-map" src="' + esc(img) + '" alt="">' +
        place(row.dataset.plDef || "", slot.e, "pl-def") + place(row.dataset.plAtt || "", slot.o, "pl-att");
      if (d.showModal) d.showModal(); else d.setAttribute("open", "");
    });
  }

  document.addEventListener("click", function (e) {
    const row = e.target.closest("[data-pl-img]");
    if (row && !e.target.closest("a, button")) open(row);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    const row = e.target.closest && e.target.closest("[data-pl-img]");
    if (row) open(row);
  });
})();
