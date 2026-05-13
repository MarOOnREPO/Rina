import { k as sanitize_props, l as rest_props, m as fallback, n as attributes, i as slot, j as bind_props, c as stringify } from "./root.js";
function GlassCard($$renderer, $$props) {
  const $$sanitized_props = sanitize_props($$props);
  const $$restProps = rest_props($$sanitized_props, ["hover", "padding", "className"]);
  let hover = fallback($$props["hover"], true);
  let padding = fallback($$props["padding"], "md");
  let className = fallback($$props["className"], "");
  const paddingClasses = { none: "", sm: "p-3", md: "p-5", lg: "p-8" };
  $$renderer.push(`<div${attributes({
    class: `glass rounded-2xl ${stringify(paddingClasses[padding])} ${stringify(hover ? "hover:bg-white/[0.04] transition-colors" : "")} ${stringify(className)}`,
    ...$$restProps
  })}><!--[-->`);
  slot($$renderer, $$props, "default", {});
  $$renderer.push(`<!--]--></div>`);
  bind_props($$props, { hover, padding, className });
}
export {
  GlassCard as G
};
//# sourceMappingURL=GlassCard.js.map
