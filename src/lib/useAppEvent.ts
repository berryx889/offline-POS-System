// Subscribe a component to the in-app event bus (lib/events). Used to make the
// dashboard "live" — it re-queries when a sale commits. No server involved.

import { useEffect, useRef } from "react";
import { on, type AppEvent } from "./events";

export function useAppEvent(event: AppEvent, handler: () => void): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => on(event, () => ref.current()), [event]);
}
