import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import ExcelJS from "exceljs";
import { Model } from "mongoose";
import { Company, CompanyDocument } from "../company/schemas/company.schema";
import { Expense, ExpenseDocument } from "../expenses/schemas/expense.schema";
import { launchForInvoicePdf } from "../invoices/puppeteer-launch";
import { Project, ProjectDocument } from "../projects/schemas/project.schema";
import { User, UserDocument, UserRole } from "../users/schemas/user.schema";
import { buildKorjournal, KorjournalReport } from "./korjournal";
import { Shift, ShiftDocument } from "./schemas/shift.schema";
import { ShiftsService } from "./shifts.service";
import { buildKorjournalHtml } from "./templates/korjournal-pdf.template";

type AuthUser = Parameters<ShiftsService["buildAccessibleShiftFilter"]>[0];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const OBJECT_ID = /^[a-f\d]{24}$/i;

export type KorjournalResult = KorjournalReport & {
  workerId: string;
  workerName: string;
  companyName: string;
  carRegNumber: string;
  carCo2GPerKm: number | null;
  from: string;
  to: string;
};

// Körjournal for one worker over a period: built from the same shifts that
// feed payroll (travelKm / trips), so the report and Bilersättning agree.
@Injectable()
export class KorjournalService {
  constructor(
    @InjectModel(Shift.name) private readonly shiftModel: Model<ShiftDocument>,
    @InjectModel(Project.name)
    private readonly projectModel: Model<ProjectDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Company.name)
    private readonly companyModel: Model<CompanyDocument>,
    @InjectModel(Expense.name)
    private readonly expenseModel: Model<ExpenseDocument>,
    private readonly shiftsService: ShiftsService,
  ) {}

  async get(
    user: AuthUser,
    workerIdParam: string | undefined,
    from: string,
    to: string,
  ): Promise<KorjournalResult> {
    if (!DATE.test(from || "") || !DATE.test(to || "") || from > to) {
      throw new BadRequestException("from/to must be YYYY-MM-DD, from ≤ to");
    }
    // A worker only ever gets their own körjournal.
    const isWorkerOnly = user.role === UserRole.Worker;
    const workerId = isWorkerOnly ? user.userId : workerIdParam;
    if (!workerId || !OBJECT_ID.test(workerId)) {
      throw new BadRequestException("workerId is required");
    }

    const access = await this.shiftsService.buildAccessibleShiftFilter(user, {
      workerId,
    });
    const shifts = await this.shiftModel
      .find({
        $and: [access, { workerId, shiftDate: { $gte: from, $lte: to } }],
      })
      .select("shiftDate projectId projectNameSnapshot travelKm trips")
      .lean()
      .exec();

    const projectIds = [
      ...new Set(
        shifts
          .map((s) => s.projectId)
          .filter(Boolean)
          .map(String),
      ),
    ];
    const [projects, worker] = await Promise.all([
      this.projectModel
        .find({ _id: { $in: projectIds } })
        .select("location")
        .lean()
        .exec(),
      this.userModel
        .findById(workerId)
        .select("name companyId carRegNumber carCo2GPerKm")
        .lean()
        .exec(),
    ]);
    const addressById = new Map(
      projects.map((p) => [String(p._id), p.location || ""]),
    );
    const company = worker?.companyId
      ? await this.companyModel
          .findById(worker.companyId)
          .select("name")
          .lean()
          .exec()
      : null;

    // Receipts the worker filed on the days with trips (fuel, parking …).
    const tripDates = [...new Set(shifts.map((s) => s.shiftDate))];
    const receipts = tripDates.length
      ? await this.expenseModel
          .find({
            userId: workerId,
            date: { $in: tripDates },
            ...(user.companyId ? { companyId: user.companyId } : {}),
          })
          .select("amount")
          .lean()
          .exec()
      : [];
    const receiptsTotal = receipts.reduce(
      (sum, r) => sum + (Number(r.amount) || 0),
      0,
    );

    const co2 = worker?.carCo2GPerKm ?? null;
    const report = buildKorjournal(
      shifts.map((s) => ({
        ...s,
        projectId: s.projectId && String(s.projectId),
      })),
      (id) => (id ? addressById.get(id) || "" : ""),
      co2,
      receiptsTotal,
    );
    return {
      ...report,
      workerId,
      workerName: worker?.name || "",
      companyName: company?.name || "",
      carRegNumber: worker?.carRegNumber || "",
      carCo2GPerKm: co2,
      from,
      to,
    };
  }

  async pdf(
    user: AuthUser,
    workerId: string | undefined,
    from: string,
    to: string,
  ) {
    const data = await this.get(user, workerId, from, to);
    const html = buildKorjournalHtml({
      ...data,
      generatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
    });
    const browser = await launchForInvoicePdf();
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      return {
        data,
        file: Buffer.from(
          await page.pdf({ format: "A4", printBackground: true }),
        ),
      };
    } finally {
      await browser.close();
    }
  }

  async xlsx(
    user: AuthUser,
    workerId: string | undefined,
    from: string,
    to: string,
  ) {
    const data = await this.get(user, workerId, from, to);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Körjournal");
    ws.addRow([`Körjournal — ${data.workerName}`]).font = {
      bold: true,
      size: 14,
    };
    ws.addRow([
      `Reg.nr ${data.carRegNumber || "—"} · ${data.from} – ${data.to}`,
    ]);
    ws.addRow([]);
    const showCo2 = data.totalCo2Kg !== null;
    const header = ws.addRow([
      "Datum",
      "Från",
      "Till",
      "Ärende",
      "Mätare start",
      "Mätare slut",
      "Km",
      ...(showCo2 ? ["CO₂ kg"] : []),
    ]);
    header.font = { bold: true };
    for (const r of data.rows) {
      ws.addRow([
        r.date,
        r.from,
        r.to,
        r.purpose,
        r.odometerStart,
        r.odometerEnd,
        r.km,
        ...(showCo2 ? [r.co2Kg] : []),
      ]);
    }
    ws.addRow([
      "Totalt",
      "",
      "",
      "",
      "",
      "",
      data.totalKm,
      ...(showCo2 ? [data.totalCo2Kg] : []),
    ]).font = { bold: true };
    [12, 28, 28, 28, 13, 13, 10, 10].forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });
    return {
      data,
      file: Buffer.from(await wb.xlsx.writeBuffer()),
    };
  }
}
