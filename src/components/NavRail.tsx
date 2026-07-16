// Left sidebar (SiMi Shop style): white surface, brand at the top, nav items as
// icon+label rows, the active item a solid green pill. Cashiers see only Sell and
// Reprints. User chip + logout pinned at the bottom.

import { NavLink } from "react-router-dom";
import { useSession } from "@/store/sessionStore";
import { Icon, type IconName } from "./Icon";
import { cn } from "@/lib/cn";

type Item = { to: string; label: string; icon: IconName; adminOnly?: boolean };

const ITEMS: Item[] = [
  { to: "/sell", label: "Sell", icon: "sell" },
  { to: "/reprints", label: "Reprints", icon: "reprints" },
  { to: "/products", label: "Products", icon: "products", adminOnly: true },
  { to: "/customers", label: "Customers", icon: "customers", adminOnly: true },
  { to: "/dashboard", label: "Dashboard", icon: "dashboard", adminOnly: true },
  { to: "/end-of-day", label: "End of day", icon: "endday", adminOnly: true },
  { to: "/reports", label: "Reports", icon: "reports", adminOnly: true },
  { to: "/settings", label: "Settings", icon: "settings", adminOnly: true },
];

export function NavRail() {
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const isAdmin = user?.role === "admin";
  const items = ITEMS.filter((i) => !i.adminOnly || isAdmin);

  return (
    <nav className="flex w-56 shrink-0 flex-col border-r border-ink/5 bg-tape px-4 py-6">
      {/* Brand */}
      <div className="mb-8 flex items-center gap-2.5 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-ledger text-tape">
          <Icon name="store" size={20} />
        </div>
        <span className="font-sans text-lg font-semibold text-ink">CounterTop</span>
      </div>

      <div className="flex flex-1 flex-col gap-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-ledger/40",
                isActive
                  ? "bg-ledger text-tape shadow-soft"
                  : "text-ink/55 hover:bg-leaf hover:text-ledger-deep"
              )
            }
          >
            <Icon name={item.icon} size={20} />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </div>

      {/* User + logout */}
      <div className="mt-4 border-t border-ink/5 pt-4">
        <div className="mb-2 flex items-center gap-3 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-leaf text-sm font-semibold text-ledger-deep">
            {user?.name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-ink">{user?.name}</div>
            <div className="text-xs capitalize text-ink/40">{user?.role}</div>
          </div>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-stamp transition-colors hover:bg-stamp/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-stamp/40"
        >
          <Icon name="logout" size={20} />
          Log out
        </button>
      </div>
    </nav>
  );
}
