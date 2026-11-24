// Click an attack (row of a war-strategy attack table, or of an attack list in the
// defense modal): a second modal shows the map with both lineups on their starting
// hexes. The numbered hexes (1-5) of the map art are the defenders' slots, the white
// ones the attacker's. Rows carry data-pl-img (map image), data-pl-att / data-pl-def
// (space-separated unit ids, in lineup order). Hex centres per map: slots.json.
// Portraits can be dragged anywhere on the map to simulate a placement or a move;
// nothing is saved ("Réinitialiser" or reopening the modal puts them back).
(function () {
  const SRC = document.currentScript ? document.currentScript.src : "";
  let slotsPromise = null;
  let dialog = null;
  let slots = {};  // slots of the map currently shown (see slots.json), in px of its `size`
  let size = 480;

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

  function pos(at) {
    return "left:" + (at[0] / size * 100).toFixed(2) + "%;top:" + (at[1] / size * 100).toFixed(2) + "%";
  }

  // Drag a portrait anywhere on the map (it keeps the spot where you drop it).
  function startDrag(e) {
    const unit = e.target.closest(".pl-unit");
    if (!unit || e.button > 0) return;
    e.preventDefault();
    const rect = unit.parentNode.getBoundingClientRect();
    const box = unit.getBoundingClientRect();
    // keep the grab point: the portrait doesn't jump to be centred under the pointer
    const dx = e.clientX - (box.left + box.width / 2), dy = e.clientY - (box.top + box.height / 2);
    unit.setPointerCapture(e.pointerId);
    unit.classList.add("dragging");

    function move(ev) {
      const x = (ev.clientX - dx - rect.left) / rect.width * size, y = (ev.clientY - dy - rect.top) / rect.height * size;
      unit.style.cssText = pos([Math.min(Math.max(x, 0), size), Math.min(Math.max(y, 0), size)]);
    }
    function drop() {
      unit.removeEventListener("pointermove", move);
      unit.removeEventListener("pointerup", drop);
      unit.removeEventListener("pointercancel", drop);
      unit.classList.remove("dragging");
    }
    unit.addEventListener("pointermove", move);
    unit.addEventListener("pointerup", drop);
    unit.addEventListener("pointercancel", drop);
  }

  function reset() {
    dialog.querySelectorAll(".pl-unit").forEach(function (u) {
      u.style.cssText = pos(slots[u.dataset.side][parseInt(u.dataset.slot, 10)]);
    });
  }

  function getDialog() {
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "placement-modal";
    dialog.setAttribute("aria-label", "Placement des personnages");
    dialog.innerHTML = '<button type="button" class="pl-close" aria-label="Fermer">×</button>' +
      '<button type="button" class="pl-reset">Réinitialiser</button><div class="pl-board"></div>';
    document.body.appendChild(dialog);
    dialog.addEventListener("pointerdown", startDrag);
    dialog.addEventListener("click", function (e) {
      if (e.target.closest(".pl-reset")) reset();
      else if (e.target === dialog || e.target.closest(".pl-close")) dialog.close(); // backdrop or ×
    });
    return dialog;
  }

  // a row (an attack of a war page, of a defender's dialog ...) opens the simulation board page (sim-board.js) with the map and the two lineups
  function open(row) {
    const img = row.dataset.plImg;
    const id = (img.match(/([^\/]+)\.webp/) || [])[1], base = img.slice(0, Math.max(0, img.indexOf("assets/")));
    if (!id) return;
    const p = new URLSearchParams();
    p.set("m", id);
    p.set("a", (row.dataset.plAtt || "").split(" ").filter(Boolean).join(","));
    p.set("d", (row.dataset.plDef || "").split(" ").filter(Boolean).join(","));
    location.href = base + "simulation-board.html#" + p.toString();
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
