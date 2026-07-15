// Shell: the nav rail plus routed screens. When no one is logged in, the whole
// app is the login screen (a counter machine always requires a fresh PIN).

import { Navigate, Route, Routes } from "react-router-dom";
import { useSession } from "@/store/sessionStore";
import { LoginScreen } from "@/auth/LoginScreen";
import { NavRail } from "@/components/NavRail";
import { SellScreen } from "@/screens/Sell/SellScreen";
import { ReprintsScreen } from "@/screens/Reprints/ReprintsScreen";
import { ProductsScreen } from "@/screens/Products/ProductsScreen";
import { CustomersScreen } from "@/screens/Customers/CustomersScreen";
import { DashboardScreen } from "@/screens/Dashboard/DashboardScreen";
import { EndOfDayScreen } from "@/screens/EndOfDay/EndOfDayScreen";
import { ReportsScreen } from "@/screens/Reports/ReportsScreen";
import { SettingsScreen } from "@/screens/Settings/SettingsScreen";

export function App() {
  const user = useSession((s) => s.user);
  const isAdmin = user?.role === "admin";

  if (!user) return <LoginScreen />;

  return (
    <div className="flex h-screen bg-paper text-ink">
      <NavRail />
      <main className="flex-1 overflow-auto">
        <Routes>
          <Route path="/sell" element={<SellScreen />} />
          <Route path="/reprints" element={<ReprintsScreen />} />
          {isAdmin && <Route path="/products" element={<ProductsScreen />} />}
          {isAdmin && <Route path="/customers" element={<CustomersScreen />} />}
          {isAdmin && <Route path="/dashboard" element={<DashboardScreen />} />}
          {isAdmin && <Route path="/end-of-day" element={<EndOfDayScreen />} />}
          {isAdmin && <Route path="/reports" element={<ReportsScreen />} />}
          {isAdmin && <Route path="/settings" element={<SettingsScreen />} />}
          <Route path="*" element={<Navigate to="/sell" replace />} />
        </Routes>
      </main>
    </div>
  );
}
