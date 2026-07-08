import { IsOptional, IsString } from 'class-validator';

export class CreateBugReportDto {
  @IsString()
  @IsOptional()
  message?: string;

  @IsString()
  @IsOptional()
  attachmentUrl?: string;

  @IsString()
  @IsOptional()
  attachmentName?: string;

  @IsString()
  @IsOptional()
  attachmentMimeType?: string;
}
