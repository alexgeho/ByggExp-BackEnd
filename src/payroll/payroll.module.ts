import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../users/schemas/user.schema';
import { Company, CompanySchema } from '../company/schemas/company.schema';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { TaxTableService } from './tax-table.service';
import { PayrollRun, PayrollRunSchema } from './schemas/payroll-run.schema';
import { Shift, ShiftSchema } from '../shifts/schemas/shift.schema';
import {
  LeaveRequest,
  LeaveRequestSchema,
} from '../leave/schemas/leave-request.schema';
import {
  AgreementRuleSet,
  AgreementRuleSetSchema,
} from './schemas/agreement-rule-set.schema';
import {
  PayrollSettings,
  PayrollSettingsSchema,
} from './schemas/payroll-settings.schema';
import { WageBasisController } from './wage-basis.controller';
import { WageBasisService } from './wage-basis.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PayrollRun.name, schema: PayrollRunSchema },
      { name: User.name, schema: UserSchema },
      { name: Company.name, schema: CompanySchema },
      { name: Shift.name, schema: ShiftSchema },
      { name: LeaveRequest.name, schema: LeaveRequestSchema },
      { name: AgreementRuleSet.name, schema: AgreementRuleSetSchema },
      { name: PayrollSettings.name, schema: PayrollSettingsSchema },
    ]),
  ],
  controllers: [PayrollController, WageBasisController],
  providers: [PayrollService, TaxTableService, WageBasisService],
  exports: [PayrollService],
})
export class PayrollModule {}
