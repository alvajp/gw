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
    // Not cached when the blob is absent: index<->season client-side nav swaps
    // it in and out of the page.
    const el = document.getElementById("defense-data");
    if (!el) return { units: {}, players: {} };
    if (!data || data.src !== el.textContent) {
      data = JSON.parse(el.textContent);
      data.src = el.textContent;
    }
    return data;
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

  // Attributes that make an attack row open the placement modal (placement.js).
  function plAttrs(img, att, def) {
    return img ? ' tabindex="0" data-pl-img="' + esc(img) + '" data-pl-att="' + att.join(" ") + '" data-pl-def="' + def.join(" ") + '"' : "";
  }

  // The dialog keeps the height it opened with: filtering its attacks by line must not shrink it (the centred dialog would jump and drag the page behind with it).
  function holdHeight(modal) {
    modal.style.minHeight = "";
    modal.style.minHeight = modal.offsetHeight + "px";
  }

  function openModal(tr) {
    const modal = document.getElementById("defense-modal");
    if (!modal) return;
    const attacks = JSON.parse(tr.dataset.attacks || "[]");
    const names = getData().players;
    // Header: the defense itself, cloned from the row's own cells.
    const cells = tr.children;
    const mapImg = cells[1].querySelector(".map-thumb");
    const defIds = Array.prototype.map.call(cells[2].querySelectorAll(".unit:not(.mow)"), function (img) {
      return (img.getAttribute("src").match(/([^\/]+)\.webp/) || [])[1];
    });
    // Same header as the defender dialog: player, the map tile (thumbnail, zone, map name), the team. The "by map" lists have no map in their rows: it comes from the row's data-*.
    const zoneHtml = tr.dataset.map
      ? '<img class="map-thumb" src="' + esc(tr.dataset.map) + '" alt="" loading="lazy"><span class="zone-text"><b>' + esc(tr.dataset.zone) + "</b><small>" +
        esc(tr.dataset.mapName) + " · " + esc(tr.dataset.war) + "</small></span>"
      : cells[1].innerHTML;
    modal.querySelector(".dm-title").innerHTML =
      '<div class="dm-def"><span class="dm-def-player">' + cells[0].innerHTML + '</span>' +
      '<span class="dm-def-zone">' + zoneHtml + '</span>' +
      '<span class="dm-def-comp">' + cells[2].innerHTML + '</span></div>';

    modal.querySelector(".dm-body").innerHTML = attacks.map(function (a) {
      const o = OUTCOME[a[1]] || OUTCOME.u;
      const comp = a[3].map(function (u) { return portrait(u, false); }).join("") + (a[4] ? portrait(a[4], true) : "");
      return '<div class="dm-row"' + plAttrs(mapImg && mapImg.getAttribute("src"), a[3], defIds) + '>' +
        '<span class="dm-player">' + esc(names[a[0]] || a[0]) + '</span>' +
        '<span class="dm-comp">' + comp + '</span>' +
        '<span class="dm-result ' + o[1] + '">' + o[0] + '</span>' +
        '<span class="dm-score">' + a[2] + '</span></div>';
    }).join("");
    if (modal.showModal) modal.showModal(); else modal.setAttribute("open", "");
    holdHeight(modal);
  }

  // ---- Click a defender under a map tile: its lineups on top, every attack below ----
  function openDefenderModal(chip) {
    const modal = document.getElementById("defense-modal");
    if (!modal) return;
    const d = JSON.parse(chip.dataset.def);
    const names = getData().players;
    modal.querySelector(".dm-title").innerHTML =
      '<div class="dm-def"><span class="dm-def-player">' + esc(names[d.p] || d.p) + '</span>' +
      '<span class="dm-def-zone">' + (d.i ? '<img class="map-thumb" src="' + d.i + '" alt="">' : "") +
      '<span class="zone-text"><b>' + esc(d.z) + '</b><small>' + esc(d.m) + '</small></span></span></div>';

    const lines = d.l.map(function (l, i) {
      const comp = l[0].map(function (u) { return portrait(u, false); }).join("") + (l[1] ? portrait(l[1], true) : "");
      return '<div class="dm-lineup" role="button" tabindex="0" data-line="' + (i + 1) + '">' +
        '<span class="dm-linestats">' + l[2] + " att. · " + l[3] + " échec" + (l[3] > 1 ? "s" : "") + " · " + l[4] + '</span>' +
        '<span class="dm-comp">' + comp + '</span></div>';
    }).join("");

    const attacks = d.a.map(function (a) {
      const o = OUTCOME[a[1]] || OUTCOME.u;
      const comp = a[3].map(function (u) { return portrait(u, false); }).join("") + (a[4] ? portrait(a[4], true) : "");
      const line = d.l[a[5] - 1];
      return '<div class="dm-row" data-line="' + a[5] + '"' + plAttrs(d.i, a[3], line ? line[0] : []) + '>' +
        '<span class="dm-player">' + esc(names[a[0]] || a[0]) + '</span>' +
        '<span class="dm-comp">' + comp + '</span>' +
        '<span class="dm-result ' + o[1] + '">' + o[0] + '</span>' +
        '<span class="dm-score">' + a[2] + '</span></div>';
    }).join("");

    modal.querySelector(".dm-body").innerHTML =
      '<section class="dm-block"><div class="dm-th dm-th-lines"><span>Défense</span><span>Compo</span></div>' + lines + '</section>' +
      '<section class="dm-block"><div class="dm-th dm-th-attacks"><span>Attaques <span class="dm-count">' + d.a.length + '</span></span><span>Compo</span><span>Résultat</span><span>Score</span></div>' + attacks + '</section>';
    const first = modal.querySelector(".dm-lineup");
    if (first) selectLine(first);  // the first defense line is selected on opening; its attacks are the ones listed
    if (modal.showModal) modal.showModal(); else modal.setAttribute("open", "");
    holdHeight(modal);
  }

  // A defense line of the defender dialog is the filter of the attacks below: exactly one is selected, the attacks against it are listed.
  function selectLine(lineEl) {
    const body = lineEl.closest(".dm-body");
    const line = lineEl.dataset.line;
    body.querySelectorAll(".dm-lineup").forEach(function (l) { l.classList.toggle("active", l === lineEl); l.setAttribute("aria-pressed", l === lineEl ? "true" : "false"); });
    let shown = 0;
    body.querySelectorAll(".dm-row[data-line]").forEach(function (row) {
      row.hidden = row.dataset.line !== line;
      if (!row.hidden) shown++;
    });
    const count = body.querySelector(".dm-count");
    if (count) count.textContent = shown;
  }

  document.addEventListener("click", function (e) {
    const lineEl = e.target.closest(".dm-lineup[data-line]");
    if (lineEl) {
      selectLine(lineEl);
      return;
    }
    const defChip = e.target.closest(".map-def");
    if (defChip) {
      openDefenderModal(defChip);
      return;
    }
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
    const lineEl = (e.key === "Enter" || e.key === " ") && e.target.closest && e.target.closest(".dm-lineup[data-line]");
    if (lineEl) {
      e.preventDefault();
      selectLine(lineEl);
      return;
    }
    if (e.key !== "Enter") return;
    const tr = e.target.closest && e.target.closest(".defense-table tbody tr[data-attacks]");
    if (tr) openModal(tr);
  });
})();
