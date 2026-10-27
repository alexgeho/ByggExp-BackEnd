import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { computeManualItems } from "./payroll-math";
import { PayrollService } from "./payroll.service";
import { PayrollStatus } from "./schemas/payroll-run.schema";
import { buildPayslipHtml } from "./templates/payslip-pdf.template";
import { buildAgiXml } from "./agi";

// The service imports the PDF launcher (ESM puppeteer); not used here.
jest.mock("../invoices/puppeteer-launch", () => ({
  launchForInvoicePdf: jest.fn(),
}));

describe("computeManualItems", () => {
  it("prices hour rows at their timlön (factor 1) and adds fixed amounts", () => {
    const m = computeManualItems(
      [
        { type: "normal", hours: 160, rate: 200 },
        { type: "overtime", hours: 10, rate: 300 },
        { type: "ob", hours: 5 }, // falls back to the worker's timlön
        { type: "other", label: "Bonus", amount: 1000 },
      ],
      220,
    );
    expect(m.items.map((i) => i.amount)).toEqual([32000, 3000, 1100, 1000]);
    expect(m.items.every((i) => i.multiplier === 1)).toBe(true);
    expect(m.hours).toBe(175);
    expect(m.rate).toBe(200);
    expect(m.hourType).toBe("mixed");
    expect(m.gross).toBe(37100);
  });

  it("handles a månadslön only, drops empty and unknown rows", () => {
    const m = computeManualItems(
      [
        { type: "monthly", amount: 32000 },
        { type: "normal", hours: 0, rate: 200 },
        { type: "other", amount: 0 },
        { type: "bogus", amount: 5 },
      ],
      0,
    );
    expect(m.items).toHaveLength(1);
    expect(m).toMatchObject({
      hours: 0,
      rate: 0,
      hourType: "monthly",
      gross: 32000,
    });
  });

  it("lets an other row reduce gross (löneavdrag)", () => {
    const m = computeManualItems(
      [
        { type: "monthly", amount: 30000 },
        { type: "other", label: "Avdrag", amount: -500.5 },
      ],
      0,
    );
    expect(m.gross).toBe(29499.5);
  });
});

// ---- PayrollService with in-memory models ---------------------------------

// Chainable stand-in for a mongoose query.
const q = <T>(value: T) => {
  const chain = {
    select: () => chain,
    lean: () => chain,
    sort: () => chain,
    exec: () => Promise.resolve(value),
  };
  return chain;
};

const COMPANY = "c1";
const users = [
  {
    _id: "u1",
    name: "Anna",
    hourlyRate: 200,
    taxTable: null,
    taxColumn: null,
    personalNumber: "820225-2386",
  },
  {
    _id: "u2",
    name: "Bo",
    hourlyRate: null,
    taxTable: 31,
    taxColumn: 1,
    personalNumber: "199001011234",
  },
];

function setup(company: Record<string, unknown> = { plan: "faktura" }) {
  const saved: any[] = [];
  class FakeRun {
    [k: string]: any;
    constructor(data: Record<string, unknown>) {
      Object.assign(this, data);
    }
    set(data: Record<string, unknown>) {
      Object.assign(this, data);
    }
    save() {
      if (!saved.includes(this)) saved.push(this);
      return Promise.resolve(this);
    }
  }
  const payrollModel: any = FakeRun;
  payrollModel.findById = (id: string) =>
    q(saved.find((r) => r._id === id) || null);
  payrollModel.find = () => q(saved);

  const userModel = {
    find: (filter: { _id: { $in: string[] }; companyId: string }) =>
      q(
        filter.companyId === COMPANY
          ? users.filter((u) => filter._id.$in.includes(u._id))
          : [],
      ),
    findById: () =>
      q({ name: "Ägare", email: "a@x.se", phoneNumber: 707575757 }),
  };
  const companyModel = {
    findById: () =>
      q({ _id: COMPANY, orgNumber: "559303-7566", name: "Firma", ...company }),
  };
  const projectModel = { find: () => q([]) };
  // Table 31 col 1: a fixed amount for any gross, to tell it from 30 %.
  const taxTableService = {
    lookupMonthlyTax: (table?: number | null) =>
      Promise.resolve(table === 31 ? 9000 : null),
  };
  const service = new PayrollService(
    payrollModel,
    userModel as any,
    companyModel as any,
    projectModel as any,
    taxTableService as any,
  );
  return { service, saved };
}

const admin = { role: "companyAdmin" as any, companyId: COMPANY, userId: "a1" };

const dto = {
  periodFrom: "2026-10-01",
  periodTo: "2026-10-31",
  employees: [
    {
      userId: "u1",
      items: [
        { type: "normal", hours: 160 },
        { type: "overtime", hours: 10, rate: 300 },
      ],
    },
    { userId: "u2", items: [{ type: "monthly", amount: 32000 }] },
  ],
};

