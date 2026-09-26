// Lets you mark a war as win/loss (stored in localStorage, this browser
// only) and colors the matching frise dot green on season pages.
(function () {
  function storageKey(slug) {
    return "warResult:" + slug;
  }

  document.querySelectorAll("[data-war-toggle]").forEach(function (el) {
    var slug = el.getAttribute("data-war-toggle");
    var label = el.querySelector(".result-toggle-label");

    function applyState(isWin) {
      el.classList.toggle("is-win", isWin);
      label.textContent = isWin ? "Victoire" : "Défaite";
    }

    applyState(localStorage.getItem(storageKey(slug)) === "win");

    el.addEventListener("click", function () {
      var isWin = !el.classList.contains("is-win");
      localStorage.setItem(storageKey(slug), isWin ? "win" : "loss");
      applyState(isWin);
    });
  });

  document.querySelectorAll(".frise-item[data-war-slug]").forEach(function (el) {
    var slug = el.getAttribute("data-war-slug");
    if (localStorage.getItem(storageKey(slug)) === "win") {
      el.querySelector(".frise-dot").classList.add("frise-dot-win");
    }
  });
})();
