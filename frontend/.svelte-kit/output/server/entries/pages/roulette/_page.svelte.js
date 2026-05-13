import { s as store_get, b as attr_style, d as ensure_array_like, f as attr, e as escape_html, u as unsubscribe_stores, c as stringify } from "../../../chunks/root.js";
import "@sveltejs/kit/internal";
import "../../../chunks/exports.js";
import "../../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../../chunks/client.js";
import { i as isAuthenticated } from "../../../chunks/auth.js";
import { G as GlassCard } from "../../../chunks/GlassCard.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    let meals = [
      "🇲🇦 Couscous",
      "🇷🇺 Borscht",
      "🍕 Pizza",
      "🍣 Sushi",
      "🌮 Tacos",
      "🍔 Burgers",
      "🥗 Healthy Salad",
      "🍝 Pasta",
      "🥘 Paella",
      "🍛 Curry",
      "🥞 Pancakes",
      "🍜 Ramen"
    ];
    let rotation = 0;
    let spinning = false;
    if (store_get($$store_subs ??= {}, "$isAuthenticated", isAuthenticated)) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="max-w-2xl mx-auto px-4 py-6"><h2 class="text-2xl font-bold mb-6">🍽️ Dinner Date Roulette</h2> <div class="flex flex-col items-center"><div class="relative w-72 h-72 md:w-96 md:h-96"><div class="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 z-10"><div class="w-0 h-0 border-l-[12px] border-r-[12px] border-t-[20px] border-l-transparent border-r-transparent border-t-rina-rose"></div></div> <svg viewBox="0 0 100 100" class="w-full h-full drop-shadow-2xl"${attr_style(`transform: rotate(${stringify(rotation)}deg); transition: none;`)}><!--[-->`);
      const each_array = ensure_array_like(meals);
      for (let i = 0, $$length = each_array.length; i < $$length; i++) {
        let meal = each_array[i];
        const angle = 360 / meals.length * i;
        const nextAngle = 360 / meals.length * (i + 1);
        const rad1 = angle * Math.PI / 180;
        const rad2 = nextAngle * Math.PI / 180;
        const x1 = 50 + 45 * Math.cos(rad1);
        const y1 = 50 + 45 * Math.sin(rad1);
        const x2 = 50 + 45 * Math.cos(rad2);
        const y2 = 50 + 45 * Math.sin(rad2);
        const midAngle = (angle + nextAngle) / 2;
        const midRad = midAngle * Math.PI / 180;
        const tx = 50 + 30 * Math.cos(midRad);
        const ty = 50 + 30 * Math.sin(midRad);
        const colors = [
          "#fb7185",
          "#818cf8",
          "#34d399",
          "#fbbf24",
          "#f472b6",
          "#60a5fa",
          "#a78bfa",
          "#fb923c"
        ];
        $$renderer2.push(`<path${attr("d", `M50,50 L${stringify(x1)},${stringify(y1)} A45,45 0 0,1 ${stringify(x2)},${stringify(y2)} Z`)}${attr("fill", colors[i % colors.length])} opacity="0.8" stroke="rgba(255,255,255,0.1)" stroke-width="0.5"></path><text${attr("x", tx)}${attr("y", ty)} text-anchor="middle" dominant-baseline="middle" fill="white" font-size="4" font-weight="600"${attr("transform", `rotate(${stringify(midAngle + 90)}, ${stringify(tx)}, ${stringify(ty)})`)}>${escape_html(meal.length > 8 ? meal.slice(0, 6) + ".." : meal)}</text>`);
      }
      $$renderer2.push(`<!--]--><circle cx="50" cy="50" r="8" fill="#0f0f1a" stroke="rgba(255,255,255,0.2)" stroke-width="0.5"></circle><circle cx="50" cy="50" r="3" fill="#fb7185"></circle></svg></div> `);
      {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--> <button${attr("disabled", spinning, true)} class="mt-8 px-10 py-4 rounded-full bg-gradient-to-r from-rina-rose to-rina-indigo text-white font-bold text-lg hover:opacity-90 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-rina-rose/20">${escape_html("SPIN")}</button></div> `);
      GlassCard($$renderer2, {
        className: "mt-8",
        children: ($$renderer3) => {
          $$renderer3.push(`<div class="flex items-center justify-between mb-4"><h3 class="font-semibold">Menu Options</h3> <button class="text-xs px-3 py-1.5 rounded-lg bg-rina-rose/20 text-rina-rose hover:bg-rina-rose/30 transition-colors">+ Add</button></div> <div class="flex flex-wrap gap-2"><!--[-->`);
          const each_array_1 = ensure_array_like(meals);
          for (let i = 0, $$length = each_array_1.length; i < $$length; i++) {
            let meal = each_array_1[i];
            $$renderer3.push(`<div class="flex items-center gap-1 px-3 py-1.5 rounded-full glass text-sm">${escape_html(meal)} <button class="ml-1 text-rina-slate-dark hover:text-rina-rose transition-colors"${attr("aria-label", `Remove ${stringify(meal)}`)}>×</button></div>`);
          }
          $$renderer3.push(`<!--]--></div>`);
        },
        $$slots: { default: true }
      });
      $$renderer2.push(`<!----> `);
      {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
export {
  _page as default
};
//# sourceMappingURL=_page.svelte.js.map
