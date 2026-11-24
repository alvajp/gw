// The level of a war zone, shown as the rarity badges of its five unit slots (the game's zone tiers: Hero = 2 Mythic then 3 Legendary, Elite = 2 Legendary then 3 Epic,
// Veteran = 2 Epic then 3 Rare; the zones of the guild's battlefield level 5, see globalconfigs). window.zoneTier("HQ") / ("MS1 · S28 G3") -> the HTML of the badges ("" when unknown).
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
  window.zoneTier = function (label) {
    const t = TIERS[ZONE[String(label || "").split(" · ")[0].trim()]];
    if (!t) return "";
    const caps = t[1], first = caps[0], rest = caps[caps.length - 1], n1 = caps.filter(function (c) { return c === first; }).length;
    const title = t[0] + " : " + n1 + " " + NAME[first][n1 > 1 ? 1 : 0] + ", puis " + (caps.length - n1) + " " + NAME[rest][caps.length - n1 > 1 ? 1 : 0];
    return '<span class="zone-tier" title="' + title + '" aria-label="' + title + '">' + caps.map(function (c) { return '<i class="zt zt-' + c + '"></i>'; }).join("") + "</span>";
  };
})();
