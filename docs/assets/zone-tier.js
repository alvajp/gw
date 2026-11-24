// The level of a war zone. Two things come from the game's zone tiers (Hero = 2 Mythic then 3 Legendary, Elite = 2 Legendary then 3 Epic, Veteran = 2 Epic then 3 Rare; the
// zones of the guild's battlefield level 5, see globalconfigs):
//  - window.zoneTier("HQ") / ("MS1 · S28 G3") -> the HTML of the five small diamonds next to a zone's name ("" when unknown);
//  - every attack / defense line (a row of unit portraits next to a zone) gets, on each of its five units, the game's hexagonal rarity badge (M, L, E, R) of that slot.
(function () {
  const TIERS = {
    hero: ["Héros", ["mythic", "mythic", "legendary", "legendary", "legendary"]],
    elite: ["Élite", ["legendary", "legendary", "epic", "epic", "epic"]],
    veteran: ["Vétéran", ["epic", "epic", "rare", "rare", "rare"]],
  };
  const ZONE = {
    HQ: "hero", FP1: "hero", FP2: "hero",
    LP1: "elite", LP2: "elite", AR: "elite", SD: "elite", MS1: "elite", MS2: "elite",
    "FL gauche": "veteran", "FL milieu": "veteran", "FL droite": "veteran", AP1: "veteran", AP2: "veteran", AA: "veteran",
  };
  const NAME = { mythic: ["Mythique", "Mythiques"], legendary: ["Légendaire", "Légendaires"], epic: ["Épique", "Épiques"], rare: ["Rare", "Rares"] };
  const LETTER = { mythic: "M", legendary: "L", epic: "E", rare: "R" };
  const tierOf = function (label) { return TIERS[ZONE[String(label || "").split(" · ")[0].trim()]]; };  // "MS1" or "MS1 · S28 G3"
  window.zoneTier = function (label) {
    const t = tierOf(label);
    if (!t) return "";
    const caps = t[1], first = caps[0], rest = caps[caps.length - 1], n1 = caps.filter(function (c) { return c === first; }).length;
    const title = t[0] + " : " + n1 + " " + NAME[first][n1 > 1 ? 1 : 0] + ", puis " + (caps.length - n1) + " " + NAME[rest][caps.length - n1 > 1 ? 1 : 0];
    return '<span class="zone-tier" title="' + title + '" aria-label="' + title + '">' + caps.map(function (c) { return '<i class="zt zt-' + c + '"></i>'; }).join("") + "</span>";
  };

  // the zone a line of portraits belongs to: the zone cell of its table row, or the header of the dialog it sits in
  function zoneOf(box) {
    const tr = box.closest("tr"), dlg = box.closest("dialog");
    const b = (tr && tr.querySelector(".zone-text b")) || (dlg && dlg.querySelector(".dm-def-zone .zone-text b"));
    if (b && b.firstChild) return b.firstChild.textContent;
    const sm = tr && tr.querySelector("td.guild small");  // the "by map" lists: "S28 G2 · AP1" under the guild's name
    return sm && sm.firstChild ? sm.firstChild.textContent.split(" · ").pop() : "";
  }
  function decorate(box) {
    if (box.dataset.rh) return;
    const t = tierOf(zoneOf(box));
    if (!t) return;
    box.dataset.rh = "1";
    const units = box.querySelectorAll(".unit:not(.mow)");
    for (let i = 0; i < units.length && i < t[1].length; i++) {
      const u = units[i], c = t[1][i], w = document.createElement("span");
      w.className = "uw";
      w.title = u.getAttribute("title") || "";
      u.parentNode.insertBefore(w, u);
      w.appendChild(u);
      w.insertAdjacentHTML("beforeend", '<i class="rh rh-' + c + '" title="' + NAME[c][0] + '">' + LETTER[c] + "</i>");
    }
  }
  const LINES = ".a-comp, .a-def, td.comp, .dm-comp, .dm-def-comp";
  let queued = false;
  function scan() {
    queued = false;
    document.querySelectorAll(LINES).forEach(function (box) { if (box.tagName !== "TH") decorate(box); });
  }
  function queue() { if (!queued) { queued = true; requestAnimationFrame(scan); } }
  document.addEventListener("DOMContentLoaded", function () {
    scan();
    new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
  });
})();
