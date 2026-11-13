// Narrow screens: both rows of the top bar (sections, then the section's pages and seasons) scroll sideways;
// bring the current item of each into view. Exposed so page-transition.js can redo it after swapping in a new bar.
(function () {
  // The section's own pages (Metas / Records, Stratégie / Défenses) stay at the left of the second row; only the seasons scroll, and they slide out of sight at the separator.
  function pin() {
    document.querySelectorAll(".topsub-inner").forEach(function (row) {
      const sep = row.querySelector(".topsub-sep");
      if (!sep || sep.parentElement !== row) return;
      const box = document.createElement("span"), seasons = document.createElement("span");
      box.className = "topsub-pin";
      seasons.className = "topsub-seasons";
      while (row.firstChild !== sep) box.appendChild(row.firstChild);
      box.appendChild(sep);
      while (row.firstChild) seasons.appendChild(row.firstChild);  // what is left of the row: the seasons (the separator is already in the pinned box)
      row.classList.add("has-pin");
      row.appendChild(box);
      row.appendChild(seasons);
    });
  }
  function center() {
    pin();
    document.querySelectorAll(".topnav, .topsub-inner").forEach(function (row) {
      const sc = row.querySelector(".topsub-seasons") || row;
      const cur = sc.querySelector("a.active");
      if (!cur) return;
      const r = sc.getBoundingClientRect(), c = cur.getBoundingClientRect();
      sc.scrollLeft = Math.max(0, sc.scrollLeft + (c.left - r.left) - (sc.clientWidth - c.width) / 2);
    });
  }
  window.centerTopbar = center;
  center();
})();
