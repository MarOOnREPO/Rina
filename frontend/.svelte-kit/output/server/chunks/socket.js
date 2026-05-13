import { i as derived, j as get, w as writable } from "./exports.js";
import "socket.io-client";
import { a as auth } from "./auth.js";
function createSocketStore() {
  const { subscribe, set, update } = writable({
    connected: false,
    connecting: false,
    error: null
  });
  let socket = null;
  return {
    subscribe,
    connect() {
      return;
    },
    disconnect() {
      set({ connected: false, connecting: false, error: null });
    },
    getSocket() {
      return socket;
    },
    emit(event, ...args) {
    },
    on(event, callback) {
    },
    off(event, callback) {
    }
  };
}
const socketStore = createSocketStore();
function createPresenceStore() {
  const { subscribe, set, update } = writable({});
  return {
    subscribe,
    setPresence(data) {
      update((p) => ({ ...p, [data.username]: data }));
    },
    getPresence(username) {
      const state = get({ subscribe });
      return state[username];
    },
    clear() {
      set({});
    },
    init(socket) {
      socket.on("presence:update", (data) => {
        this.setPresence(data);
      });
    }
  };
}
const presence = createPresenceStore();
const partnerPresence = derived(
  [presence, auth],
  ([$presence, $auth]) => {
    if (!$auth.user) return void 0;
    const partnerUsername = $auth.user.username === "maroon" ? "rina" : "maroon";
    return $presence[partnerUsername];
  }
);
function createPingStore() {
  const { subscribe, set } = writable(null);
  return {
    subscribe,
    trigger(data) {
      set(data);
      setTimeout(() => set(null), 4e3);
    },
    init(socket) {
      socket.on("ping:received", (data) => {
        this.trigger(data);
      });
    }
  };
}
const pingReceived = createPingStore();
function createMediaSyncStore() {
  const { subscribe, set } = writable(null);
  return {
    subscribe,
    receive(data) {
      set(data);
      setTimeout(() => set(null), 100);
    },
    emit(data) {
      socketStore.emit("media:sync", data);
    },
    init(socket) {
      socket.on("media:sync", (data) => {
        this.receive(data);
      });
    }
  };
}
createMediaSyncStore();
function createTypingStore() {
  const { subscribe, set } = writable(null);
  let timeout = null;
  return {
    subscribe,
    start(data) {
      set(data);
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => set(null), 3e3);
    },
    stop() {
      set(null);
      if (timeout) clearTimeout(timeout);
    },
    init(socket) {
      socket.on("typing:start", (data) => {
        this.start(data);
      });
      socket.on("typing:stop", () => {
        this.stop();
      });
    }
  };
}
const typing = createTypingStore();
export {
  pingReceived as a,
  partnerPresence as p,
  typing as t
};
//# sourceMappingURL=socket.js.map
