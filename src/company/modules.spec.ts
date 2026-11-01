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

  it("avvik is in Kontroll på jobben (projekt) and Full (komplett), not Faktura/solo", () => {
    expect(resolveModules({ plan: "projekt" }).enabled).toContain("avvik");
    expect(resolveModules({ plan: "komplett" }).enabled).toContain("avvik");
    expect(resolveModules({ plan: "faktura" }).enabled).not.toContain("avvik");
    expect(resolveModules({ plan: "egenkontroll" }).enabled).not.toContain("avvik");
  });

  it("no plan still means every module", () => {
    expect(resolveModules({ plan: null }).enabled).toContain("invoices");
  });
});
