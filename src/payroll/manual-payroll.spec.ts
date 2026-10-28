/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return -- in-memory model doubles */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { computeManualItems } from "./payroll-math";
import { PayrollService } from "./payroll.service";
import { ENTERED_BASIS, PayrollStatus } from "./schemas/payroll-run.schema";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import {
  CreatePayrollRunDto,
  ManualPayrollRunDto,
} from "./dto/create-payroll-run.dto";
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
  {
    _id: "u3",
    name: "Cia",
    hourlyRate: 250,
    taxTable: null,
    taxColumn: null,
    personalNumber: "",
    erasedAt: new Date("2026-10-20"),
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
  // Mimics the guarded update: matches only while every filter field holds.
  payrollModel.findOneAndUpdate = (
    filter: Record<string, unknown>,
    update: { $set: Record<string, unknown> },
  ) => {
    const run = saved.find((r) =>
      Object.entries(filter).every(([k, v]) => r[k] === v),
    );
    if (run) Object.assign(run, update.$set);
    return q(run || null);
  };

  const userModel = {
    find: (filter: {
      _id: { $in: string[] };
      companyId: string;
      $or?: [unknown, { _id: { $in: string[] } }];
    }) =>
      q(
        filter.companyId === COMPANY
          ? users.filter(
              (u) =>
                filter._id.$in.includes(u._id) &&
                (!u.erasedAt || !!filter.$or?.[1]._id.$in.includes(u._id)),
            )
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
      basis: ENTERED_BASIS,
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
    // A run from the hours grid in its "manual" measure is not editable here.
    run.status = PayrollStatus.Draft;
    run.basis = "manual";
    await expect(service.updateManual("r1", dto, admin)).rejects.toThrow(
      "Only manual",
    );
  });

  it("returns 409 when the run is approved between read and write", async () => {
    const { service, saved } = setup();
    const run: any = await service.createManual(dto, admin);
    run._id = "r1";
    // Someone approves while this edit computes its lines.
    const orig = (service as any).buildManualLines.bind(service);
    (service as any).buildManualLines = async (...args: unknown[]) => {
      const out = await orig(...args);
      saved[0].status = PayrollStatus.Approved;
      return out;
    };
    await expect(service.updateManual("r1", dto, admin)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(saved[0].totalGross).toBe(67000);
  });

  it("keeps an erased worker editable in a draft that already has them", async () => {
    const { service } = setup();
    const withCia = {
      ...dto,
      employees: [{ userId: "u3", items: [{ type: "normal", hours: 10 }] }],
    };
    // New run: an erased worker cannot be added.
    await expect(service.createManual(withCia, admin)).rejects.toThrow(
      "Unknown worker",
    );
    const run: any = await service.createManual(dto, admin);
    run._id = "r1";
    run.lines.push({ userId: "u3", name: "Cia" });
    const edited: any = await service.updateManual("r1", withCia, admin);
    expect(edited.lines[0]).toMatchObject({ userId: "u3", amount: 2500 });
  });

  it("rejects hour rows without a timlön", async () => {
    const { service } = setup();
    await expect(
      service.createManual(
        {
          ...dto,
          employees: [{ userId: "u2", items: [{ type: "normal", hours: 8 }] }],
        },
        admin,
      ),
    ).rejects.toThrow("Hourly rate is missing (Bo)");
  });

  it("keeps a run within one month", async () => {
    const { service } = setup();
    await expect(
      service.createManual(
        { ...dto, periodFrom: "2026-09-25", periodTo: "2026-10-05" },
        admin,
      ),
    ).rejects.toThrow("one month");
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

describe("payroll status", () => {
  it("never leaves paid, and only reopen turns approved into draft", async () => {
    const { service } = setup();
    const run: any = await service.createManual(dto, admin);
    run._id = "r1";
    await service.setStatus("r1", admin, PayrollStatus.Approved);
    await expect(
      service.setStatus("r1", admin, PayrollStatus.Draft),
    ).rejects.toThrow("Use reopen");
    const reopened: any = await service.reopen("r1", admin);
    expect(reopened).toMatchObject({ status: "draft", approvedAt: null });

    await service.setStatus("r1", admin, PayrollStatus.Paid);
    for (const s of [PayrollStatus.Draft, PayrollStatus.Approved]) {
      await expect(service.setStatus("r1", admin, s)).rejects.toThrow(
        "paid payroll run cannot be changed",
      );
    }
    await expect(service.reopen("r1", admin)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe("payroll DTOs", () => {
  const id = "65f000000000000000000001";
  const errors = (cls: any, body: unknown) =>
    validateSync(plainToInstance(cls, body)).map((e) => e.property);
  const ok = {
    periodFrom: "2026-10-01",
    periodTo: "2026-10-31",
    employees: [{ userId: id, items: [{ type: "monthly", amount: 30000 }] }],
  };

  it("validates a manual run", () => {
    expect(errors(ManualPayrollRunDto, ok)).toEqual([]);
    expect(
      errors(ManualPayrollRunDto, { ...ok, periodTo: "2026-02-30" }),
    ).toEqual(["periodTo"]);
    expect(
      errors(ManualPayrollRunDto, { ...ok, periodFrom: "2026-10-01T00:00" }),
    ).toEqual(["periodFrom"]);
    expect(
      errors(ManualPayrollRunDto, {
        ...ok,
        employees: [{ userId: "u1", items: [] }],
      }),
    ).toEqual(["employees"]);
    expect(
      errors(ManualPayrollRunDto, {
        ...ok,
        employees: Array.from({ length: 501 }, () => ok.employees[0]),
      }),
    ).toEqual(["employees"]);
    expect(
      errors(ManualPayrollRunDto, {
        ...ok,
        employees: [
          {
            userId: id,
            items: Array.from({ length: 51 }, () => ({
              type: "other",
              amount: 1,
            })),
          },
        ],
      }),
    ).toEqual(["employees"]);
  });

  it("accepts the hours grid's manual measure and keeps its factor", async () => {
    expect(
      errors(CreatePayrollRunDto, {
        periodFrom: "2026-10-01",
        periodTo: "2026-10-31",
        basis: "manual",
        lines: [{ userId: "u1", hours: 10, multiplier: 1.5, hourType: "ob" }],
      }),
    ).toEqual([]);
    const { service } = setup();
    const run: any = await service.create(
      {
        periodFrom: "2026-10-01",
        periodTo: "2026-10-31",
        basis: "manual",
        lines: [{ userId: "u1", hours: 10, multiplier: 1.5, hourType: "ob" }],
      },
      admin,
    );
    expect(run.basis).toBe("manual");
    expect(run.lines[0]).toMatchObject({
      multiplier: 1.5,
      hourType: "ob",
      amount: 3000,
    });
  });
});
