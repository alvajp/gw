// Click a <th> to sort its <table> by that column (numeric-aware): the first click on a column puts the highest value first (descending), the next one reverses it (ascending).
// Exposed as window.initSortableTables(root) so it can be re-run after a page
// fragment (e.g. a table swapped in by page-transition.js) is injected into the DOM.
function initSortableTables(root) {
  (root || document).querySelectorAll("table.sortable").forEach(function (table) {
    if (table.dataset.sortableInit) return;
    table.dataset.sortableInit = "true";
    const headers = table.querySelectorAll("th");
    headers.forEach(function (th, colIndex) {
      th.addEventListener("click", function () {
        const tbody = table.querySelector("tbody");
        const rows = Array.from(tbody.querySelectorAll("tr"));
        // a new column starts descending (highest first); the same column again toggles
        const asc = table.dataset.sortCol === String(colIndex) ? table.dataset.sortDir === "desc" : false;
        table.dataset.sortCol = String(colIndex);
        table.dataset.sortDir = asc ? "asc" : "desc";
        rows.sort(function (a, b) {
          const ac = a.children[colIndex], bc = b.children[colIndex];
          const av = (ac.dataset.sort !== undefined ? ac.dataset.sort : ac.innerText).trim();   // data-sort = exact value behind a rounded display
          const bv = (bc.dataset.sort !== undefined ? bc.dataset.sort : bc.innerText).trim();
          const emptyA = av === "" || /^[-–—]$/.test(av), emptyB = bv === "" || /^[-–—]$/.test(bv);
          if (emptyA || emptyB) return emptyA && emptyB ? 0 : emptyA ? 1 : -1;  // a cell with no value ("-") always goes last, whatever the direction
          const an = parseFloat(av.replace(",", "."));
          const bn = parseFloat(bv.replace(",", "."));
          const bothNumeric = !isNaN(an) && !isNaN(bn);
          const cmp = bothNumeric ? an - bn : av.localeCompare(bv);
          return asc ? cmp : -cmp;
        });
        rows.forEach(function (row) { tbody.appendChild(row); });
      });
    });
  });
}
window.initSortableTables = initSortableTables;
initSortableTables(document);
