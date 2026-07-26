import { IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';

export class SaveAdjustmentDto {
  @Matches(/^[a-f\d]{24}$/i, { message: 'projectId must be a valid ObjectId' })
  projectId: string;

  @Matches(/^[a-f\d]{24}$/i, { message: 'workerId must be a valid ObjectId' })
  workerId: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be in YYYY-MM-DD format' })
  date: string;

  @IsNumber()
  @Min(0)
  plannedHours: number;

  @IsOptional()
  @IsString()
  note?: string;
}
