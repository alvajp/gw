// Click a <th> to sort its <table> by that column (numeric-aware, toggles asc/desc).
// Exposed as window.initSortableTables(root) so it can be re-run after a page
// fragment (e.g. a table swapped in by page-transition.js) is injected into the DOM.
function initSortableTables(root) {
  (root || document).querySelectorAll("table.sortable").forEach(function (table) {
    if (table.dataset.sortableInit) return;
    table.dataset.sortableInit = "true";
    const headers = table.querySelectorAll("th");
    headers.forEach(function (th, colIndex) {
      let asc = true;
      th.addEventListener("click", function () {
        const tbody = table.querySelector("tbody");
        const rows = Array.from(tbody.querySelectorAll("tr"));
        rows.sort(function (a, b) {
          const av = a.children[colIndex].innerText.trim();
          const bv = b.children[colIndex].innerText.trim();
          const an = parseFloat(av.replace(",", "."));
          const bn = parseFloat(bv.replace(",", "."));
          const bothNumeric = !isNaN(an) && !isNaN(bn);
          const cmp = bothNumeric ? an - bn : av.localeCompare(bv);
          return asc ? cmp : -cmp;
        });
        rows.forEach(function (row) { tbody.appendChild(row); });
        asc = !asc;
      });
    });
  });
}
window.initSortableTables = initSortableTables;
initSortableTables(document);
