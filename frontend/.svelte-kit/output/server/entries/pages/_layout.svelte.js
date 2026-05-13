import { g as getContext, s as store_get, e as escape_html, a as attr_class, b as attr_style, u as unsubscribe_stores, c as stringify, d as ensure_array_like, f as attr, h as head, i as slot } from "../../chunks/root.js";
import { c as currentUser, i as isAuthenticated } from "../../chunks/auth.js";
import { p as partnerPresence, a as pingReceived } from "../../chunks/socket.js";
import "clsx";
import "@sveltejs/kit/internal";
import "../../chunks/exports.js";
import "../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../chunks/client.js";
import { o as onDestroy } from "../../chunks/index-server.js";
const getStores = () => {
  const stores$1 = getContext("__svelte__");
  return {
    /** @type {typeof page} */
    page: {
      subscribe: stores$1.page.subscribe
    },
    /** @type {typeof navigating} */
    navigating: {
      subscribe: stores$1.navigating.subscribe
    },
    /** @type {typeof updated} */
    updated: stores$1.updated
  };
};
const page = {
  subscribe(fn) {
    const store = getStores().page;
    return store.subscribe(fn);
  }
};
function PresenceOrb($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    let status, color, glowClass;
    status = store_get($$store_subs ??= {}, "$partnerPresence", partnerPresence)?.status ?? "offline";
    color = status === "online" ? "#22c55e" : status === "typing" ? "#f59e0b" : status === "away" ? "#94a3b8" : "#475569";
    glowClass = status === "typing" ? "animate-pulse" : status === "online" ? "animate-pulse-slow" : "";
    $$renderer2.push(`<div class="relative flex items-center gap-2"><span class="text-xs font-medium text-rina-slate hidden sm:inline">`);
    if (store_get($$store_subs ??= {}, "$currentUser", currentUser)) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`${escape_html(store_get($$store_subs ??= {}, "$currentUser", currentUser).username === "maroon" ? "Rina" : "MarOOn")}`);
    } else {
      $$renderer2.push("<!--[-1-->");
      $$renderer2.push(`Partner`);
    }
    $$renderer2.push(`<!--]--></span> <div class="relative"><div${attr_class(`w-3 h-3 rounded-full transition-colors duration-500 ${stringify(glowClass)}`)}${attr_style(`background-color: ${stringify(color)}; box-shadow: 0 0 8px ${stringify(color)}, 0 0 16px ${stringify(color)}40;`)}></div> `);
    if (status === "typing") {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="absolute inset-0 rounded-full animate-ping opacity-75"${attr_style(`background-color: ${stringify(color)};`)}></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div></div>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
function GlassNav($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    let currentPath;
    const navItems = [
      { path: "/", label: "Home", icon: "🏠" },
      { path: "/chat", label: "Chat", icon: "💬" },
      { path: "/calendar", label: "Calendar", icon: "📅" },
      { path: "/movies", label: "Movies", icon: "🎬" },
      { path: "/listen", label: "Music", icon: "🎵" },
      { path: "/roulette", label: "Food", icon: "🍽️" }
    ];
    currentPath = store_get($$store_subs ??= {}, "$page", page).url.pathname;
    if (store_get($$store_subs ??= {}, "$isAuthenticated", isAuthenticated)) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<header class="fixed top-0 left-0 right-0 z-50 glass border-b border-rina-border"><div class="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between"><a href="/" class="flex items-center gap-2"><span class="text-xl font-bold text-gradient">Rina</span></a> <nav class="hidden md:flex items-center gap-1"><!--[-->`);
      const each_array = ensure_array_like(navItems);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let item = each_array[$$index];
        $$renderer2.push(`<a${attr("href", item.path)}${attr_class(`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${stringify(currentPath === item.path ? "bg-rina-rose/10 text-rina-rose" : "text-rina-slate hover:text-white hover:bg-white/5")}`)}><span class="mr-1.5">${escape_html(item.icon)}</span> ${escape_html(item.label)}</a>`);
      }
      $$renderer2.push(`<!--]--></nav> <div class="flex items-center gap-3">`);
      PresenceOrb($$renderer2);
      $$renderer2.push(`<!----></div></div></header> <nav class="fixed bottom-0 left-0 right-0 z-50 glass border-t border-rina-border md:hidden pb-safe svelte-som7bz"><div class="flex items-center justify-around h-16"><!--[-->`);
      const each_array_1 = ensure_array_like(navItems);
      for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
        let item = each_array_1[$$index_1];
        $$renderer2.push(`<a${attr("href", item.path)}${attr_class(`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-all duration-200 ${stringify(currentPath === item.path ? "text-rina-rose" : "text-rina-slate-dark")}`)}><span class="text-xl">${escape_html(item.icon)}</span> <span class="text-[10px] font-medium">${escape_html(item.label)}</span></a>`);
      }
      $$renderer2.push(`<!--]--></div></nav>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}
function PingOverlay($$renderer) {
  var $$store_subs;
  let ping;
  ping = store_get($$store_subs ??= {}, "$pingReceived", pingReceived);
  if (ping && typeof navigator !== "undefined" && navigator.vibrate) {
    navigator.vibrate([100, 50, 200, 50, 100]);
  }
  if (ping) {
    $$renderer.push("<!--[0-->");
    $$renderer.push(`<div class="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center"><div class="absolute inset-0 bg-rina-rose/10 animate-pulse-slow" style="backdrop-filter: blur(2px);"></div> <div class="relative z-10"><svg width="120" height="120" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="drop-shadow-[0_0_30px_rgba(251,113,133,0.6)]"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="#fb7185"></path></svg> <p class="text-center mt-4 text-rina-rose font-semibold text-lg drop-shadow-lg">${escape_html(ping.from)} is thinking of you</p></div></div>`);
  } else {
    $$renderer.push("<!--[-1-->");
  }
  $$renderer.push(`<!--]-->`);
  if ($$store_subs) unsubscribe_stores($$store_subs);
}
function TranslationTooltip($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let selectedText = "";
    let translation = "";
    let loading = false;
    let show = false;
    let x = 0;
    let y = 0;
    let longPressTimer;
    async function translate(text, targetLang = "en") {
      loading = true;
      try {
        const response = await fetch("https://libretranslate.de/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ q: text, source: "auto", target: targetLang, format: "text" })
        });
        const data = await response.json();
        translation = data.translatedText || "Translation unavailable";
      } catch {
        translation = "Translation service unavailable";
      } finally {
        loading = false;
      }
    }
    function handleTouchStart(e) {
      const target = e.target;
      if (target.closest(".no-translate")) return;
      longPressTimer = setTimeout(
        () => {
          const selection = window.getSelection()?.toString().trim();
          if (selection && selection.length > 0 && selection.length < 200) {
            selectedText = selection;
            const touch = e.touches[0];
            x = touch.clientX;
            y = touch.clientY - 60;
            show = true;
            translate(selection);
          }
        },
        600
      );
    }
    function handleTouchEnd() {
      clearTimeout(longPressTimer);
    }
    function handleMouseUp(e) {
      const selection = window.getSelection()?.toString().trim();
      if (selection && selection.length > 0 && selection.length < 200) {
        selectedText = selection;
        x = e.clientX;
        y = e.clientY - 60;
        show = true;
        translate(selection);
      } else {
        show = false;
      }
    }
    onDestroy(() => {
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    });
    if (show) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="fixed z-[90] glass-strong rounded-xl p-3 shadow-2xl max-w-xs"${attr_style(`left: ${stringify(Math.min(Math.max(x, 10), window.innerWidth - 220))}px; top: ${stringify(Math.max(y, 10))}px;`)}><div class="flex items-center justify-between mb-1.5"><p class="text-[10px] font-medium text-rina-slate uppercase tracking-wider">Translation</p> <button class="text-rina-slate-dark hover:text-white text-xs">×</button></div> <p class="text-xs text-rina-slate-dark mb-2 line-clamp-2">“${escape_html(selectedText)}”</p> `);
      if (loading) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="flex items-center gap-2 text-xs text-rina-slate"><span class="animate-spin">⏳</span> Translating...</div>`);
      } else {
        $$renderer2.push("<!--[-1-->");
        $$renderer2.push(`<p class="text-sm text-white font-medium">${escape_html(translation)}</p>`);
      }
      $$renderer2.push(`<!--]--></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]-->`);
  });
}
function _layout($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    head("12qhfyh", $$renderer2, ($$renderer3) => {
      $$renderer3.push(`<meta name="theme-color" content="#0f0f1a"/>`);
    });
    GlassNav($$renderer2);
    $$renderer2.push(`<!----> <main class="min-h-screen pt-14 md:pb-0 pb-20"><!--[-->`);
    slot($$renderer2, $$props, "default", {});
    $$renderer2.push(`<!--]--></main> `);
    PingOverlay($$renderer2);
    $$renderer2.push(`<!----> `);
    TranslationTooltip($$renderer2);
    $$renderer2.push(`<!---->`);
  });
}
export {
  _layout as default
};
//# sourceMappingURL=_layout.svelte.js.map
