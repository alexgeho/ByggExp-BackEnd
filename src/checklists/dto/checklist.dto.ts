import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import {
  ChecklistCategory,
  ChecklistItemResult,
} from "../schemas/checklist.enums";

export class ChecklistItemSuggestionDto {
  @IsOptional()
  @IsIn(Object.values(ChecklistItemResult))
  result?: ChecklistItemResult;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsNumber()
  confidence?: number;

  @IsOptional()
  @IsIn(["pending", "auto", "accepted", "rejected"])
  state?: "pending" | "auto" | "accepted" | "rejected";
}

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

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  photoUrls?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => ChecklistItemSuggestionDto)
  suggestion?: ChecklistItemSuggestionDto | null;
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

  @IsOptional()
  @IsObject()
  sourceDocument?: { url: string; name: string };
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

export class SuggestionDecisionDto {
  @IsBoolean()
  accept: boolean;
}
