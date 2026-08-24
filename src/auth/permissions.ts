// Granular role/permission model (v4). Every role has a sensible default
// permission set; a user's `permissions` column (JSON) can override individual
// keys without inventing a new role for every combination a shop wants.

import type { Role, User } from "@/db/queries/users";

export type Permission =
  | "sell"
  | "print"
  | "delete_product"
  | "change_price"
  | "export_reports"
  | "refund"
  | "stock_adjustment"
  | "manage_employees"
  | "manage_settings"
  | "approve_transfers"
  | "view_financials"
  | "view_admin_area"; // gates the admin-only nav items as a group

export const ALL_PERMISSIONS: Permission[] = [
  "sell",
  "print",
  "delete_product",
  "change_price",
  "export_reports",
  "refund",
  "stock_adjustment",
  "manage_employees",
  "manage_settings",
  "approve_transfers",
  "view_financials",
  "view_admin_area",
];

export const PERMISSION_LABELS: Record<Permission, string> = {
  sell: "Sell",
  print: "Print receipts",
  delete_product: "Delete products",
  change_price: "Change prices / overrides",
  export_reports: "Export reports",
  refund: "Refunds & voids",
  stock_adjustment: "Stock adjustments",
  manage_employees: "Manage employees",
  manage_settings: "Manage settings",
  approve_transfers: "Approve stock transfers",
  view_financials: "View financial dashboard",
  view_admin_area: "View admin area",
};

const ADMIN_TIER: Record<Permission, boolean> = {
  sell: true,
  print: true,
  delete_product: true,
  change_price: true,
  export_reports: true,
  refund: true,
  stock_adjustment: true,
  manage_employees: true,
  manage_settings: true,
  approve_transfers: true,
  view_financials: true,
  view_admin_area: true,
};

const CASHIER_TIER: Record<Permission, boolean> = {
  sell: true,
  print: true,
  delete_product: false,
  change_price: false,
  export_reports: false,
  refund: false,
  stock_adjustment: false,
  manage_employees: false,
  manage_settings: false,
  approve_transfers: false,
  view_financials: false,
  view_admin_area: false,
};

const MANAGER_TIER: Record<Permission, boolean> = {
  ...CASHIER_TIER,
  refund: true,
  change_price: true,
  export_reports: true,
  stock_adjustment: true,
  approve_transfers: true,
  view_financials: true,
  view_admin_area: true,
};

const SUPERVISOR_TIER: Record<Permission, boolean> = {
  ...CASHIER_TIER,
  refund: true,
  stock_adjustment: true,
  view_admin_area: true,
};

export const ROLE_DEFAULTS: Record<Role, Record<Permission, boolean>> = {
  super_admin: ADMIN_TIER,
  owner: ADMIN_TIER,
  admin: ADMIN_TIER,
  manager: MANAGER_TIER,
  supervisor: SUPERVISOR_TIER,
  cashier: CASHIER_TIER,
};

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  supervisor: "Supervisor",
  cashier: "Cashier",
};

export const ALL_ROLES: Role[] = ["super_admin", "owner", "admin", "manager", "supervisor", "cashier"];

/** Roles with a 6-digit PIN (everyone but cashier, pos-prd.md §2 extended). */
export function pinLengthFor(role: Role): number {
  return role === "cashier" ? 4 : 6;
}

const ADMIN_TIER_ROLES = new Set<Role>(["super_admin", "owner", "admin"]);

/** True for the three "senior" roles. Narrow on purpose — prefer `can()` with a
 *  specific permission everywhere except the handful of spots that genuinely
 *  mean "admin-tier role" itself (e.g. who can be picked for a PIN override). */
export function isAdminTier(role: Role): boolean {
  return ADMIN_TIER_ROLES.has(role);
}

function parseOverrides(
  permissions: string | null | undefined
): Partial<Record<Permission, boolean>> {
  if (!permissions) return {};
  try {
    return JSON.parse(permissions) as Partial<Record<Permission, boolean>>;
  } catch {
    return {};
  }
}

/** Does `user` have `permission`? Checks their per-user override first (set in
 *  Settings > Users), then falls back to their role's default. */
export function can(
  user: Pick<User, "role" | "permissions"> | null | undefined,
  permission: Permission
): boolean {
  if (!user) return false;
  const overrides = parseOverrides(user.permissions);
  const override = overrides[permission];
  return override ?? ROLE_DEFAULTS[user.role][permission];
}
