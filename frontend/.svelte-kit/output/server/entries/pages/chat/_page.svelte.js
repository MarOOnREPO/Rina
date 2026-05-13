import { s as store_get, e as escape_html, f as attr, u as unsubscribe_stores } from "../../../chunks/root.js";
import { o as onDestroy } from "../../../chunks/index-server.js";
import "@sveltejs/kit/internal";
import "../../../chunks/exports.js";
import "../../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../../chunks/client.js";
import { i as isAuthenticated } from "../../../chunks/auth.js";
import { t as typing } from "../../../chunks/socket.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    let partnerTyping;
    let input = "";
    let typingTimeout;
    onDestroy(() => {
      clearTimeout(typingTimeout);
    });
    partnerTyping = store_get($$store_subs ??= {}, "$typing", typing);
    if (store_get($$store_subs ??= {}, "$isAuthenticated", isAuthenticated)) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="max-w-3xl mx-auto h-[calc(100vh-7rem)] flex flex-col px-4"><div class="glass rounded-2xl p-4 mb-3 flex items-center justify-between shrink-0"><div><h2 class="text-lg font-semibold">💬 Chat</h2> <p class="text-xs text-rina-slate">`);
      if (partnerTyping) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<span class="text-rina-rose">${escape_html(partnerTyping.displayName)} is typing...</span>`);
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`Encrypted • End-to-end`);
      }
      $$renderer2.push(`<!--]--></p></div></div> <div class="flex-1 overflow-y-auto space-y-3 px-1 pb-2" style="scroll-behavior: smooth;">`);
      {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="text-center text-rina-slate py-8">Loading messages...</div>`);
      }
      $$renderer2.push(`<!--]--></div> <div class="glass rounded-2xl p-3 mt-3 flex gap-2 shrink-0"><input${attr("value", input)} placeholder="Type a message..." class="flex-1 bg-transparent border-none text-white placeholder-rina-slate-dark text-sm focus:outline-none px-2"/> <button${attr("disabled", !input.trim(), true)} class="w-9 h-9 rounded-full bg-rina-rose flex items-center justify-center hover:scale-105 active:scale-95 transition-transform disabled:opacity-30" aria-label="Send message"><svg class="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg></button></div></div>`);
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
