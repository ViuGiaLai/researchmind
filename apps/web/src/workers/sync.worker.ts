/// <reference lib="webworker" />
/** Placeholder web worker for background metadata sync jobs */
self.onmessage = (event: MessageEvent) => {
  const { type } = event.data || {};
  if (type === "ping") {
    (self as DedicatedWorkerGlobalScope).postMessage({ type: "pong", at: Date.now() });
  }
};
export {};
