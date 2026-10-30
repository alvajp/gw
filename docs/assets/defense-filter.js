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
})();
