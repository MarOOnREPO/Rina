import { s as store_get, e as escape_html, d as ensure_array_like, f as attr, a as attr_class, c as stringify, u as unsubscribe_stores } from "../../chunks/root.js";
import { g as goto } from "../../chunks/client.js";
import { i as isAuthenticated, c as currentUser } from "../../chunks/auth.js";
import "../../chunks/socket.js";
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    let now = /* @__PURE__ */ new Date();
    let kenitraTime = "";
    let permTime = "";
    let kenitraTemp = "--";
    let permTemp = "--";
    function weatherIcon(code) {
      return "☀️";
    }
    const quickActions = [
      {
        path: "/chat",
        label: "Chat",
        icon: "💬",
        color: "from-rina-rose/20 to-rina-rose/5"
      },
      {
        path: "/video",
        label: "Video Call",
        icon: "📹",
        color: "from-rina-indigo/20 to-rina-indigo/5"
      },
      {
        path: "/calendar",
        label: "Calendar",
        icon: "📅",
        color: "from-emerald-500/20 to-emerald-500/5"
      },
      {
        path: "/movies",
        label: "Movies",
        icon: "🎬",
        color: "from-amber-500/20 to-amber-500/5"
      },
      {
        path: "/listen",
        label: "Listen",
        icon: "🎵",
        color: "from-pink-500/20 to-pink-500/5"
      },
      {
        path: "/roulette",
        label: "Food",
        icon: "🍽️",
        color: "from-orange-500/20 to-orange-500/5"
      }
    ];
    if (!store_get($$store_subs ??= {}, "$isAuthenticated", isAuthenticated) && typeof window !== "undefined") {
      goto();
    }
    if (store_get($$store_subs ??= {}, "$isAuthenticated", isAuthenticated)) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="max-w-7xl mx-auto px-4 py-6 space-y-6"><div class="grid grid-cols-1 md:grid-cols-3 gap-4"><div class="glass rounded-2xl p-5 flex items-center justify-between"><div><p class="text-xs font-medium text-rina-slate uppercase tracking-wider">Kenitra, MA</p> <p class="text-3xl font-bold tabular-nums">${escape_html(kenitraTime)}</p></div> <div class="text-right"><span class="text-2xl">${escape_html(weatherIcon())}</span> <p class="text-sm text-rina-slate">${escape_html(kenitraTemp)}°C</p></div></div> <div class="glass rounded-2xl p-5 flex items-center justify-between"><div><p class="text-xs font-medium text-rina-slate uppercase tracking-wider">Perm, RU</p> <p class="text-3xl font-bold tabular-nums">${escape_html(permTime)}</p></div> <div class="text-right"><span class="text-2xl">${escape_html(weatherIcon())}</span> <p class="text-sm text-rina-slate">${escape_html(permTemp)}°C</p></div></div> <button class="glass rounded-2xl p-5 flex flex-col items-center justify-center gap-2 hover:bg-rina-rose/10 active:scale-95 transition-all group cursor-pointer"><svg class="w-8 h-8 text-rina-rose group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg> <span class="text-sm font-medium text-rina-rose">Thinking of You</span></button></div> <div><h2 class="text-2xl font-bold mb-1">Hello, <span class="text-gradient">${escape_html(store_get($$store_subs ??= {}, "$currentUser", currentUser)?.displayName || "Love")}</span></h2> <p class="text-rina-slate text-sm">${escape_html(now.toLocaleDateString("en-GB", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      }))}</p></div> <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3"><!--[-->`);
      const each_array = ensure_array_like(quickActions);
      for (let i = 0, $$length = each_array.length; i < $$length; i++) {
        let action = each_array[i];
        $$renderer2.push(`<a${attr("href", action.path)}${attr_class(`glass rounded-xl p-4 flex flex-col items-center gap-2 hover:scale-[1.02] active:scale-95 transition-all bg-gradient-to-b ${stringify(action.color)}`)}><span class="text-3xl">${escape_html(action.icon)}</span> <span class="text-xs font-medium text-center">${escape_html(action.label)}</span></a>`);
      }
      $$renderer2.push(`<!--]--></div> <div class="grid grid-cols-1 md:grid-cols-2 gap-4"><div class="glass rounded-2xl p-6"><h3 class="text-lg font-semibold mb-3">🎯 Goals</h3> <p class="text-rina-slate text-sm">Your shared financial goals will appear here.</p></div> <div class="glass rounded-2xl p-6"><h3 class="text-lg font-semibold mb-3">⏰ Next Visit</h3> <p class="text-rina-slate text-sm">Countdowns to your upcoming visits will appear here.</p></div></div></div>`);
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
