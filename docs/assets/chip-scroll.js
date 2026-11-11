// Clicking a chip (filter / player pill / metric / guild) must never move the page: the chip keeps its place on the screen
// and its horizontal chip row keeps its scroll, whatever the click re-renders above, below or inside it.
(function () {
  document.addEventListener("click", function (e) {
    const chip = e.target.closest(".chip");
    if (!chip || chip.tagName === "A") return; // links navigate, they are not filters
    const row = chip.closest(".chips");
    const top0 = chip.getBoundingClientRect().top;
    const left0 = row ? row.scrollLeft : 0;
    function restore() {
      if (!chip.isConnected) return;
      const dy = chip.getBoundingClientRect().top - top0;
      if (Math.abs(dy) > 0.5) window.scrollBy(0, dy);
      if (row && row.scrollLeft !== left0) row.scrollLeft = left0;
    }
    requestAnimationFrame(function () { restore(); requestAnimationFrame(restore); });
    setTimeout(restore, 150);
  }, true); // capture: runs before the chip's own handler, so the "before" position is the real one
})();
