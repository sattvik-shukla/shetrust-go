/**
 * Live updates from the server.
 *
 * The backend used to run Socket.io. It is now Go, which speaks Server-Sent
 * Events (SSE) instead — a plain HTTP response the server keeps open and
 * writes into. The browser has that built in as EventSource, so there is no
 * library to install.
 *
 * This file keeps the small `.on()` / `.off()` API the rest of the app
 * already uses, so no component had to change.
 *
 * One real difference: SSE is one-way (server -> browser). `emit()` is
 * therefore a no-op. Nothing in the app relies on sending events up.
 */

const EVENTS_URL = `${import.meta.env.VITE_API_URL || '/api'}/events`;

let client = null;

function createClient() {
  /** event name -> Set of handler functions */
  const listeners = new Map();

  /** event names we have already wired up on the EventSource */
  const attached = new Set();

  let source = null;
  let connected = false;

  function connect() {
    if (source) return source;

    source = new EventSource(EVENTS_URL);

    source.onopen = () => {
      connected = true;
      console.log('Live updates connected');
    };

    source.onerror = () => {
      connected = false;
      // EventSource reconnects on its own, with its own backoff.
      // Nothing to do here but note it.
      console.log('Live updates disconnected — retrying');
    };

    // Re-attach any listeners registered before the connection existed.
    for (const eventName of listeners.keys()) attachToSource(eventName);

    return source;
  }

  // EventSource delivers each named event to its own listener, so we
  // register one bridge per event name and fan out from there.
  function attachToSource(eventName) {
    if (!source || attached.has(eventName)) return;
    attached.add(eventName);

    source.addEventListener(eventName, (message) => {
      let payload;
      try {
        payload = JSON.parse(message.data);
      } catch {
        return; // ignore anything that is not valid JSON
      }

      const handlers = listeners.get(eventName);
      if (!handlers) return;

      for (const handler of handlers) {
        try {
          handler(payload);
        } catch (err) {
          console.error(`Error in "${eventName}" handler:`, err);
        }
      }
    });
  }

  return {
    on(eventName, handler) {
      if (!listeners.has(eventName)) listeners.set(eventName, new Set());
      listeners.get(eventName).add(handler);

      connect();
      attachToSource(eventName);
    },

    // Called either as off(event, handler) to remove one listener, or as
    // off(event) to remove them all — the same two shapes Socket.io
    // supported, which existing components rely on.
    off(eventName, handler) {
      if (handler === undefined) {
        listeners.delete(eventName);
        return;
      }
      listeners.get(eventName)?.delete(handler);
    },

    /** Not supported: SSE only flows server -> browser. */
    emit() {},

    disconnect() {
      source?.close();
      source = null;
      connected = false;
      attached.clear();
    },

    get connected() {
      return connected;
    },
  };
}

export function getSocket() {
  if (!client) client = createClient();
  return client;
}

export function disconnectSocket() {
  client?.disconnect();
  client = null;
}
