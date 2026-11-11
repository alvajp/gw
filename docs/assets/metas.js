// Raid-meta methodology dialogs on player pages (rosters.render_raid_metas): clicking a meta badge or a meta's name
// in the table opens its <dialog id="meta-N">; × or a click on the backdrop closes it.
(function () {
  function open(id) {
    const d = document.getElementById(id);
    if (d && d.showModal && !d.open) d.showModal();
  }
  // Players list: a column head sorts the rows by that meta (best first, click again to reverse).
  function sortBy(head) {
    const grid = head.closest(".pgrid");
    if (!grid) return;
    const col = head.dataset.sort;
    const dir = head.dataset.dir === "desc" ? "asc" : "desc";
    grid.querySelectorAll(".pg-meta[data-sort]").forEach(function (h) { delete h.dataset.dir; });
    head.dataset.dir = dir;
    const rows = Array.prototype.slice.call(grid.querySelectorAll(".pg-row"));
    rows.sort(function (a, b) {
      const d = parseFloat(b.dataset["m" + col]) - parseFloat(a.dataset["m" + col]);
      return (dir === "desc" ? d : -d) || a.dataset.i - b.dataset.i;
    });
    rows.forEach(function (r) { grid.appendChild(r); });
  }
  document.addEventListener("click", function (e) {
    const head = e.target.closest(".pg-meta[data-sort]");
    if (head) return sortBy(head);
    const trigger = e.target.closest("[data-meta]");
    if (trigger) return open(trigger.dataset.meta);
    const dlg = e.target.closest("dialog.meta-modal");
    if (e.target.closest(".mm-close") && dlg) return dlg.close();
    if (e.target.matches("dialog.meta-modal")) e.target.close(); // backdrop = the dialog element itself
  });
  // Players list: hovering a meta's three percentages also highlights that meta's column head.
  function hover(e, on) {
    const cell = e.target.closest && e.target.closest(".pg-cell[data-meta]");
    if (!cell) return;
    const head = document.querySelector('.pg-meta[data-sort="' + cell.dataset.col + '"]');
    if (head) head.classList.toggle("is-hover", on);
  }
  document.addEventListener("mouseover", function (e) { hover(e, true); });
  document.addEventListener("mouseout", function (e) { hover(e, false); });
  document.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(".mbadge[data-meta], .pg-cell[data-meta], .mtable tr[data-meta], .pg-meta[data-sort]")) {
      e.preventDefault();
      if (e.target.matches(".pg-meta[data-sort]")) sortBy(e.target);
      else open(e.target.dataset.meta);
    }
  });
})();
