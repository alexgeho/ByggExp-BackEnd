import { IsArray, IsOptional, IsString } from "class-validator";

// Per-user capability overrides set by an owner/company admin. Values are
// validated against the catalog in the service; anything unknown is dropped.
export class SetUserPermissionsDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  granted?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  revoked?: string[];
}
