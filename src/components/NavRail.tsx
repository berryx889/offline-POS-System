// Persistent left nav rail (pos-prd.md §9.5). 72px, ledger background, icons +
// labels. Cashiers see only Sell and Reprints. Active user chip + logout pinned
// at the bottom.

import { NavLink } from "react-router-dom";
import { useSession } from "@/store/sessionStore";
import { cn } from "@/lib/cn";

type Item = { to: string; label: string; icon: string; adminOnly?: boolean };

// Simple glyphs keep the bundle asset-free for now; swap for real icons later.
const ITEMS: Item[] = [
  { to: "/sell", label: "Sell", icon: "🧾" },
  { to: "/reprints", label: "Reprints", icon: "🖨" },
  { to: "/products", label: "Products", icon: "📦", adminOnly: true },
  { to: "/dashboard", label: "Dashboard", icon: "📊", adminOnly: true },
  { to: "/end-of-day", label: "End day", icon: "🔒", adminOnly: true },
  { to: "/reports", label: "Reports", icon: "📈", adminOnly: true },
  { to: "/settings", label: "Settings", icon: "⚙", adminOnly: true },
];

export function NavRail() {
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const isAdmin = user?.role === "admin";
  const items = ITEMS.filter((i) => !i.adminOnly || isAdmin);

  return (
    <nav className="flex w-[72px] shrink-0 flex-col items-center bg-ledger py-3 text-tape">
      <div className="mb-4 text-center text-[10px] font-semibold uppercase tracking-wider text-tape/70">
        CTop
      </div>
      <div className="flex flex-1 flex-col gap-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex w-16 flex-col items-center gap-1 rounded-lg py-2 text-[11px] transition-colors",
                "focus:outline-none focus:ring-2 focus:ring-tape/60",
                isActive ? "bg-tape/15 font-semibold" : "text-tape/75 hover:bg-tape/10"
              )
            }
          >
            <span className="text-lg leading-none">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>

      <div className="mt-2 flex flex-col items-center gap-2">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full bg-tape/15 text-sm font-semibold"
          title={`${user?.name ?? ""} (${user?.role ?? ""})`}
        >
          {user?.name?.[0]?.toUpperCase() ?? "?"}
        </div>
        <button
          onClick={logout}
          className="rounded-lg py-1 text-[11px] text-tape/70 hover:text-tape focus:outline-none focus:ring-2 focus:ring-tape/60"
        >
          Log out
        </button>
      </div>
    </nav>
  );
}
