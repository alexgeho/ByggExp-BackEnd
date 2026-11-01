import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import {
  DeviationCategory,
  DeviationSeverity,
  DeviationStatus,
} from "../schemas/deviation.schema";

export class DeviationSourceDto {
  @IsIn(["checklist", "dagbok"])
  type: "checklist" | "dagbok";

  @IsString()
  @IsNotEmpty()
  id: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  itemIndex?: number;
}

export class CreateDeviationDto {
  @IsString()
  @IsNotEmpty()
  projectId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsIn(Object.values(DeviationCategory))
  category?: DeviationCategory;

  @IsOptional()
  @IsIn(Object.values(DeviationSeverity))
  severity?: DeviationSeverity;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string;

  // Managers only (ignored for workers).
  @IsOptional()
  @IsString()
  responsibleUserId?: string | null;

  // YYYY-MM-DD. Managers only.
  @IsOptional()
  @IsString()
  dueDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  cause?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  correctiveAction?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeviationSourceDto)
  source?: DeviationSourceDto;
}

export class UpdateDeviationDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsIn(Object.values(DeviationCategory))
  category?: DeviationCategory;

  @IsOptional()
  @IsIn(Object.values(DeviationSeverity))
  severity?: DeviationSeverity;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  location?: string;

  @IsOptional()
  @IsString()
  responsibleUserId?: string | null;

  @IsOptional()
  @IsString()
  dueDate?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  cause?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  correctiveAction?: string;

  // open ⇄ in_progress here; closing/reopening via their own endpoints.
  @IsOptional()
  @IsIn([DeviationStatus.Open, DeviationStatus.InProgress])
  status?: DeviationStatus;
}

export class CloseDeviationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  closingComment: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  correctiveAction?: string;
}

export class ReopenDeviationDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  comment?: string;
}
