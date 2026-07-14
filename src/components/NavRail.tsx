// Persistent left nav rail (pos-prd.md §9.5). 80px, ledger background, line icons +
// labels. Cashiers see only Sell and Reprints. Brand mark on top, active user chip
// and logout pinned at the bottom.

import { NavLink } from "react-router-dom";
import { useSession } from "@/store/sessionStore";
import { Icon, type IconName } from "./Icon";
import { cn } from "@/lib/cn";

type Item = { to: string; label: string; icon: IconName; adminOnly?: boolean };

const ITEMS: Item[] = [
  { to: "/sell", label: "Sell", icon: "sell" },
  { to: "/reprints", label: "Reprints", icon: "reprints" },
  { to: "/products", label: "Products", icon: "products", adminOnly: true },
  { to: "/dashboard", label: "Dashboard", icon: "dashboard", adminOnly: true },
  { to: "/end-of-day", label: "End day", icon: "endday", adminOnly: true },
  { to: "/reports", label: "Reports", icon: "reports", adminOnly: true },
  { to: "/settings", label: "Settings", icon: "settings", adminOnly: true },
];

export function NavRail() {
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const isAdmin = user?.role === "admin";
  const items = ITEMS.filter((i) => !i.adminOnly || isAdmin);

  return (
    <nav className="flex w-20 shrink-0 flex-col items-center bg-ledger py-4 text-tape">
      {/* Brand mark */}
      <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-tape/10 text-tape">
        <Icon name="store" size={22} />
      </div>

      <div className="flex flex-1 flex-col gap-1.5">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                "group relative flex w-16 flex-col items-center gap-1 rounded-xl py-2.5 text-[11px] font-medium transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-tape/70",
                isActive ? "bg-tape/15 text-tape" : "text-tape/70 hover:bg-tape/10 hover:text-tape"
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* active accent bar */}
                <span
                  className={cn(
                    "absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-brass transition-opacity",
                    isActive ? "opacity-100" : "opacity-0"
                  )}
                />
                <Icon name={item.icon} size={22} />
                <span>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>

      <div className="mt-3 flex flex-col items-center gap-2 border-t border-tape/15 pt-3">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full bg-tape/15 text-sm font-semibold"
          title={`${user?.name ?? ""} (${user?.role ?? ""})`}
        >
          {user?.name?.[0]?.toUpperCase() ?? "?"}
        </div>
        <button
          onClick={logout}
          className="flex flex-col items-center gap-0.5 rounded-lg py-1 text-[11px] text-tape/70 transition-colors hover:text-tape focus:outline-none focus-visible:ring-2 focus-visible:ring-tape/70"
        >
          <Icon name="logout" size={18} />
          Log out
        </button>
      </div>
    </nav>
  );
}
