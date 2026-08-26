// Shell: the nav rail plus routed screens. When no one is logged in, the whole
// app is the login screen (a counter machine always requires a fresh PIN).

import { Navigate, Route, Routes } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/store/sessionStore";
import { LoginScreen } from "@/auth/LoginScreen";
import { useIdleLock } from "@/auth/useIdleLock";
import { OnboardingWizard } from "@/auth/OnboardingWizard";
import { isAdminTier } from "@/auth/permissions";
import { getSettings } from "@/db/queries/settings";
import { NavRail } from "@/components/NavRail";
import { SellScreen } from "@/screens/Sell/SellScreen";
import { ReprintsScreen } from "@/screens/Reprints/ReprintsScreen";
import { ProductsScreen } from "@/screens/Products/ProductsScreen";
import { CustomersScreen } from "@/screens/Customers/CustomersScreen";
import { DashboardScreen } from "@/screens/Dashboard/DashboardScreen";
import { EndOfDayScreen } from "@/screens/EndOfDay/EndOfDayScreen";
import { ReportsScreen } from "@/screens/Reports/ReportsScreen";
import { SettingsScreen } from "@/screens/Settings/SettingsScreen";
import { TransfersScreen } from "@/screens/Transfers/TransfersScreen";
import { FinancialsScreen } from "@/screens/Financials/FinancialsScreen";
import { StockOverviewScreen } from "@/screens/Products/StockOverviewScreen";

export function App() {
  const user = useSession((s) => s.user);
  const canViewAdminArea = useSession((s) => s.can("view_admin_area"));
  const canViewFinancials = useSession((s) => s.can("view_financials"));
  const queryClient = useQueryClient();
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: getSettings });

  // Idle-lock only matters once someone is logged in; the hook itself no-ops
  // when the setting is 0, so it's cheap to always mount here.
  useIdleLock();

  if (!user) return <LoginScreen />;

  // Shown once, right after the first admin-tier login on a fresh install.
  // Gated to admin-tier so the demo cashier account (seed.ts) never gets
  // stuck behind a wizard only an owner/admin should complete.
  if (settings && settings.onboarding_complete !== "1" && isAdminTier(user.role)) {
    return (
      <OnboardingWizard
        onComplete={() => queryClient.invalidateQueries({ queryKey: ["settings"] })}
      />
    );
  }

  return (
    <div className="flex h-screen bg-paper text-ink">
      <NavRail />
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/sell" element={<SellScreen />} />
          <Route path="/reprints" element={<ReprintsScreen />} />
          {canViewAdminArea && <Route path="/products" element={<ProductsScreen />} />}
          {canViewAdminArea && <Route path="/stock" element={<StockOverviewScreen />} />}
          {canViewAdminArea && <Route path="/customers" element={<CustomersScreen />} />}
          {canViewAdminArea && <Route path="/dashboard" element={<DashboardScreen />} />}
          {canViewAdminArea && <Route path="/end-of-day" element={<EndOfDayScreen />} />}
          {canViewAdminArea && <Route path="/transfers" element={<TransfersScreen />} />}
          {canViewAdminArea && <Route path="/reports" element={<ReportsScreen />} />}
          {canViewFinancials && <Route path="/financials" element={<FinancialsScreen />} />}
          {canViewAdminArea && <Route path="/settings" element={<SettingsScreen />} />}
          <Route path="*" element={<Navigate to="/sell" replace />} />
        </Routes>
      </main>
    </div>
  );
}
