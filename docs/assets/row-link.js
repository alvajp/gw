// A table row with data-href opens that page when clicked anywhere (Enter / Space too), exactly like a row of the Joueurs list.
// Real links and buttons inside the row keep their own behaviour.
(function () {
  function go(row) { window.location.href = row.dataset.href; }
  document.addEventListener("click", function (e) {
    const row = e.target.closest("tr[data-href]");
    if (!row || e.target.closest("a, button")) return;
    go(row);
  });
  document.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("tr[data-href]")) {
      e.preventDefault();
      go(e.target);
    }
  });
})();
