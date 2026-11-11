// Narrow screens: both rows of the top bar (sections, then the section's pages and seasons) scroll sideways;
// bring the current item of each into view. Exposed so page-transition.js can redo it after swapping in a new bar.
(function () {
  function center() {
    document.querySelectorAll(".topnav, .topsub-inner").forEach(function (row) {
      const cur = row.querySelector("a.active");
      if (cur) row.scrollLeft = Math.max(0, cur.offsetLeft - (row.clientWidth - cur.offsetWidth) / 2);
    });
  }
  window.centerTopbar = center;
  center();
})();