describe("PayrollService manual runs", () => {
  it("creates a manual draft with tax per worker and run totals", async () => {
    const { service } = setup();
    const run: any = await service.createManual(dto, admin);
    expect(run).toMatchObject({
      companyId: COMPANY,
      basis: "manual",
      status: PayrollStatus.Draft,
      taxRate: 30,
      employerRate: 31.42,
    });
    const [anna, bo] = run.lines;
    // Anna: 160 h × 200 (stored timlön) + 10 h × 300, flat 30 %.
    expect(anna).toMatchObject({
      hours: 170,
      rate: 200,
      amount: 35000,
      tax: 10500,
      net: 24500,
    });
    expect(anna.items).toHaveLength(2);
    // Bo: månadslön, tax from table 31.
    expect(bo).toMatchObject({
      hours: 0,
      amount: 32000,
      tax: 9000,
      net: 23000,
    });
    expect(run.totalGross).toBe(67000);
    expect(run.totalTax).toBe(19500);
    expect(run.totalNet).toBe(47500);
    expect(run.totalHours).toBe(170);
    expect(run.employerContribution).toBe(21051.4);
    expect(run.totalEmployerCost).toBe(88051.4);
  });

  it("needs the payroll module, not shifts", async () => {
    await expect(
      setup({ plan: "projekt" }).service.createManual(dto, admin),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      setup({
        plan: "faktura",
        moduleOverrides: { payroll: false },
      }).service.createManual(dto, admin),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects workers from another company, duplicates and empty runs", async () => {
    const { service } = setup();
    await expect(
      service.createManual(
        { ...dto, employees: [{ userId: "x9", items: [] }] },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createManual(
        { ...dto, employees: [dto.employees[1], dto.employees[1]] },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createManual(
        {
          ...dto,
          employees: [{ userId: "u1", items: [{ type: "normal", hours: 0 }] }],
        },
        admin,
      ),
    ).rejects.toThrow("Enter hours or an amount");
    await expect(
      service.createManual(
        {
          ...dto,
          employees: [
            { userId: "u1", items: [{ type: "other", amount: -100 }] },
          ],
        },
        admin,
      ),
    ).rejects.toThrow("cannot be negative");
    await expect(
      service.createManual(
        { ...dto, periodFrom: "2026-11-01", periodTo: "2026-10-31" },
        admin,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("edits a manual draft only", async () => {
    const { service, saved } = setup();
    const run: any = await service.createManual(dto, admin);
    run._id = "r1";
    const edited: any = await service.updateManual(
      "r1",
      {
        ...dto,
        employees: [
          { userId: "u2", items: [{ type: "monthly", amount: 30000 }] },
        ],
      },
      admin,
    );
    expect(edited.lines).toHaveLength(1);
    expect(edited.totalGross).toBe(30000);
    expect(saved).toHaveLength(1);

    run.status = PayrollStatus.Approved;
    await expect(service.updateManual("r1", dto, admin)).rejects.toThrow(
      "Only a draft",
    );
    run.status = PayrollStatus.Draft;
    run.basis = "planned";
    await expect(service.updateManual("r1", dto, admin)).rejects.toThrow(
      "Only manual",
    );
  });

  it("feeds AGI exactly like a run from the hours grid", async () => {
    const { service } = setup();
    const run: any = await service.createManual(dto, admin);
    run.status = PayrollStatus.Approved;
    const { input, problems, summary } = await service.agi("202610", admin);
    expect(problems).toEqual([]);
    expect(summary).toMatchObject({
      runs: 1,
      employees: 2,
      gross: 67000,
      tax: 19500,
    });
    const xml = buildAgiXml(input);
    expect(xml).toContain('<agd:KontantErsattningUlagAG faltkod="011">35000<');
    expect(xml).toContain('<agd:AvdrPrelSkatt faltkod="001">9000<');
  });

  it("prints every row on the payslip", async () => {
    const { service } = setup();
    const run: any = await service.createManual(dto, admin);
    const html = buildPayslipHtml({ line: run.lines[0], taxRate: 30 });
    expect(html).toContain("Arbetad tid");
    expect(html).toContain("Övertid");
    expect(html).toContain("35");
    const monthly = buildPayslipHtml({ line: run.lines[1] });
    expect(monthly).toContain("Månadslön");
    // Old runs without rows keep the single "Arbetad tid" row.
    const old = buildPayslipHtml({
      line: { hours: 10, rate: 200, multiplier: 1, amount: 2000 },
    });
    expect(old.match(/Arbetad tid/g)).toHaveLength(1);
    expect(old).not.toContain("Övertid");
  });
});
