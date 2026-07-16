// Automatic session lock (v3 §22): after N idle minutes with no clicks, taps, or
// key presses, drop back to the PIN screen. 0 (the default) disables it. Only
// runs while someone is logged in — App.tsx mounts this alongside the shell.

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSettings } from "@/db/queries/settings";
import { useSession } from "@/store/sessionStore";

const ACTIVITY_EVENTS = ["mousedown", "keydown", "touchstart", "wheel"] as const;

export function useIdleLock(): void {
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });
  const minutes = Math.max(0, parseInt(settings?.idle_lock_minutes ?? "0", 10) || 0);
  const loggedIn = useSession((s) => s.user != null);
  const logout = useSession((s) => s.logout);

  useEffect(() => {
    if (minutes <= 0 || !loggedIn) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(logout, minutes * 60_000);
    };
    reset();
    for (const evt of ACTIVITY_EVENTS) window.addEventListener(evt, reset);
    return () => {
      clearTimeout(timer);
      for (const evt of ACTIVITY_EVENTS) window.removeEventListener(evt, reset);
    };
  }, [minutes, loggedIn, logout]);
}
