import { IsEnum } from 'class-validator';
import { BugReportStatus } from '../schemas/bug-report.schema';

export class UpdateBugReportStatusDto {
  @IsEnum(BugReportStatus)
  status: BugReportStatus;
}
