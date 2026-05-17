

export const index = 1;
let component_cache;
export const component = async () => component_cache ??= (await import('../entries/fallbacks/error.svelte.js')).default;
export const imports = ["_app/immutable/nodes/1.CnE3hp2w.js","_app/immutable/chunks/B4YkhzDe.js","_app/immutable/chunks/BRcNrMAb.js"];
export const stylesheets = [];
export const fonts = [];
