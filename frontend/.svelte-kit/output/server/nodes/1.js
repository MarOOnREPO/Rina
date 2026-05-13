

export const index = 1;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/fallbacks/error.svelte.js')).default;
export const imports = ["_app/immutable/nodes/1.DKHAMnO4.js","_app/immutable/chunks/B32YBw1U.js","_app/immutable/chunks/BDMg1Xii.js"];
export const stylesheets = [];
export const fonts = [];
