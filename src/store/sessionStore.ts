// Who is logged in right now. Not persisted — a fresh login is required each app
// start (a counter machine is shared; you don't want a stale session).

import { create } from "zustand";
import type { User } from "@/db/queries/users";

interface SessionState {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  isAdmin: () => boolean;
}

export const useSession = create<SessionState>((set, get) => ({
  user: null,
  login: (user) => set({ user }),
  logout: () => set({ user: null }),
  isAdmin: () => get().user?.role === "admin",
}));
