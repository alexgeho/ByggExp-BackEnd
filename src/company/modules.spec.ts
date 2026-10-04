import { maxUsersForPlan } from "../billing/plans";
import { resolveModules } from "./modules";

describe("plan modules", () => {
  it("egenkontroll plan shows only projects + kma (plus core)", () => {
    const r = resolveModules({ plan: "egenkontroll" });
    expect(r.planModules).toEqual(["projects", "kma"]);
    expect(r.enabled).toContain("kma");
    expect(r.enabled).toContain("dashboard");
    expect(r.enabled).not.toContain("invoices");
    expect(r.enabled).not.toContain("shifts");
  });

  it("egenkontroll plan is a single seat", () => {
    expect(maxUsersForPlan("egenkontroll")).toBe(1);
  });

  it("no plan still means every module", () => {
    expect(resolveModules({ plan: null }).enabled).toContain("invoices");
  });
});
