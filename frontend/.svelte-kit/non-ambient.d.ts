
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	type MatcherParam<M> = M extends (param : string) => param is (infer U extends string) ? U : string;

	export interface AppTypes {
		RouteId(): "/" | "/calendar" | "/capsules" | "/chat" | "/goals" | "/listen" | "/login" | "/map" | "/movies" | "/roulette" | "/video" | "/whiteboard";
		RouteParams(): {
			
		};
		LayoutParams(): {
			"/": Record<string, never>;
			"/calendar": Record<string, never>;
			"/capsules": Record<string, never>;
			"/chat": Record<string, never>;
			"/goals": Record<string, never>;
			"/listen": Record<string, never>;
			"/login": Record<string, never>;
			"/map": Record<string, never>;
			"/movies": Record<string, never>;
			"/roulette": Record<string, never>;
			"/video": Record<string, never>;
			"/whiteboard": Record<string, never>
		};
		Pathname(): "/" | "/calendar" | "/capsules" | "/chat" | "/goals" | "/listen" | "/login" | "/map" | "/movies" | "/roulette" | "/video" | "/whiteboard";
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/favicon.png" | "/manifest.json" | string & {};
	}
}