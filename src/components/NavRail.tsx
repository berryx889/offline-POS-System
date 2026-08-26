// Left sidebar (SiMi Shop style): white surface, brand at the top, nav items as
// icon+label rows, the active item a solid green pill. Cashiers see only Sell and
// Reprints. User chip + logout pinned at the bottom.

import { NavLink } from "react-router-dom";
import { useSession } from "@/store/sessionStore";
import { ROLE_LABELS, type Permission } from "@/auth/permissions";
import { logAudit } from "@/db/queries/audit";
import { Icon, type IconName } from "./Icon";
import { cn } from "@/lib/cn";

type Item = { to: string; label: string; icon: IconName; requires?: Permission };

const ITEMS: Item[] = [
  { to: "/sell", label: "Sell", icon: "sell" },
  { to: "/reprints", label: "Reprints", icon: "reprints" },
  { to: "/products", label: "Products", icon: "products", requires: "view_admin_area" },
  { to: "/stock", label: "Stock overview", icon: "products", requires: "view_admin_area" },
  { to: "/customers", label: "Customers", icon: "customers", requires: "view_admin_area" },
  { to: "/dashboard", label: "Dashboard", icon: "dashboard", requires: "view_admin_area" },
  { to: "/end-of-day", label: "End of day", icon: "endday", requires: "view_admin_area" },
  { to: "/transfers", label: "Transfers", icon: "transfer", requires: "view_admin_area" },
  { to: "/reports", label: "Reports", icon: "reports", requires: "view_admin_area" },
  { to: "/financials", label: "Financials", icon: "dashboard", requires: "view_financials" },
  { to: "/settings", label: "Settings", icon: "settings", requires: "view_admin_area" },
];

export function NavRail() {
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const can = useSession((s) => s.can);
  const items = ITEMS.filter((i) => !i.requires || can(i.requires));

  function doLogout() {
    if (user) logAudit(user.id, "logout", {});
    logout();
  }

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
            <div className="text-xs text-ink/40">{user && ROLE_LABELS[user.role]}</div>
          </div>
        </div>
        <button
          onClick={doLogout}
          className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium text-stamp transition-colors hover:bg-stamp/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-stamp/40"
        >
          <Icon name="logout" size={20} />
          Log out
        </button>
      </div>
    </nav>
  );
}
