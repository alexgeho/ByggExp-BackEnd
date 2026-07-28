import { IsIn, IsNumber, IsOptional, IsString } from "class-validator";
import { AtaStatus, AtaType } from "../schemas/ata.schema";

export class UpdateAtaDto {
  @IsOptional()
  @IsIn(Object.values(AtaType))
  type?: AtaType;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsNumber()
  amount?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  attachmentUrl?: string | null;

  @IsOptional()
  @IsIn(Object.values(AtaStatus))
  status?: AtaStatus;
}
