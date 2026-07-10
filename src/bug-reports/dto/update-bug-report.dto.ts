import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import { BugReportStatus } from '../schemas/bug-report.schema';

export class UpdateBugReportDto {
  @IsString()
  @IsOptional()
  message?: string;

  @IsEnum(BugReportStatus)
  @IsOptional()
  status?: BugReportStatus;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  removeAttachment?: boolean;
}
