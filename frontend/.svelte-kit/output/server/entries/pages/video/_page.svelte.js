import { s as store_get, u as unsubscribe_stores, a as attr_class, e as escape_html, f as attr, c as stringify } from "../../../chunks/root.js";
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
    let callState = "idle";
    function endCall() {
      callState = "idle";
    }
    onDestroy(() => {
      endCall();
    });
    if (store_get($$store_subs ??= {}, "$isAuthenticated", isAuthenticated)) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="max-w-5xl mx-auto px-4 py-6"><h2 class="text-2xl font-bold mb-6">📹 Video Call</h2> `);
      {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--> `);
      GlassCard($$renderer2, {
        className: "relative aspect-video bg-rina-bg overflow-hidden mb-4",
        children: ($$renderer3) => {
          $$renderer3.push(`<video autoplay="" playsinline=""${attr_class(`w-full h-full object-cover ${stringify(callState === "connected" ? "opacity-100" : "opacity-0")}`)}></video> `);
          if (callState !== "connected") {
            $$renderer3.push("<!--[0-->");
            $$renderer3.push(`<div class="absolute inset-0 flex flex-col items-center justify-center text-rina-slate"><span class="text-6xl mb-4">📹</span> <p class="text-lg font-medium">${escape_html(callState === "calling" ? "Calling..." : "Ready to connect")}</p> <p class="text-sm text-rina-slate-dark mt-1">${escape_html(callState === "calling" ? "Waiting for partner to answer" : "Start a call or wait for an incoming one")}</p></div>`);
          } else {
            $$renderer3.push("<!--[-1-->");
          }
          $$renderer3.push(`<!--]--> <div class="absolute bottom-4 right-4 w-32 md:w-48 aspect-video rounded-xl overflow-hidden border-2 border-rina-border shadow-lg"><video autoplay="" playsinline="" muted=""${attr_class(`w-full h-full object-cover ${stringify("opacity-0")}`)}></video> `);
          {
            $$renderer3.push("<!--[0-->");
            $$renderer3.push(`<div class="absolute inset-0 flex items-center justify-center bg-rina-bg text-rina-slate-dark text-xs">Camera off</div>`);
          }
          $$renderer3.push(`<!--]--></div>`);
        },
        $$slots: { default: true }
      });
      $$renderer2.push(`<!----> <div class="flex items-center justify-center gap-3">`);
      if (callState === "idle") {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<button class="px-8 py-3 rounded-full bg-rina-rose text-white font-semibold hover:opacity-90 active:scale-95 transition-all flex items-center gap-2"><span>📞</span> Start Call</button>`);
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<button class="w-12 h-12 rounded-full glass flex items-center justify-center text-xl hover:bg-white/10 transition-colors"${attr("title", "Mute")}>${escape_html("🎤")}</button> <button class="w-12 h-12 rounded-full glass flex items-center justify-center text-xl hover:bg-white/10 transition-colors"${attr("title", "Turn off video")}>${escape_html("📷")}</button> <button class="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center text-xl hover:bg-red-600 active:scale-95 transition-all" title="End call">📞</button>`);
      }
      $$renderer2.push(`<!--]--></div> <div class="mt-6 text-center"><p class="text-xs text-rina-slate-dark">💡 Tip: Use your browser's Picture-in-Picture for match-day theater mode.</p></div></div>`);
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
