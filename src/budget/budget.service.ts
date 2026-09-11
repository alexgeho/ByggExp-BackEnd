import { ForbiddenException, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { UserRole } from "../users/schemas/user.schema";
import { SaveBudgetDto } from "./dto/save-budget.dto";
import { Budget, BudgetDocument } from "./schemas/budget.schema";

type AuthUser = { role: UserRole; companyId?: string | null; userId?: string };

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
const emptyMonths = () => Array.from({ length: 12 }, () => ({ income: 0, expense: 0 }));

@Injectable()
export class BudgetService {
  constructor(
    @InjectModel(Budget.name) private model: Model<BudgetDocument>,
  ) {}

  private resolveCompanyId(user: AuthUser): string {
    if (!user.companyId) {
      throw new ForbiddenException("Your account is not attached to a company");
    }
    return user.companyId;
  }

  // Return the plan for a year, or an empty 12-month plan when none saved yet.
  async getYear(user: AuthUser, year: number) {
    const companyId = this.resolveCompanyId(user);
    const doc = await this.model.findOne({ companyId, year }).lean().exec();
    const months = emptyMonths();
    for (let i = 0; i < 12; i += 1) {
      const m = doc?.months?.[i];
      if (m) {
        months[i] = { income: round2(m.income), expense: round2(m.expense) };
      }
    }
    return { year, months };
  }

  // Upsert the whole 12-month plan for a year.
  async save(user: AuthUser, dto: SaveBudgetDto) {
    const companyId = this.resolveCompanyId(user);
    const months = emptyMonths();
    (dto.months || []).slice(0, 12).forEach((m, i) => {
      months[i] = { income: round2(m?.income ?? 0), expense: round2(m?.expense ?? 0) };
    });
    await this.model.updateOne(
      { companyId, year: dto.year },
      { $set: { months } },
      { upsert: true },
    );
    return { year: dto.year, months };
  }
}
