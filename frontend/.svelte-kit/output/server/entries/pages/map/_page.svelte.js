import { h as head, s as store_get, d as ensure_array_like, b as attr_style, e as escape_html, u as unsubscribe_stores, c as stringify } from "../../../chunks/root.js";
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
    const demoPhotos = [
      {
        lat: 34.26,
        lng: -6.58,
        caption: "Kenitra Streets",
        url: "",
        year: 2024
      },
      {
        lat: 58.01,
        lng: 56.25,
        caption: "Perm Winter",
        url: "",
        year: 2024
      },
      {
        lat: 48.8566,
        lng: 2.3522,
        caption: "Paris Together",
        url: "",
        year: 2023
      }
    ];
    head("w85nl5", $$renderer2, ($$renderer3) => {
      {
        $$renderer3.push("<!--[-1-->");
      }
      $$renderer3.push(`<!--]-->`);
    });
    if (store_get($$store_subs ??= {}, "$isAuthenticated", isAuthenticated)) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="fixed inset-0 pt-14 pb-16 md:pb-0 flex flex-col"><div class="relative flex-1">`);
      {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<div class="absolute inset-0 flex items-center justify-center bg-rina-bg"><div class="relative w-64 h-64 md:w-96 md:h-96"><div class="absolute inset-0 rounded-full border border-rina-border opacity-30"></div> <div class="absolute inset-4 rounded-full border border-rina-border opacity-20"></div> <div class="absolute inset-8 rounded-full border border-rina-border opacity-10"></div> <!--[-->`);
        const each_array = ensure_array_like(demoPhotos);
        for (let i = 0, $$length = each_array.length; i < $$length; i++) {
          let photo = each_array[i];
          $$renderer2.push(`<div class="absolute w-3 h-3 rounded-full bg-rina-rose shadow-[0_0_12px_rgba(251,113,133,0.5)]"${attr_style(`top: ${stringify(30 + i * 25)}%; left: ${stringify(20 + i * 30)}%;`)}><div class="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs text-rina-slate bg-rina-bg/80 px-2 py-0.5 rounded">${escape_html(photo.caption)}</div></div>`);
        }
        $$renderer2.push(`<!--]--> <div class="absolute inset-0 flex items-center justify-center"><p class="text-rina-slate-dark text-sm">🌍 Mapbox Globe</p></div></div></div>`);
      }
      $$renderer2.push(`<!--]--> <div class="absolute top-4 left-4 z-10">`);
      GlassCard($$renderer2, {
        padding: "sm",
        className: "max-w-xs",
        children: ($$renderer3) => {
          $$renderer3.push(`<h3 class="text-sm font-semibold mb-1">🌍 Scrapbook Map</h3> <p class="text-xs text-rina-slate">Photos pinned by EXIF location data.</p> `);
          {
            $$renderer3.push("<!--[0-->");
            $$renderer3.push(`<p class="text-xs text-rina-rose mt-2">Set VITE_MAPBOX_TOKEN for 3D globe.</p>`);
          }
          $$renderer3.push(`<!--]-->`);
        },
        $$slots: { default: true }
      });
      $$renderer2.push(`<!----></div></div></div>`);
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
