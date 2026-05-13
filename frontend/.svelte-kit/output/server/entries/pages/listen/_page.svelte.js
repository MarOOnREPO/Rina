import { h as head, s as store_get, u as unsubscribe_stores, f as attr } from "../../../chunks/root.js";
import { o as onDestroy } from "../../../chunks/index-server.js";
import "@sveltejs/kit/internal";
import "../../../chunks/exports.js";
import "../../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../../chunks/client.js";
import { i as isAuthenticated } from "../../../chunks/auth.js";
import "../../../chunks/socket.js";
import { G as GlassCard } from "../../../chunks/GlassCard.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    let videoId = "";
    onDestroy(() => {
    });
    head("1qzse9c", $$renderer2, ($$renderer3) => {
      $$renderer3.push(`<script src="https://www.youtube.com/iframe_api"><\/script>`);
      $$renderer3.push(`<!---->`);
    });
    if (store_get($$store_subs ??= {}, "$isAuthenticated", isAuthenticated)) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="max-w-5xl mx-auto px-4 py-6"><h2 class="text-2xl font-bold mb-6">🎵 Listen Together</h2> `);
      GlassCard($$renderer2, {
        className: "mb-6",
        children: ($$renderer3) => {
          $$renderer3.push(`<div class="flex gap-2"><input${attr("value", videoId)} placeholder="Paste YouTube URL or Video ID..." class="flex-1 px-4 py-3 rounded-xl bg-rina-bg border border-rina-border text-white placeholder-rina-slate-dark focus:outline-none focus:border-rina-rose/50 transition-all"/> <button class="px-6 py-3 rounded-xl bg-rina-rose text-white font-medium hover:opacity-90 transition-opacity">Load</button></div> `);
          {
            $$renderer3.push("<!--[-1-->");
          }
          $$renderer3.push(`<!--]-->`);
        },
        $$slots: { default: true }
      });
      $$renderer2.push(`<!----> <div class="glass rounded-2xl overflow-hidden aspect-video relative"><div id="yt-player" class="w-full h-full"></div> `);
      {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="absolute inset-0 flex flex-col items-center justify-center text-rina-slate"><span class="text-5xl mb-4">🎵</span> <p class="text-lg font-medium">Paste a YouTube link to start listening together</p> <p class="text-sm text-rina-slate-dark mt-1">Play, pause, and seek are synced in real-time</p></div>`);
      }
      $$renderer2.push(`<!--]--></div> <div class="mt-4 text-center"><p class="text-xs text-rina-slate-dark">💡 Synced to the millisecond via Socket.io. Your partner's player will mirror yours automatically.</p></div></div>`);
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
