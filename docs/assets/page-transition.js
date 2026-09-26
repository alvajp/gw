// Animated client-side transition between index.html and seasons/<n>.html —
// the only two page shapes that share the frise+chart layout in the same
// position. Links opt in via data-transition="true" (set server-side in
// generate_site.py only on those compatible links). Everything else keeps
// behaving as a normal <a href> navigation (progressive enhancement: works
// with JS disabled too).
(function () {
  const FRISE_MS = 420;
  const CHART_MS = 480;

  function easeIn(t) { return t * t * t; }
  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function animate(duration, onFrame, onDone) {
    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / duration);
      onFrame(t);
      if (t < 1) requestAnimationFrame(frame);
      else if (onDone) onDone();
    }
    requestAnimationFrame(frame);
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function hexToRgb(hex) {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [154, 164, 255];
  }
  function lerpColor(c1, c2, t) {
    const a = hexToRgb(c1), b = hexToRgb(c2);
    return "rgb(" + Math.round(lerp(a[0], b[0], t)) + ", " + Math.round(lerp(a[1], b[1], t)) + ", " + Math.round(lerp(a[2], b[2], t)) + ")";
  }

  function transitionFrise(liveFrise, newInnerHTML) {
    if (!liveFrise) return;
    const oldLayer = document.createElement("div");
    oldLayer.className = "frise-old-layer";
    oldLayer.innerHTML = liveFrise.innerHTML;

    const newLayer = document.createElement("div");
    newLayer.className = "frise-new-layer";
    newLayer.innerHTML = newInnerHTML;

    liveFrise.classList.add("frise-transitioning");
    liveFrise.innerHTML = "";
    liveFrise.appendChild(oldLayer);
    liveFrise.appendChild(newLayer);

    void liveFrise.offsetWidth; // force reflow so the animate-in/out classes transition
    requestAnimationFrame(function () {
      oldLayer.classList.add("frise-animate-out");
      newLayer.classList.add("frise-animate-in");
    });

    setTimeout(function () {
      liveFrise.innerHTML = newInnerHTML;
      liveFrise.classList.remove("frise-transitioning");
    }, FRISE_MS + 40);
  }

  function readBars(svg) {
    const map = new Map();
    if (!svg) return map;
    svg.querySelectorAll("rect.chart-bar[data-uid]").forEach(function (rect) {
      map.set(rect.dataset.uid, {
        x: parseFloat(rect.getAttribute("x")),
        y: parseFloat(rect.getAttribute("y")),
        width: parseFloat(rect.getAttribute("width")),
        height: parseFloat(rect.getAttribute("height")),
        fill: rect.getAttribute("fill"),
      });
    });
    return map;
  }

  function transitionChart(liveWrap, newWrap) {
    if (!liveWrap) return;
    if (!newWrap) { liveWrap.innerHTML = ""; return; }

    // The chip toggle always resets to the default "Moyenne" metric on a
    // fresh page; keep the hidden "Efficience" chart in sync instantly
    // (it isn't visible, so no animation needed) and only animate the
    // default chart below.
    const liveChips = liveWrap.querySelector(".chips");
    const newChips = newWrap.querySelector(".chips");
    if (liveChips && newChips) liveChips.outerHTML = newChips.outerHTML;

    const liveScrolls = liveWrap.querySelectorAll(".chart-scroll[data-metric]");
    const newScrolls = newWrap.querySelectorAll(".chart-scroll[data-metric]");
    liveScrolls.forEach(function (el, i) {
      el.style.display = i === 0 ? "" : "none";
      if (i > 0 && newScrolls[i]) el.innerHTML = newScrolls[i].innerHTML;
    });

    const liveSvg = liveWrap.querySelector("#avg-chart-moyenne");
    const newSvg = newWrap.querySelector("#avg-chart-moyenne");
    if (!liveSvg || !newSvg) {
      liveWrap.innerHTML = newWrap.innerHTML;
      return;
    }

    const oldBars = readBars(liveSvg);
    const newBars = readBars(newSvg);
    const uids = new Set();
    oldBars.forEach(function (_v, k) { uids.add(k); });
    newBars.forEach(function (_v, k) { uids.add(k); });

    liveSvg.setAttribute("viewBox", newSvg.getAttribute("viewBox"));
    liveSvg.setAttribute("width", newSvg.getAttribute("width"));
    liveSvg.setAttribute("height", newSvg.getAttribute("height"));

    liveSvg.querySelectorAll("text").forEach(function (t) { t.remove(); });

    const rectEls = new Map();
    liveSvg.querySelectorAll("rect.chart-bar[data-uid]").forEach(function (rect) {
      rectEls.set(rect.dataset.uid, rect);
    });

    let baselineY = 0;
    oldBars.forEach(function (g) { baselineY = g.y + g.height; });
    if (!baselineY) newBars.forEach(function (g) { baselineY = g.y + g.height; });

    uids.forEach(function (uid) {
      if (!oldBars.has(uid) && newBars.has(uid)) {
        const to = newBars.get(uid);
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("class", "chart-bar");
        rect.dataset.uid = uid;
        rect.setAttribute("rx", "2");
        rect.setAttribute("x", to.x);
        rect.setAttribute("width", to.width);
        rect.setAttribute("y", baselineY);
        rect.setAttribute("height", 0);
        rect.setAttribute("fill", to.fill);
        liveSvg.appendChild(rect);
        rectEls.set(uid, rect);
      }
    });

    animate(CHART_MS, function (t) {
      const e = easeInOut(t);
      uids.forEach(function (uid) {
        const rect = rectEls.get(uid);
        if (!rect) return;
        const to = newBars.get(uid) || { x: oldBars.get(uid).x, y: baselineY, width: oldBars.get(uid).width, height: 0, fill: oldBars.get(uid).fill };
        const from = oldBars.get(uid) || { x: to.x, y: baselineY, width: to.width, height: 0, fill: to.fill };
        rect.setAttribute("x", lerp(from.x, to.x, e).toFixed(1));
        rect.setAttribute("y", lerp(from.y, to.y, e).toFixed(1));
        rect.setAttribute("width", lerp(from.width, to.width, e).toFixed(1));
        rect.setAttribute("height", lerp(from.height, to.height, e).toFixed(1));
        rect.setAttribute("fill", lerpColor(from.fill, to.fill, e));
      });
    }, function () {
      uids.forEach(function (uid) {
        if (!newBars.has(uid)) {
          const rect = rectEls.get(uid);
          if (rect) rect.remove();
        }
      });
      newSvg.querySelectorAll("text").forEach(function (t) {
        const clone = t.cloneNode(true);
        clone.style.opacity = "0";
        liveSvg.appendChild(clone);
      });
      requestAnimationFrame(function () {
        liveSvg.querySelectorAll("text").forEach(function (t) {
          t.style.transition = "opacity 200ms ease-out";
          t.style.opacity = "1";
        });
      });
    });
  }

  function fetchDoc(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("fetch failed: " + r.status);
      return r.text();
    }).then(function (html) {
      return new DOMParser().parseFromString(html, "text/html");
    });
  }

  function go(url) {
    fetchDoc(url).then(function (doc) {
      const liveFrise = document.getElementById("frise");
      const newFrise = doc.getElementById("frise");
      if (liveFrise && newFrise) transitionFrise(liveFrise, newFrise.innerHTML);

      transitionChart(document.getElementById("chart-wrap"), doc.getElementById("chart-wrap"));

      const liveTableWrap = document.getElementById("table-wrap");
      const newTableWrap = doc.getElementById("table-wrap");
      if (liveTableWrap && newTableWrap) {
        liveTableWrap.innerHTML = newTableWrap.innerHTML;
        if (window.initSortableTables) window.initSortableTables(liveTableWrap);
      }

      const liveBareme = document.getElementById("bareme-wrap");
      const newBareme = doc.getElementById("bareme-wrap");
      if (liveBareme) liveBareme.innerHTML = newBareme ? newBareme.innerHTML : "";

      const liveTitle = document.getElementById("page-title");
      const newTitle = doc.getElementById("page-title");
      if (liveTitle && newTitle) liveTitle.textContent = newTitle.textContent;

      const liveBreadcrumb = document.getElementById("breadcrumb");
      const newBreadcrumb = doc.getElementById("breadcrumb");
      if (liveBreadcrumb && newBreadcrumb) liveBreadcrumb.innerHTML = newBreadcrumb.innerHTML;

      document.title = doc.title;
      history.pushState({ transition: true }, "", url);
    }).catch(function () {
      window.location.href = url;
    });
  }

  document.addEventListener("click", function (e) {
    const link = e.target.closest('a[data-transition="true"]');
    if (!link) return;
    e.preventDefault();
    go(link.getAttribute("href"));
  });

  window.addEventListener("popstate", function () {
    window.location.reload();
  });
})();
