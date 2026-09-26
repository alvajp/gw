// Click a <th> to sort its <table> by that column (numeric-aware, toggles asc/desc).
document.querySelectorAll("table.sortable").forEach(function (table) {
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
