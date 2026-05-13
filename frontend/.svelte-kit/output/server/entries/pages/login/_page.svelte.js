import { s as store_get, f as attr, e as escape_html, u as unsubscribe_stores } from "../../../chunks/root.js";
import "@sveltejs/kit/internal";
import "../../../chunks/exports.js";
import "../../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../../chunks/client.js";
import { a as auth, b as isLoading } from "../../../chunks/auth.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    let error;
    let username = "";
    let password = "";
    error = store_get($$store_subs ??= {}, "$auth", auth).error;
    $$renderer2.push(`<div class="min-h-screen flex items-center justify-center px-4 relative overflow-hidden"><div class="absolute top-1/4 left-1/4 w-64 h-64 bg-rina-rose/10 rounded-full blur-[100px]"></div> <div class="absolute bottom-1/4 right-1/4 w-64 h-64 bg-rina-indigo/10 rounded-full blur-[100px]"></div> <div class="w-full max-w-sm glass-strong rounded-2xl p-8 shadow-2xl"><div class="text-center mb-8"><h1 class="text-3xl font-bold text-gradient mb-2">Welcome</h1> <p class="text-rina-slate text-sm">Project Rina — Private Sanctuary</p></div> <form class="space-y-5"><div><label for="username" class="block text-xs font-medium text-rina-slate mb-1.5 uppercase tracking-wider">Username</label> <input id="username" type="text"${attr("value", username)} placeholder="maroon or rina" class="w-full px-4 py-3 rounded-xl bg-rina-bg border border-rina-border text-white placeholder-rina-slate-dark focus:outline-none focus:border-rina-rose/50 focus:ring-1 focus:ring-rina-rose/30 transition-all" autocomplete="username"/></div> <div><label for="password" class="block text-xs font-medium text-rina-slate mb-1.5 uppercase tracking-wider">Password</label> <div class="relative"><input id="password"${attr("type", "password")}${attr("value", password)} placeholder="••••••••" class="w-full px-4 py-3 pr-12 rounded-xl bg-rina-bg border border-rina-border text-white placeholder-rina-slate-dark focus:outline-none focus:border-rina-rose/50 focus:ring-1 focus:ring-rina-rose/30 transition-all" autocomplete="current-password"/> <button type="button" class="absolute right-3 top-1/2 -translate-y-1/2 text-rina-slate-dark hover:text-rina-slate transition-colors"${attr("aria-label", "Show password")}>${escape_html("👁️")}</button></div></div> `);
    if (error) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="text-rina-rose text-sm text-center">${escape_html(error)}</div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <button type="submit"${attr("disabled", store_get($$store_subs ??= {}, "$isLoading", isLoading), true)} class="w-full py-3 rounded-xl bg-gradient-to-r from-rina-rose to-rina-indigo text-white font-semibold hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed">`);
    if (store_get($$store_subs ??= {}, "$isLoading", isLoading)) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<span class="inline-block animate-spin mr-2">⏳</span> Entering...`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`Enter`);
    }
    $$renderer2.push(`<!--]--></button></form> <div class="mt-6 text-center"><p class="text-xs text-rina-slate-dark">This space belongs to MarOOn &amp; Rina only.</p></div></div></div>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
export {
  _page as default
};
//# sourceMappingURL=_page.svelte.js.map
