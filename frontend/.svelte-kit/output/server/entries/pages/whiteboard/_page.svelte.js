import { s as store_get, d as ensure_array_like, a as attr_class, b as attr_style, f as attr, e as escape_html, u as unsubscribe_stores, c as stringify } from "../../../chunks/root.js";
import { o as onDestroy } from "../../../chunks/index-server.js";
import "@sveltejs/kit/internal";
import "../../../chunks/exports.js";
import "../../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../../chunks/client.js";
import { i as isAuthenticated } from "../../../chunks/auth.js";
import "../../../chunks/socket.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    let color = "#fb7185";
    let brushSize = 3;
    const COLORS = ["#fb7185", "#818cf8", "#34d399", "#fbbf24", "#ffffff"];
    onDestroy(() => {
    });
    if (store_get($$store_subs ??= {}, "$isAuthenticated", isAuthenticated)) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="fixed inset-0 pt-14 pb-16 md:pb-0 flex flex-col"><div class="glass border-b border-rina-border px-4 py-2 flex items-center gap-3 shrink-0 z-10"><div class="flex items-center gap-1.5"><!--[-->`);
      const each_array = ensure_array_like(COLORS);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let c = each_array[$$index];
        $$renderer2.push(`<button${attr_class(`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${stringify(color === c ? "border-white scale-110" : "border-transparent")}`)}${attr_style(`background-color: ${stringify(c)};`)}${attr("aria-label", `Select color ${stringify(c)}`)}></button>`);
      }
      $$renderer2.push(`<!--]--></div> <div class="w-px h-6 bg-rina-border"></div> <input type="range" min="1" max="20"${attr("value", brushSize)} class="w-24 accent-rina-rose"/> <span class="text-xs text-rina-slate w-4">${escape_html(brushSize)}</span> <div class="w-px h-6 bg-rina-border"></div> <button class="px-3 py-1.5 rounded-lg text-xs font-medium glass hover:bg-white/5 transition-colors">Clear</button> <button class="px-3 py-1.5 rounded-lg text-xs font-medium bg-rina-rose/20 text-rina-rose hover:bg-rina-rose/30 transition-colors">Save</button></div> <div class="flex-1 relative bg-transparent"><canvas class="absolute inset-0 w-full h-full cursor-crosshair touch-none"></canvas> <div class="absolute bottom-4 left-4 pointer-events-none"><p class="text-xs text-rina-slate-dark">Draw together • Yjs synced</p></div></div></div>`);
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
