import { IsArray, IsOptional, IsString } from "class-validator";

export class CreateProjektkalkylDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  note?: string;

  // Flexible board layout (tables → columns/rows). Validated shallowly; the
  // admin app owns the shape. Stored as-is.
  @IsOptional()
  @IsArray()
  tables?: Record<string, unknown>[];
}

export class UpdateProjektkalkylDto extends CreateProjektkalkylDto {}
