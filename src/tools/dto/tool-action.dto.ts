import { IsIn, IsOptional, IsString } from "class-validator";

// Hand a tool over to a person and/or move it to a project.
export class HandoffToolDto {
  @IsOptional()
  @IsString()
  toUserId?: string; // null/empty = return to storage (unassigned)

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class InspectToolDto {
  @IsOptional()
  @IsIn(["ok", "needs_service", "broken"])
  condition?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  nextInspectionDate?: string;
}
