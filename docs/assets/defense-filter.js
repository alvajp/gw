// War-page "Défense" (see render_defense_section in generate_site.py): each
// guild's table shows its first 5 rows; the centered chevron button under it
// expands/collapses the rest. Visibility is by row POSITION, re-applied after a
// column sort (sort-table.js reorders the rows), so the 5 visible ones are
// always the top 5 of the current order. Delegated on document, like the other
// chip scripts, so it needs no re-init after client-side navigation.
(function () {
  const LIMIT = 5;

  function apply(block) {
    const open = block.dataset.expanded === "1";
    block.querySelectorAll("tbody tr").forEach(function (tr, i) {
      tr.hidden = !open && i >= LIMIT;
    });
    const btn = block.querySelector(".defense-more");
    if (btn) {
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.setAttribute("aria-label", open ? "Réduire" : "Afficher les " + btn.dataset.extra + " autres");
    }
  }

  document.addEventListener("click", function (e) {
    const btn = e.target.closest(".defense-more");
    if (btn) {
      const block = btn.closest(".defense-block");
      if (!block) return;
      block.dataset.expanded = block.dataset.expanded === "1" ? "0" : "1";
      apply(block);
      return;
    }
    const th = e.target.closest(".defense-table th");
    if (th) {
      const block = th.closest(".defense-block");
      // sort-table.js's own click handler on the <th> runs first (it is bound
      // on the element, before this document-level one bubbles up).
      if (block) apply(block);
    }
  });

  // ---- Click a defense row: modal with every attack thrown at that defense ----
  const OUTCOME = { w: ["Victoire", "is-win"], f: ["Finish", "is-finish"], x: ["Échec", "is-fail"], u: ["?", ""] };
  let data = null;

  function getData() {
    if (!data) {
      const el = document.getElementById("defense-data");
      data = el ? JSON.parse(el.textContent) : { units: {}, players: {} };
    }
    return data;
  }

  function fmtTime(min) {
    return "+" + Math.floor(min / 60) + "h" + String(min % 60).padStart(2, "0");
  }

  function portrait(id, mow) {
    const u = getData().units[id];
    if (!u) return '<span class="unit unit-missing' + (mow ? " mow" : "") + '" title="' + id + '">?</span>';
    return '<img class="unit' + (mow ? " mow" : "") + '" src="' + u[1] + '" alt="' + u[0] + '" title="' + u[0] + '">';
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function openModal(tr) {
    const modal = document.getElementById("defense-modal");
    if (!modal) return;
    const attacks = JSON.parse(tr.dataset.attacks || "[]");
    const names = getData().players;
    const counts = { w: 0, f: 0, x: 0 };
    attacks.forEach(function (a) { if (counts[a[1]] !== undefined) counts[a[1]]++; });

    // Header: the defense itself, cloned from the row's own cells.
    const cells = tr.children;
    modal.querySelector(".dm-title").innerHTML =
      '<div class="dm-def"><span class="dm-def-player">' + cells[0].innerHTML + '</span>' +
      '<span class="dm-def-zone">' + cells[1].innerHTML + '</span>' +
      '<span class="dm-def-comp">' + cells[2].innerHTML + '</span></div>' +
      '<div class="dm-summary">' + attacks.length + " attaque" + (attacks.length > 1 ? "s" : "") +
      " · " + counts.w + " victoire" + (counts.w > 1 ? "s" : "") +
      " · " + counts.f + " finish" + (counts.f > 1 ? "es" : "") +
      " · " + counts.x + " échec" + (counts.x > 1 ? "s" : "") + "</div>";

    modal.querySelector(".dm-body").innerHTML = attacks.map(function (a) {
      const o = OUTCOME[a[1]] || OUTCOME.u;
      const comp = a[3].map(function (u) { return portrait(u, false); }).join("") + (a[4] ? portrait(a[4], true) : "");
      return '<div class="dm-row"><span class="dm-time">' + fmtTime(a[5]) + '</span>' +
        '<span class="dm-player">' + esc(names[a[0]] || a[0]) + '</span>' +
        '<span class="dm-comp">' + comp + '</span>' +
        '<span class="dm-result ' + o[1] + '">' + o[0] + '</span>' +
        '<span class="dm-score">' + a[2] + '</span></div>';
    }).join("");
    if (modal.showModal) modal.showModal(); else modal.setAttribute("open", "");
  }

  document.addEventListener("click", function (e) {
    if (e.target.closest(".dm-close")) {
      const m = document.getElementById("defense-modal");
      if (m) m.close();
      return;
    }
    const modal = e.target.closest(".defense-modal");
    if (e.target.classList && e.target.classList.contains("defense-modal")) {
      e.target.close(); // click on the backdrop
      return;
    }
    if (modal) return;
    const tr = e.target.closest(".defense-table tbody tr[data-attacks]");
    if (tr && !e.target.closest("a, button")) openModal(tr);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Enter") return;
    const tr = e.target.closest && e.target.closest(".defense-table tbody tr[data-attacks]");
    if (tr) openModal(tr);
  });
})();
