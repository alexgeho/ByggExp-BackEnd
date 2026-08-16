import {
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from "class-validator";
import { ContentReportReason } from "../schemas/content-report.schema";

export class CreateReportDto {
  @IsMongoId()
  reportedUserId: string;

  @IsOptional()
  @IsMongoId()
  chatId?: string;

  @IsOptional()
  @IsMongoId()
  messageId?: string;

  @IsEnum(ContentReportReason)
  reason: ContentReportReason;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
