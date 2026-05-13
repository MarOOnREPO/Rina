/// <reference types="@sveltejs/kit" />

declare global {
  namespace App {
    interface Error {
      message: string;
      code?: string;
    }
    interface Locals {}
    interface PageData {}
    interface Platform {}
  }

  interface Window {
    webkit?: {
      messageHandlers?: Record<string, unknown>;
    };
  }

  interface Navigator {
    vibrate?: (pattern: number | number[]) => boolean;
  }
}

export {};
