// A table row with data-href opens that page when clicked anywhere (Enter / Space too), exactly like a row of the Joueurs list.
// Real links and buttons inside the row keep their own behaviour.
// A column head with data-href (a season, a war, a boss) makes its whole column a link: hovering a cell of the column lights up the head,
// and a click in that column opens that page instead of the player's.
(function () {
  function go(href) { window.location.href = href; }
  function colHead(cell) {
    const table = cell.closest("table");
    const head = table && table.tHead && table.tHead.rows[0];
    const th = head && head.cells[cell.cellIndex];
    return th && th.dataset.href ? th : null;
  }
  document.addEventListener("click", function (e) {
    if (e.target.closest("a, button")) return;
    const cell = e.target.closest("tbody td");
    const th = cell && colHead(cell);
    if (th) return go(th.dataset.href);
    const row = e.target.closest("tr[data-href]");
    if (row) go(row.dataset.href);
  });
  function light(e, on) {
    const cell = e.target.closest && e.target.closest("tbody td");
    let th = cell && colHead(cell);
    if (!th && cell && (cell.classList.contains("alt-link") || cell.hasAttribute("data-atk"))) {  // a cell that leads somewhere of its own (a season, the attacks dialog) lights its column head too
      const table = cell.closest("table");
      th = table && table.tHead && table.tHead.rows[0].cells[cell.cellIndex];
    }
    if (th) th.classList.toggle("col-hover", on);
  }
  // The player's name pill shows only while the pointer is where a click opens the player (not over a column that opens a season, war or boss).
  function pill(e, over) {
    const cell = e.target.closest && e.target.closest("tbody td");
    const row = cell && cell.parentElement;
    if (!row || !(row.dataset.href || row.querySelector(".ex-pill"))) return;  // absent players (no page) get the pill too
    row.classList.toggle("opens-player", over && !colHead(cell) && !cell.classList.contains("alt-link") && !cell.hasAttribute("data-atk"));  // an alt-link / data-atk cell leads elsewhere (a season, the attacks dialog)
  }
  document.addEventListener("mouseover", function (e) { light(e, true); pill(e, true); });
  document.addEventListener("mouseout", function (e) {
    light(e, false);
    const row = e.target.closest && e.target.closest("tr.opens-player");
    if (row && !(e.relatedTarget && row.contains(e.relatedTarget))) row.classList.remove("opens-player");
  });
  document.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("tr[data-href]")) {
      e.preventDefault();
      go(e.target.dataset.href);
    }
  });
})();
