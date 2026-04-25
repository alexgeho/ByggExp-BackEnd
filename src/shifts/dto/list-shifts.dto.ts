import { IsOptional, Matches } from 'class-validator';

export class ListShiftsDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be in YYYY-MM format' })
  month?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be in YYYY-MM-DD format' })
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be in YYYY-MM-DD format' })
  to?: string;

  @IsOptional()
  @Matches(/^[a-f\\d]{24}$/i, { message: 'projectId must be a valid ObjectId' })
  projectId?: string;

  @IsOptional()
  @Matches(/^[a-f\\d]{24}$/i, { message: 'workerId must be a valid ObjectId' })
  workerId?: string;
}
