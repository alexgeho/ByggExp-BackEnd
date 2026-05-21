import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CompleteShiftDto {
  @IsString()
  @IsOptional()
  reason?: string;

  @IsString()
  @IsOptional()
  source?: string;

  @IsBoolean()
  @IsOptional()
  notifyUser?: boolean;
}
