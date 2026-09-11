import { IsArray, IsOptional, IsString } from "class-validator";

export class CreateProjektkalkylDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  projectId?: string | null;

  // Flexible board layout (tables → columns/rows). Validated shallowly; the
  // admin app owns the shape. Stored as-is.
  @IsOptional()
  @IsArray()
  tables?: Record<string, unknown>[];
}

export class UpdateProjektkalkylDto extends CreateProjektkalkylDto {}
