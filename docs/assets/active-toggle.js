// "Joueurs actifs seulement" header toggle (index page only, see #header-extra
// in generate_site.py) — hides table rows for players who weren't on the
// guild's roster in the most recently recorded war.
// Delegated on document, same pattern as chart-toggle.js, so it keeps
// working after page-transition.js replaces #header-extra/#table-wrap on
// client-side navigation (button always starts back in its "off" state on
// a freshly swapped-in page, matching its default markup).
(function () {
  document.addEventListener("click", function (e) {
    const btn = e.target.closest("#active-toggle");
    if (!btn) return;
    const active = btn.classList.toggle("active");
    btn.textContent = active ? btn.dataset.labelOn : btn.dataset.labelOff;

    const tableWrap = document.getElementById("table-wrap");
    if (!tableWrap) return;
    tableWrap.querySelectorAll("tbody tr[data-active]").forEach(function (tr) {
      tr.style.display = active && tr.dataset.active === "false" ? "none" : "";
    });
  });
})();
