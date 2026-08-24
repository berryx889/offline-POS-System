// Who is logged in right now. Not persisted — a fresh login is required each app
// start (a counter machine is shared; you don't want a stale session).

import { create } from "zustand";
import type { User } from "@/db/queries/users";
import { can, isAdminTier, type Permission } from "@/auth/permissions";

interface SessionState {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
  /** @deprecated prefer `can(permission)` — kept for the few places that
   *  genuinely mean "admin-tier role", not a specific permission. */
  isAdmin: () => boolean;
  can: (permission: Permission) => boolean;
}

export const useSession = create<SessionState>((set, get) => ({
  user: null,
  login: (user) => set({ user }),
  logout: () => set({ user: null }),
  isAdmin: () => {
    const role = get().user?.role;
    return role != null && isAdminTier(role);
  },
  can: (permission) => can(get().user, permission),
}));
