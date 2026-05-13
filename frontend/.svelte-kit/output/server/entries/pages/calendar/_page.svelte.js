import { e as escape_html, j as bind_props, s as store_get, d as ensure_array_like, u as unsubscribe_stores, a as attr_class, c as stringify } from "../../../chunks/root.js";
import "@sveltejs/kit/internal";
import "../../../chunks/exports.js";
import "../../../chunks/utils.js";
import "@sveltejs/kit/internal/server";
import "../../../chunks/client.js";
import { i as isAuthenticated } from "../../../chunks/auth.js";
import { G as GlassCard } from "../../../chunks/GlassCard.js";
import { o as onDestroy } from "../../../chunks/index-server.js";
function CountdownTimer($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let target, diff, days, hours, minutes, seconds;
    let targetDate = $$props["targetDate"];
    let title = $$props["title"];
    let now = Date.now();
    let interval;
    onDestroy(() => {
      clearInterval(interval);
    });
    function pad(n) {
      return n.toString().padStart(2, "0");
    }
    target = new Date(targetDate).getTime();
    diff = Math.max(0, target - now);
    days = Math.floor(diff / (1e3 * 60 * 60 * 24));
    hours = Math.floor(diff % (1e3 * 60 * 60 * 24) / (1e3 * 60 * 60));
    minutes = Math.floor(diff % (1e3 * 60 * 60) / (1e3 * 60));
    seconds = Math.floor(diff % (1e3 * 60) / 1e3);
    $$renderer2.push(`<div class="glass rounded-2xl p-6 text-center"><h3 class="text-sm font-medium text-rina-slate uppercase tracking-wider mb-4">${escape_html(title)}</h3> <div class="flex items-center justify-center gap-3"><div class="flex flex-col items-center"><span class="text-3xl md:text-4xl font-bold tabular-nums text-gradient">${escape_html(pad(days))}</span> <span class="text-[10px] text-rina-slate uppercase mt-1">Days</span></div> <span class="text-2xl text-rina-slate-dark pb-4">:</span> <div class="flex flex-col items-center"><span class="text-3xl md:text-4xl font-bold tabular-nums text-gradient">${escape_html(pad(hours))}</span> <span class="text-[10px] text-rina-slate uppercase mt-1">Hrs</span></div> <span class="text-2xl text-rina-slate-dark pb-4">:</span> <div class="flex flex-col items-center"><span class="text-3xl md:text-4xl font-bold tabular-nums text-gradient">${escape_html(pad(minutes))}</span> <span class="text-[10px] text-rina-slate uppercase mt-1">Min</span></div> <span class="text-2xl text-rina-slate-dark pb-4">:</span> <div class="flex flex-col items-center"><span class="text-3xl md:text-4xl font-bold tabular-nums text-gradient">${escape_html(pad(seconds))}</span> <span class="text-[10px] text-rina-slate uppercase mt-1">Sec</span></div></div></div>`);
    bind_props($$props, { targetDate, title });
  });
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    let year, month, monthName, firstDayOfMonth, daysInMonth, calendarDays, daysWithEvents;
    let currentDate = /* @__PURE__ */ new Date();
    let events = [];
    let countdowns = [];
    function getEventColor(type) {
      return type === "WORK" ? "bg-rina-indigo" : "bg-rina-rose";
    }
    function isPeriodDay(day) {
      return (day + month * 31) % 28 === 5;
    }
    function isFertileDay(day) {
      return (day + month * 31) % 28 === 19;
    }
    year = currentDate.getFullYear();
    month = currentDate.getMonth();
    monthName = currentDate.toLocaleString("en-GB", { month: "long", year: "numeric" });
    firstDayOfMonth = new Date(year, month, 1).getDay();
    daysInMonth = new Date(year, month + 1, 0).getDate();
    calendarDays = Array.from({ length: 42 }, (_, i) => {
      const dayNum = i - firstDayOfMonth + 1;
      if (dayNum < 1 || dayNum > daysInMonth) return null;
      return dayNum;
    });
    daysWithEvents = calendarDays.map((day) => {
      if (!day) return null;
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dayEvents = events.filter((e) => {
        const d = new Date(e.startTime);
        return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
      });
      return { day, dateStr, events: dayEvents };
    });
    if (store_get($$store_subs ??= {}, "$isAuthenticated", isAuthenticated)) {
      $$renderer2.push("<!--[0-->");
      $$renderer2.push(`<div class="max-w-5xl mx-auto px-4 py-6"><h2 class="text-2xl font-bold mb-6">📅 Calendar</h2> `);
      if (countdowns.length > 0) {
        $$renderer2.push("<!--[0-->");
        $$renderer2.push(`<div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6"><!--[-->`);
        const each_array = ensure_array_like(countdowns);
        for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
          let cd = each_array[$$index];
          CountdownTimer($$renderer2, { targetDate: cd.targetDate, title: cd.title });
        }
        $$renderer2.push(`<!--]-->}</div>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--> `);
      GlassCard($$renderer2, {
        className: "mb-6",
        children: ($$renderer3) => {
          $$renderer3.push(`<div class="flex items-center justify-between mb-4"><button class="p-2 rounded-lg hover:bg-white/5 transition-colors text-rina-slate">←</button> <h3 class="text-lg font-semibold">${escape_html(monthName)}</h3> <button class="p-2 rounded-lg hover:bg-white/5 transition-colors text-rina-slate">→</button></div> <div class="grid grid-cols-7 gap-1 mb-2"><!--[-->`);
          const each_array_1 = ensure_array_like(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
          for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
            let day = each_array_1[$$index_1];
            $$renderer3.push(`<div class="text-center text-xs font-medium text-rina-slate py-2">${escape_html(day)}</div>`);
          }
          $$renderer3.push(`<!--]--></div> <div class="grid grid-cols-7 gap-1"><!--[-->`);
          const each_array_2 = ensure_array_like(daysWithEvents);
          for (let $$index_3 = 0, $$length = each_array_2.length; $$index_3 < $$length; $$index_3++) {
            let cell = each_array_2[$$index_3];
            if (cell) {
              $$renderer3.push("<!--[0-->");
              const { day, dateStr, events: dayEvents } = cell;
              $$renderer3.push(`<button${attr_class(`relative aspect-square rounded-xl p-1.5 flex flex-col items-start gap-0.5 hover:bg-white/5 transition-colors text-left ${stringify(isPeriodDay(day) ? "bg-red-500/10" : "")} ${stringify(isFertileDay(day) ? "bg-blue-500/10" : "")}`)}><span${attr_class(`text-sm font-medium ${stringify(isPeriodDay(day) ? "text-red-400" : isFertileDay(day) ? "text-blue-400" : "text-white")}`)}>${escape_html(day)}</span> `);
              if (dayEvents.length > 0) {
                $$renderer3.push("<!--[0-->");
                $$renderer3.push(`<div class="flex flex-wrap gap-0.5 w-full"><!--[-->`);
                const each_array_3 = ensure_array_like(dayEvents.slice(0, 3));
                for (let $$index_2 = 0, $$length2 = each_array_3.length; $$index_2 < $$length2; $$index_2++) {
                  let event = each_array_3[$$index_2];
                  $$renderer3.push(`<div${attr_class(`h-1.5 flex-1 rounded-full ${stringify(getEventColor(event.type))}`)}></div>`);
                }
                $$renderer3.push(`<!--]--></div>`);
              } else {
                $$renderer3.push("<!--[-1-->");
              }
              $$renderer3.push(`<!--]--> `);
              if (isPeriodDay(day)) {
                $$renderer3.push("<!--[0-->");
                $$renderer3.push(`<span class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-500"></span>`);
              } else {
                $$renderer3.push("<!--[-1-->");
              }
              $$renderer3.push(`<!--]--> `);
              if (isFertileDay(day)) {
                $$renderer3.push("<!--[0-->");
                $$renderer3.push(`<span class="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-blue-500"></span>`);
              } else {
                $$renderer3.push("<!--[-1-->");
              }
              $$renderer3.push(`<!--]--></button>`);
            } else {
              $$renderer3.push("<!--[-1-->");
              $$renderer3.push(`<div class="aspect-square"></div>`);
            }
            $$renderer3.push(`<!--]-->`);
          }
          $$renderer3.push(`<!--]--></div> <div class="flex items-center gap-4 mt-4 text-xs text-rina-slate"><div class="flex items-center gap-1.5"><div class="w-2 h-2 rounded-full bg-rina-rose"></div> Shared</div> <div class="flex items-center gap-1.5"><div class="w-2 h-2 rounded-full bg-rina-indigo"></div> Work</div> <div class="flex items-center gap-1.5"><div class="w-2 h-2 rounded-full bg-red-500"></div> Period</div> <div class="flex items-center gap-1.5"><div class="w-2 h-2 rounded-full bg-blue-500"></div> Fertile</div></div>`);
        },
        $$slots: { default: true }
      });
      $$renderer2.push(`<!----> `);
      {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--> `);
      GlassCard($$renderer2, {
        children: ($$renderer3) => {
          $$renderer3.push(`<h3 class="text-lg font-semibold mb-4">Upcoming Events</h3> `);
          {
            $$renderer3.push("<!--[0-->");
            $$renderer3.push(`<p class="text-rina-slate text-sm">Loading...</p>`);
          }
          $$renderer3.push(`<!--]-->`);
        },
        $$slots: { default: true }
      });
      $$renderer2.push(`<!----></div>`);
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
