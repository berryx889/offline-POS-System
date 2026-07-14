// The app's "live" mechanism. No server, no websockets — a single in-app event
// bus. When a sale commits, emit `sale:completed`; the dashboard and reprints
// subscribe and re-query (pos-prd.md §4). Built on the browser's EventTarget.

export type AppEvent = "sale:completed" | "stock:changed" | "settings:changed";

const bus = new EventTarget();

export function emit(event: AppEvent, detail?: unknown): void {
  bus.dispatchEvent(new CustomEvent(event, { detail }));
}

export function on(event: AppEvent, handler: (detail: unknown) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent).detail);
  bus.addEventListener(event, listener);
  return () => bus.removeEventListener(event, listener);
}
