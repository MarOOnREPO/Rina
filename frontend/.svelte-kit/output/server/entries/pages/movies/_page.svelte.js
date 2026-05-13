import { s as store_get, d as ensure_array_like, a as attr_class, e as escape_html, u as unsubscribe_stores, f as attr, c as stringify } from "../../../chunks/root.js";
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
    let searchQuery = "";
    let searchResults = [];
    let watchedFilter = "all";
    if (store_get($$store_subs ??= {}, "$isAuthenticated", isAuthenticated)) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="max-w-5xl mx-auto px-4 py-6"><h2 class="text-2xl font-bold mb-6">🎬 Movie Watchlist</h2> `);
      GlassCard($$renderer2, {
        className: "mb-6",
        children: ($$renderer3) => {
          $$renderer3.push(`<div class="relative"><input${attr("value", searchQuery)} placeholder="Search TMDB for movies..." class="w-full px-4 py-3 pr-10 rounded-xl bg-rina-bg border border-rina-border text-white placeholder-rina-slate-dark focus:outline-none focus:border-rina-rose/50 transition-all"/> `);
          {
            $$renderer3.push("<!--[-1-->");
            $$renderer3.push(`<span class="absolute right-3 top-1/2 -translate-y-1/2 text-rina-slate-dark">🔍</span>`);
          }
          $$renderer3.push(`<!--]--></div> `);
          if (searchResults.length > 0) {
            $$renderer3.push("<!--[0-->");
            $$renderer3.push(`<div class="mt-4 space-y-2 max-h-64 overflow-y-auto"><!--[-->`);
            const each_array = ensure_array_like(searchResults);
            for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
              let result = each_array[$$index];
              $$renderer3.push(`<div class="flex items-center gap-3 p-2 rounded-xl hover:bg-white/5 transition-colors">`);
              if (result.posterPath) {
                $$renderer3.push("<!--[0-->");
                $$renderer3.push(`<img${attr("src", result.posterPath)}${attr("alt", result.title)} class="w-12 h-18 object-cover rounded-lg bg-rina-bg" loading="lazy"/>`);
              } else {
                $$renderer3.push("<!--[-1-->");
                $$renderer3.push(`<div class="w-12 h-18 rounded-lg bg-rina-bg flex items-center justify-center text-lg">🎬</div>`);
              }
              $$renderer3.push(`<!--]--> <div class="flex-1 min-w-0"><p class="text-sm font-medium truncate">${escape_html(result.title)}</p> <p class="text-xs text-rina-slate">${escape_html(result.releaseDate || "Unknown year")}</p></div> <button class="px-3 py-1.5 rounded-lg bg-rina-rose/20 text-rina-rose text-xs font-medium hover:bg-rina-rose/30 transition-colors">Add</button></div>`);
            }
            $$renderer3.push(`<!--]--></div>`);
          } else {
            $$renderer3.push("<!--[-1-->");
          }
          $$renderer3.push(`<!--]-->`);
        },
        $$slots: { default: true }
      });
      $$renderer2.push(`<!----> <div class="flex gap-2 mb-4"><!--[-->`);
      const each_array_1 = ensure_array_like([
        ["all", "All"],
        ["unwatched", "To Watch"],
        ["watched", "Watched"]
      ]);
      for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
        let [filter, label] = each_array_1[$$index_1];
        $$renderer2.push(`<button${attr_class(`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${stringify(watchedFilter === filter ? "bg-rina-rose/20 text-rina-rose" : "glass text-rina-slate hover:text-white")}`)}>${escape_html(label)}</button>`);
      }
      $$renderer2.push(`<!--]--></div> `);
      {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="text-center py-12 text-rina-slate">Loading movies...</div>`);
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
