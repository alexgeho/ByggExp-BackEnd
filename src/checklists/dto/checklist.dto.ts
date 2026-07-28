import { Type } from "class-transformer";
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import {
  ChecklistCategory,
  ChecklistItemResult,
} from "../schemas/checklist.enums";

export class ChecklistItemDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsIn(Object.values(ChecklistItemResult))
  result?: ChecklistItemResult;

  @IsOptional()
  @IsString()
  comment?: string;
}

export class CreateChecklistDto {
  @IsString()
  projectId: string;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsIn(Object.values(ChecklistCategory))
  category?: ChecklistCategory;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  responsible?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  items?: ChecklistItemDto[];
}

export class UpdateChecklistDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsIn(Object.values(ChecklistCategory))
  category?: ChecklistCategory;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  responsible?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDto)
  items?: ChecklistItemDto[];
}

export class SignChecklistDto {
  @IsOptional()
  @IsString()
  signedByName?: string;
}
