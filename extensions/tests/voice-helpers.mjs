export function event() {
  const listeners = [];
  return {
    addListener(listener) {
      listeners.push(listener);
    },
    emit(...args) {
      for (const listener of [...listeners]) listener(...args);
    },
    get length() {
      return listeners.length;
    },
  };
}

// Model Chrome ports: local disconnect notifies the peer, not the caller.
export function linkedPorts(name = "medmailgenie-voice") {
  let closed = false;
  const ports = [0, 1].map(() => ({
    name,
    onMessage: event(),
    onDisconnect: event(),
  }));
  ports.forEach((port, index) => {
    const peer = ports[1 - index];
    port.postMessage = (message) => {
      if (closed) throw new Error("Port disconnected");
      peer.onMessage.emit(JSON.parse(JSON.stringify(message)));
    };
    port.disconnect = () => {
      if (closed) return;
      closed = true;
      peer.onDisconnect.emit();
    };
  });
  return ports;
}

export function fakeTimers() {
  let next = 0;
  const timers = new Map();
  return {
    setTimeout(callback, ms) {
      const id = ++next;
      timers.set(id, { callback, ms });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    run(ms) {
      for (const [id, timer] of [...timers]) {
        if (timer.ms === ms && timers.delete(id)) timer.callback();
      }
    },
  };
}

export const settle = () => new Promise((resolve) => setImmediate(resolve));
