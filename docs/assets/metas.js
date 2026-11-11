// Raid-meta methodology dialogs on player pages (rosters.render_raid_metas): clicking a meta badge or a meta's name
// in the table opens its <dialog id="meta-N">; × or a click on the backdrop closes it.
(function () {
  function open(id) {
    const d = document.getElementById(id);
    if (d && d.showModal && !d.open) d.showModal();
  }
  document.addEventListener("click", function (e) {
    const trigger = e.target.closest("[data-meta]");
    if (trigger) return open(trigger.dataset.meta);
    const dlg = e.target.closest("dialog.meta-modal");
    if (e.target.closest(".mm-close") && dlg) return dlg.close();
    if (e.target.matches("dialog.meta-modal")) e.target.close(); // backdrop = the dialog element itself
  });
  document.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(".mbadge[data-meta]")) {
      e.preventDefault();
      open(e.target.dataset.meta);
    }
  });
})();
