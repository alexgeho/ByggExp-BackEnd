import { UserRole } from "../../users/schemas/user.schema";

/**
 * Capability catalog. Guards check these instead of hard-coded roles, so the
 * owner can delegate a capability (e.g. finance.manage) to any user without
 * changing their role. Namespaced `domain.action`, extend as needed.
 */
export const PERMISSIONS = {
  FINANCE_MANAGE: "finance.manage", // offers, invoices, clients
  SHIFTS_VIEW_ALL: "shifts.viewAll", // see all company shifts/hours
  SHIFTS_EXPORT: "shifts.export", // Excel / PDF export of hours
  SHIFTS_BILLING_SOURCE: "shifts.billingSource", // pick Planned/GPS/Manual for billing
  PROJECTS_MANAGE: "projects.manage",
  TASKS_MANAGE: "tasks.manage",
  EMPLOYEES_MANAGE: "employees.manage",
  TOOLS_MANAGE: "tools.manage",
  COMPANY_MANAGE: "company.manage", // company settings, subscription, admins
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: PermissionKey[] = Object.values(PERMISSIONS);

/**
 * Default permission set per role. companyAdmin/superadmin get everything;
 * projectAdmin gets project-scoped management + shift viewing/export (scope is
 * still enforced by companyId/project filters in the queries — permissions gate
 * access, they don't widen tenant isolation). worker gets none of these admin
 * capabilities.
 */
export const PERMISSION_DEFAULTS_BY_ROLE: Record<string, PermissionKey[]> = {
  [UserRole.SuperAdmin]: ALL_PERMISSIONS,
  [UserRole.CompanyAdmin]: ALL_PERMISSIONS,
  [UserRole.ProjectAdmin]: [
    PERMISSIONS.SHIFTS_VIEW_ALL,
    PERMISSIONS.SHIFTS_EXPORT,
    PERMISSIONS.PROJECTS_MANAGE,
    PERMISSIONS.TASKS_MANAGE,
    PERMISSIONS.EMPLOYEES_MANAGE,
    PERMISSIONS.TOOLS_MANAGE,
  ],
  [UserRole.Worker]: [],
};

type PermissionOverrides = { granted?: string[]; revoked?: string[] } | null;

/** Effective permissions = defaults(role) ∪ granted − revoked. */
export function getEffectivePermissions(
  role: UserRole | string | undefined,
  overrides?: PermissionOverrides,
): Set<string> {
  const defaults = PERMISSION_DEFAULTS_BY_ROLE[role as string] || [];
  const granted = overrides?.granted || [];
  const revoked = new Set(overrides?.revoked || []);
  return new Set([...defaults, ...granted].filter((p) => !revoked.has(p)));
}

type AuthUser = {
  role?: UserRole | string;
  permissions?: PermissionOverrides;
};

/** True if the user has the capability (superadmin always passes). */
export function userHasPermission(
  user: AuthUser | undefined,
  permission: string,
): boolean {
  if (!user) return false;
  if (user.role === UserRole.SuperAdmin) return true;
  return getEffectivePermissions(user.role, user.permissions).has(permission);
}
