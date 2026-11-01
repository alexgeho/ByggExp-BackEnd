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
    expect(resolveModules({ plan: "egenkontroll" }).enabled).not.toContain(
      "avvik",
    );
  });

  it("a company trimmed to egenkontroll by overrides does not get avvik", () => {
    const allOff = Object.fromEntries(
      [
        "map",
        "tasks",
        "dagbok",
        "shifts",
        "schedule",
        "bemanning",
        "leave",
        "users",
        "clients",
        "tools",
      ].map((k) => [k, false]),
    );
    const r = resolveModules({ plan: "projekt", moduleOverrides: allOff });
    expect(r.enabled).toContain("kma");
    expect(r.enabled).not.toContain("avvik");
    // No plan + everything but kma/projects switched off → same.
    const none = resolveModules({
      plan: null,
      moduleOverrides: {
        map: false,
        tasks: false,
        dagbok: false,
        shifts: false,
        schedule: false,
        bemanning: false,
        leave: false,
        users: false,
        offers: false,
        invoices: false,
        planning: false,
        budget: false,
        "supplier-invoices": false,
        expenses: false,
        payroll: false,
        profitability: false,
        projektkalkyl: false,
        clients: false,
        articles: false,
        tools: false,
        audit: false,
      },
    });
    expect(none.enabled).not.toContain("avvik");
    // Explicitly switched on → on; one other module left on → avvik stays.
    expect(
      resolveModules({
        plan: "projekt",
        moduleOverrides: { ...allOff, avvik: true },
      }).enabled,
    ).toContain("avvik");
    expect(
      resolveModules({
        plan: "projekt",
        moduleOverrides: { ...allOff, tasks: true },
      }).enabled,
    ).toContain("avvik");
  });

  it("no plan still means every module", () => {
    expect(resolveModules({ plan: null }).enabled).toContain("invoices");
  });
});
