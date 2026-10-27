import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import {
  LedgerVerification,
  LedgerVerificationDocument,
  LedgerYear,
  LedgerYearDocument,
} from "./schemas/ledger.schema";
import { decodeSie, ledgerBalances, parseSie, sieProblems } from "./sie.import";

type AuthUser = { companyId?: string | null };

const companyOf = (user: AuthUser) => {
  if (!user.companyId) {
    throw new ForbiddenException("Your account is not attached to a company");
  }
  return String(user.companyId);
};

@Injectable()
export class LedgerService {
  constructor(
    @InjectModel(LedgerYear.name) private yearModel: Model<LedgerYearDocument>,
    @InjectModel(LedgerVerification.name)
    private verModel: Model<LedgerVerificationDocument>,
  ) {}

  // SIE4 file → one fiscal year (replaces that year if imported before).
  async importSie(user: AuthUser, buf: Buffer, fileName: string) {
    const companyId = companyOf(user);
    const sie = parseSie(decodeSie(buf));
    const problems = sieProblems(sie);
    if (problems.length) {
      throw new BadRequestException({ message: "Invalid SIE file", problems });
    }
    await this.yearModel.updateOne(
      { companyId, start: sie.start },
      {
        $set: {
          end: sie.end,
          accounts: sie.accounts,
          ib: sie.ib,
          source: fileName || "",
        },
      },
      { upsert: true },
    );
    await this.verModel.deleteMany({ companyId, yearStart: sie.start });
    await this.verModel.insertMany(
      sie.verifications.map((v) => ({ ...v, companyId, yearStart: sie.start })),
    );
    return {
      start: sie.start,
      end: sie.end,
      verifications: sie.verifications.length,
    };
  }

  async years(user: AuthUser) {
    const companyId = companyOf(user);
    return this.yearModel
      .find({ companyId }, { start: 1, end: 1, source: 1 })
      .sort({ start: -1 })
      .lean();
  }

  private async year(companyId: string, start: string) {
    const y = await this.yearModel.findOne({ companyId, start }).lean();
    if (!y) throw new NotFoundException("Year not found");
    return y;
  }

  async balances(user: AuthUser, start: string) {
    const companyId = companyOf(user);
    const y = await this.year(companyId, start);
    const vers = await this.verModel
      .find({ companyId, yearStart: start }, { trans: 1 })
      .lean();
    return ledgerBalances(y.accounts, y.ib, vers);
  }

  async verifications(user: AuthUser, start: string, account?: number) {
    const companyId = companyOf(user);
    const y = await this.year(companyId, start);
    const q: Record<string, unknown> = { companyId, yearStart: start };
    if (account) q["trans.account"] = account;
    const names = new Map(y.accounts.map((a) => [a.account, a.name]));
    const rows = await this.verModel
      .find(q, { series: 1, number: 1, date: 1, text: 1, trans: 1 })
      .sort({ date: 1, series: 1 })
      .lean();
    return rows.map((v) => ({
      ...v,
      trans: v.trans.map((t) => ({ ...t, name: names.get(t.account) || "" })),
    }));
  }
}
