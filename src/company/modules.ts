// Module visibility (feature flags) for the admin panel.
//
// The effective set of modules a company sees is: the preset for its plan tier,
// adjusted by any per-company superadmin overrides. Core modules are always on
// and cannot be hidden. This is the single source of truth — the admin app asks
// the API for the resolved list rather than duplicating the matrix.

// Always available, never toggleable.
export const CORE_MODULES = [
  "dashboard",
  "approvals",
  "my-tasks",
  "profile",
  "billing",
  "modules", // the "customize menu" page itself
];

// Everything a superadmin can switch on/off. Keys match the sidebar item keys.
export const TOGGLEABLE_MODULES = [
  "projects",
  "tasks",
  "dagbok",
  "kma",
  "shifts",
  "schedule",
  "bemanning",
  "leave",
  "users",
  "offers",
  "invoices",
  "supplier-invoices",
  "expenses",
  "payroll",
  "profitability",
  "clients",
  "articles",
  "tools",
  "audit",
];

// What each plan tier includes by default. Tiers match billing/plans.ts.
const START = [
  "projects",
  "tasks",
  "shifts",
  "schedule",
  "bemanning",
  "users",
  "clients",
  "tools",
];

const TILLVAXT = [
  ...START,
  "leave",
  "dagbok",
  "offers",
  "invoices",
  "articles",
  "expenses",
];

const PROFESSIONELL = [...TOGGLEABLE_MODULES];

export const PLAN_MODULES: Record<string, string[]> = {
  start: START,
  tillvaxt: TILLVAXT,
  professionell: PROFESSIONELL,
};

// Companies with no assigned plan (trials, legacy) get everything by default —
// hiding is opt-in via overrides, so nothing breaks for existing tenants.
const planBaseline = (plan?: string | null): string[] =>
  plan && PLAN_MODULES[plan] ? PLAN_MODULES[plan] : TOGGLEABLE_MODULES;

export interface ModuleResolution {
  plan: string | null;
  planModules: string[];
  overrides: Record<string, boolean>;
  enabled: string[];
}

export function resolveModules(company: {
  plan?: string | null;
  moduleOverrides?: Record<string, boolean> | null;
}): ModuleResolution {
  const base = planBaseline(company.plan);
  const overrides = company.moduleOverrides || {};
  const enabledToggleable = TOGGLEABLE_MODULES.filter((key) =>
    key in overrides ? Boolean(overrides[key]) : base.includes(key),
  );
  return {
    plan: company.plan ?? null,
    planModules: base,
    overrides,
    enabled: [...CORE_MODULES, ...enabledToggleable],
  };
}

// Keep only recognised, non-core keys so callers can't smuggle junk into the
// stored overrides map.
export function sanitizeOverrides(
  input: Record<string, unknown> | null | undefined,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  if (!input || typeof input !== "object") return out;
  for (const key of TOGGLEABLE_MODULES) {
    if (key in input && input[key] !== null && input[key] !== undefined) {
      out[key] = Boolean(input[key]);
    }
  }
  return out;
}
