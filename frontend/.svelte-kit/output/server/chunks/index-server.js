import { o as ssr_context } from "./root.js";
import "clsx";
function onDestroy(fn) {
  /** @type {SSRContext} */
  ssr_context.r.on_destroy(fn);
}
export {
  onDestroy as o
};
//# sourceMappingURL=index-server.js.map
